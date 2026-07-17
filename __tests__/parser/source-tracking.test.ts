import { describe, it, expect } from 'vitest';
import { parseIdml, parseIdmlWithSource } from '../../src/parser/idml-parser';

// Phase 1 of the visual editor's round-trip support: parseIdmlWithSource returns
// an origin map linking each produced component id back to the exact source file
// + character spans it came from. The invariant under test throughout is that
// `source.slice(span.start, span.end)` recovers the authored text verbatim — the
// contract the (Phase 2) surgical writer relies on.

// NOTE: snippets are flush-left so the 80-column rule isn't tripped by leading
// template-literal whitespace.

/** The single origin whose captured name span is exactly `name`. */
function originByName(
  origins: Map<string, import('../../src/parser/idml-parser').ComponentOrigin>,
  source: string,
  name: string
) {
  for (const o of origins.values()) {
    if (o.spans.name && source.slice(o.spans.name.start, o.spans.name.end) === name) return o;
  }
  throw new Error(`no origin with name span "${name}"`);
}

describe('parseIdmlWithSource — direct item spans', () => {
  const source = `./test
Text("Hello")[100,100,top-left]{}
`;
  const { config, origins } = parseIdmlWithSource(source);

  it('produces the same component ids as parseIdml', () => {
    const plain = parseIdml(source);
    const plainIds = plain.pages[0].components.map((c) => c.id);
    const sourceIds = config.pages[0].components.map((c) => c.id);
    expect(sourceIds).toEqual(plainIds);
    // Every component has an origin entry.
    for (const id of sourceIds) expect(origins.has(id)).toBe(true);
  });

  it('captures name / text / dims spans that slice back to the source', () => {
    const o = originByName(origins, source, 'Text');
    expect(o.kind).toBe('direct');
    expect(o.file).toBe('<entry>');
    expect(source.slice(o.spans.name!.start, o.spans.name!.end)).toBe('Text');
    // text span is the string CONTENT, excluding the quotes.
    expect(source.slice(o.spans.text!.start, o.spans.text!.end)).toBe('Hello');
    expect(source.slice(o.spans.height!.start, o.spans.height!.end)).toBe('100');
    expect(source.slice(o.spans.width!.start, o.spans.width!.end)).toBe('100');
    expect(source.slice(o.spans.anchor!.start, o.spans.anchor!.end)).toBe('top-left');
  });

  it('honours the fileName option', () => {
    const r = parseIdmlWithSource(source, { fileName: 'users-page.idml' });
    const o = originByName(r.origins, source, 'Text');
    expect(o.file).toBe('users-page.idml');
  });

  it('adds no origins on the plain parseIdml path', () => {
    // Sanity: plain parse still returns a bare UIConfig (no throw, no origins).
    expect(parseIdml(source).pages).toHaveLength(1);
  });
});

describe('parseIdmlWithSource — comment offsets', () => {
  // A header comment block must NOT shift the spans of the code below it.
  const source = `# a header comment
# spanning two lines
./test
Text("Body")[100,100,top-left]{}
`;
  const { origins } = parseIdmlWithSource(source);

  it('spans still slice correctly past a header comment', () => {
    const o = originByName(origins, source, 'Text');
    expect(source.slice(o.spans.text!.start, o.spans.text!.end)).toBe('Body');
    expect(source.slice(o.spans.name!.start, o.spans.name!.end)).toBe('Text');
  });
});

describe('parseIdmlWithSource — define body items', () => {
  const source = `define Card(label) {
Text(label)[50,100,top-left]{}
Text("Footer")[50,100,top-left]{}
}
./test
Card("Hi")[100,100,top-left]{}
`;
  const { origins } = parseIdmlWithSource(source);

  it('marks components from an expanded define as kind "define" with in-define spans', () => {
    const o = originByName(origins, source, 'Text'); // first match = the "Footer"/label Text
    // Find the "Footer" literal specifically.
    let footer: import('../../src/parser/idml-parser').ComponentOrigin | undefined;
    for (const c of origins.values()) {
      if (c.spans.text && source.slice(c.spans.text.start, c.spans.text.end) === 'Footer') footer = c;
    }
    expect(footer).toBeDefined();
    expect(footer!.kind).toBe('define');
    expect(footer!.file).toBe('<entry>');
    expect(source.slice(footer!.spans.text!.start, footer!.spans.text!.end)).toBe('Footer');
    expect(o.kind).toBe('define');
  });
});

describe('parseIdmlWithSource — variant class origin', () => {
  const source = `Title:Text \`font-bold text-red-500\`
./test
Title("Hello")[100,100,top-left]{}
`;
  const { origins } = parseIdmlWithSource(source);

  it('points a variant-styled component at the variant class span', () => {
    // The component's own name span is the base type after variant resolution…
    let title: import('../../src/parser/idml-parser').ComponentOrigin | undefined;
    for (const o of origins.values()) if (o.variant === 'Title') title = o;
    expect(title).toBeDefined();
    expect(title!.variant).toBe('Title');
    expect(title!.classFile).toBe('<entry>');
    expect(source.slice(title!.classSpan!.start, title!.classSpan!.end)).toBe('font-bold text-red-500');
    // The literal label is still editable at the use site.
    expect(source.slice(title!.spans.text!.start, title!.spans.text!.end)).toBe('Hello');
  });
});

describe('parseIdmlWithSource — variant imported from another file', () => {
  const styles = `Title:Text \`font-bold text-red-500\`
`;
  const entry = `import Title from "./styles.idml"
./test
Title("Hi")[100,100,top-left]{}
`;
  const { origins } = parseIdmlWithSource(entry, {
    resolve: (p) => (p === './styles.idml' ? styles : ''),
  });

  it('resolves the class span into the IMPORTED file', () => {
    let title: import('../../src/parser/idml-parser').ComponentOrigin | undefined;
    for (const o of origins.values()) if (o.variant === 'Title') title = o;
    expect(title).toBeDefined();
    expect(title!.classFile).toBe('./styles.idml');
    // The span indexes into the imported file's source, not the entry's.
    expect(styles.slice(title!.classSpan!.start, title!.classSpan!.end)).toBe('font-bold text-red-500');
    // The item's own spans (use site) live in the entry file.
    expect(title!.file).toBe('<entry>');
    expect(entry.slice(title!.spans.text!.start, title!.spans.text!.end)).toBe('Hi');
  });
});
