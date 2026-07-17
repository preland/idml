import { describe, it, expect } from 'vitest';
import { parseIdmlWithSource } from '../../src/parser/idml-parser';
import { applyEdits, planEdit } from '../../src/parser/source-writer';

// Phase 2: surgical write-back. The strongest guarantee we can assert is that
// after applying a planned edit the file (a) contains the intended change, (b)
// leaves everything else byte-identical, and (c) STILL PARSES and reflects the
// edit. So most tests plan → apply → re-parse and check the new value.

// NOTE: snippets are flush-left so the 80-column rule isn't tripped.

// Sources are keyed by the SAME identifiers the parser emits on origins/variants:
// the entry's fileName, and each import path verbatim (e.g. "./styles.idml").
function reparse(sources: Record<string, string>, entryFile: string) {
  return parseIdmlWithSource(sources[entryFile], {
    fileName: entryFile,
    resolve: (p) => sources[p] ?? '',
  });
}

describe('applyEdits', () => {
  it('applies multiple edits in one file without offset drift', () => {
    const src = 'ABCDEFGHIJ';
    const out = applyEdits({ f: src }, [
      { file: 'f', start: 0, end: 1, text: 'aa' }, // A -> aa
      { file: 'f', start: 5, end: 6, text: 'f' }, // F -> f
    ]);
    expect(out.f).toBe('aaBCDEfGHIJ');
  });

  it('rejects overlapping edits', () => {
    expect(() =>
      applyEdits({ f: 'ABCDE' }, [
        { file: 'f', start: 0, end: 3, text: 'x' },
        { file: 'f', start: 2, end: 4, text: 'y' },
      ])
    ).toThrow(/overlapping/);
  });
});

describe('planEdit — literal text', () => {
  const source = `./test
Text("Old Title")[100,100,top-left]{}
`;
  it('rewrites a literal text arg in place', () => {
    const parse = parseIdmlWithSource(source, { fileName: 'p.idml' });
    const id = parse.config.pages[0].components.find((c) => c.type === 'Text')!.id;
    const plan = planEdit(parse, { componentId: id, prop: 'text', value: 'New Title' });
    expect(plan.target).toBe('direct');
    expect(plan.affects).toBe(1);
    const out = applyEdits({ 'p.idml': source }, plan.edits);
    expect(out['p.idml']).toContain('Text("New Title")');
    // Re-parse: the new value is what the config now carries.
    const re = parseIdmlWithSource(out['p.idml'], { fileName: 'p.idml' });
    const text = re.config.pages[0].components.find((c) => c.type === 'Text')!.props!.text;
    expect(text).toBe('New Title');
  });
});

describe('planEdit — dims', () => {
  const source = `./test
Col()[100,100,top-left]{
Text("A")[40,100,top-left]{}
Text("B")[60,100,top-left]{}
}
`;
  it('rewrites a height percentage', () => {
    const parse = parseIdmlWithSource(source, { fileName: 'p.idml' });
    const a = parse.config.pages[0].components.find(
      (c) => c.type === 'Text' && c.props!.text === 'A'
    )!;
    // Change A from 40 to 50 (and we must keep the page tiling valid: bump B to 50).
    const b = parse.config.pages[0].components.find(
      (c) => c.type === 'Text' && c.props!.text === 'B'
    )!;
    const plan1 = planEdit(parse, { componentId: a.id, prop: 'height', value: '50' });
    const plan2 = planEdit(parse, { componentId: b.id, prop: 'height', value: '50' });
    const out = applyEdits({ 'p.idml': source }, [...plan1.edits, ...plan2.edits]);
    expect(out['p.idml']).toContain('Text("A")[50,100,top-left]');
    expect(out['p.idml']).toContain('Text("B")[50,100,top-left]');
    // Still parses (tiling stays 100%).
    expect(() => parseIdmlWithSource(out['p.idml'], { fileName: 'p.idml' })).not.toThrow();
  });
});

describe('planEdit — variant className, mode "all"', () => {
  const styles = `Title:Text \`font-bold text-red-500\`
`;
  const entry = `import Title from "./styles.idml"
./test
Col()[100,100,top-left]{
Title("One")[50,100,top-left]{}
Title("Two")[50,100,top-left]{}
}
`;

  it('edits the shared variant and reports its usage count', () => {
    const parse = reparse({ 'entry.idml': entry, './styles.idml': styles }, 'entry.idml');
    const one = parse.config.pages[0].components.find((c) => c.props?.text === 'One')!;
    const plan = planEdit(parse, { componentId: one.id, prop: 'className', value: 'font-bold text-blue-600', mode: 'all' });
    expect(plan.target).toBe('variant');
    expect(plan.affects).toBe(2); // both Title uses
    expect(plan.edits[0].file).toBe('./styles.idml');
    const out = applyEdits({ 'entry.idml': entry, './styles.idml': styles }, plan.edits);
    expect(out['./styles.idml']).toContain('Title:Text `font-bold text-blue-600`');
    // Both components now carry the new class.
    const re = reparse({ 'entry.idml': out['entry.idml'], './styles.idml': out['./styles.idml'] }, 'entry.idml');
    for (const t of ['One', 'Two']) {
      const c = re.config.pages[0].components.find((x) => x.props?.text === t)!;
      expect(c.className).toContain('text-blue-600');
    }
  });
});

describe('planEdit — variant className, mode "clone"', () => {
  const styles = `Title:Text \`font-bold text-red-500\`
`;
  const entry = `import Title from "./styles.idml"
./test
Col()[100,100,top-left]{
Title("One")[50,100,top-left]{}
Title("Two")[50,100,top-left]{}
}
`;

  it('clones the variant and repoints only this component', () => {
    const parse = reparse({ 'entry.idml': entry, './styles.idml': styles }, 'entry.idml');
    const one = parse.config.pages[0].components.find((c) => c.props?.text === 'One')!;
    const plan = planEdit(parse, { componentId: one.id, prop: 'className', value: 'font-bold text-green-600', mode: 'clone' });
    expect(plan.target).toBe('variant-clone');
    expect(plan.affects).toBe(1);
    expect(plan.newVariantName).toBe('Title2');
    // Insert lands in styles.idml; repoint lands in entry.
    expect(plan.edits.some((e) => e.file === './styles.idml' && e.start === e.end)).toBe(true);
    expect(plan.edits.some((e) => e.file === 'entry.idml')).toBe(true);

    const out = applyEdits({ 'entry.idml': entry, './styles.idml': styles }, plan.edits);
    // Original variant is untouched; a new one exists.
    expect(out['./styles.idml']).toContain('Title:Text `font-bold text-red-500`');
    expect(out['./styles.idml']).toContain('Title2:Text `font-bold text-green-600`');
    // Only "One" moved to Title2 in the entry.
    expect(out['entry.idml']).toContain('Title2("One")');
    expect(out['entry.idml']).toContain('Title("Two")');

    // Re-parse: "One" has the new class, "Two" keeps the old.
    const re = reparse({ 'entry.idml': out['entry.idml'], './styles.idml': out['./styles.idml'] }, 'entry.idml');
    const cOne = re.config.pages[0].components.find((x) => x.props?.text === 'One')!;
    const cTwo = re.config.pages[0].components.find((x) => x.props?.text === 'Two')!;
    expect(cOne.className).toContain('text-green-600');
    expect(cOne.className).not.toContain('text-red-500');
    expect(cTwo.className).toContain('text-red-500');
  });
});
