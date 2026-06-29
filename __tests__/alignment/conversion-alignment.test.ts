import { describe, it, expect } from 'vitest';
import { parseIsdw } from '../../src/parser/isdw-parser';
import type { LayoutDef } from '../../src/types';

// NOTE: snippets are written flush-left (no indentation) so the strict
// 80-column rule isn't tripped by the leading whitespace of a template literal.
//
// These are the *conversion-level* alignment tests: they assert that the
// declared `[height%, width%]` of every element survives the parse → convert
// pipeline unchanged in `LayoutDef.size`, across the transformations that could
// silently corrupt it (definition expansion, slots, Table sugar, anchors,
// out-of-flow). They are fast (no browser) and form the first regression guard;
// the empirical pixel measurements live in `layout-pixels.test.ts`.

/** First page's root layout for a parsed source. */
function root(src: string): LayoutDef {
  return parseIsdw(src).pages[0].layout;
}

/** Depth-first list of every layout node (root included). */
function flatten(node: LayoutDef): LayoutDef[] {
  return [node, ...node.children.flatMap(flatten)];
}

/** The `[h%, w%]` a node declares, as a `{height,width}` pair of numbers. */
function dims(node: LayoutDef): { height?: number; width?: number } {
  const num = (v?: string) =>
    v === undefined ? undefined : Number(v.replace('%', ''));
  return { height: num(node.size?.height), width: num(node.size?.width) };
}

/**
 * Find the layout node that renders a given component type, by matching the
 * component id the converter assigns (ids are `<type-lowercase>-N`).
 */
function nodeForComponent(
  config: ReturnType<typeof parseIsdw>,
  page: number,
  type: string
): LayoutDef | undefined {
  const comp = config.pages[page].components.find((c) => c.type === type);
  if (!comp) return undefined;
  return flatten(config.pages[page].layout).find(
    (n) => n.componentId === comp.id
  );
}

describe('alignment — declared percentages are preserved verbatim', () => {
  it('keeps each child size in a column that tiles to 100%', () => {
    const r = root(`
./p
Col()[100,100,top-left] {
Col()[20,100,top-left]{}
Col()[30,100,top-left]{}
Col()[50,100,top-left]{}
}
`);
    // root(100/100) > Col(100/100) > three children
    const inner = r.children[0];
    expect(inner.children.map(dims)).toEqual([
      { height: 20, width: 100 },
      { height: 30, width: 100 },
      { height: 50, width: 100 },
    ]);
  });

  it('keeps each child width in a row that tiles to 100%', () => {
    const r = root(`
./p
Row()[100,100,top-left] {
Col()[100,25,top-left]{}
Col()[100,25,top-left]{}
Col()[100,50,top-left]{}
}
`);
    const inner = r.children[0];
    expect(inner.children.map((c) => dims(c).width)).toEqual([25, 25, 50]);
    expect(inner.children.map((c) => dims(c).height)).toEqual([100, 100, 100]);
  });

  it('preserves fractional percentages exactly (no rounding)', () => {
    const r = root(`
./p
Col()[100,100,top-left] {
Col()[13.5,100,top-left]{}
Col()[86.5,100,top-left]{}
}
`);
    const inner = r.children[0];
    expect(inner.children.map((c) => dims(c).height)).toEqual([13.5, 86.5]);
    // and as literal strings, so the renderer emits "13.5%" not "13%"
    expect(inner.children.map((c) => c.size?.height)).toEqual([
      '13.5%',
      '86.5%',
    ]);
  });

  it('preserves sizes through arbitrarily deep nesting', () => {
    const r = root(`
./p
Col()[100,100,top-left] {
Row()[40,100,top-left] {
Col()[100,30,top-left] {
Col()[60,100,top-left]{}
Col()[40,100,top-left]{}
}
Col()[100,70,top-left]{}
}
Row()[60,100,top-left]{}
}
`);
    // Navigate structurally so each level's split is checked exactly.
    const inner = r.children[0]; //          Col[100,100]
    const topRow = inner.children[0]; //     Row[40,100]
    const narrowCol = topRow.children[0]; // Col[100,30]
    expect(dims(topRow)).toEqual({ height: 40, width: 100 });
    expect(dims(narrowCol)).toEqual({ height: 100, width: 30 });
    expect(narrowCol.children.map((c) => dims(c).height)).toEqual([60, 40]);
    expect(dims(topRow.children[1])).toEqual({ height: 100, width: 70 });
    expect(dims(inner.children[1])).toEqual({ height: 60, width: 100 });
  });

  it('anchoring (center / corners) does not alter a node size', () => {
    // In flow, the cross axis must be filled (width 100 in a column); the anchor
    // only steers justify/align, never the declared size. Vary the anchor and
    // confirm the heights/widths are untouched.
    const r = root(`
./p
Col()[100,100,top-left] {
Col()[20,100,center]{}
Col()[30,100,bottom-right]{}
Col()[50,100,center-left]{}
}
`);
    const inner = r.children[0];
    expect(inner.children.map(dims)).toEqual([
      { height: 20, width: 100 },
      { height: 30, width: 100 },
      { height: 50, width: 100 },
    ]);
  });
});

describe('alignment — definition expansion preserves sizes', () => {
  it('uses the call-site dims on the wrapper, body dims inside', () => {
    const config = parseIsdw(`
./p
define Panel() {
Col()[25,100,top-left]{}
Col()[75,100,top-left]{}
}
Col()[100,100,top-left] {
Panel()[40,100,top-left]{}
Panel()[60,100,top-left]{}
}
`);
    const inner = config.pages[0].layout.children[0];
    // The two Panel() call sites become wrapper nodes carrying the call dims…
    expect(inner.children.map(dims)).toEqual([
      { height: 40, width: 100 },
      { height: 60, width: 100 },
    ]);
    // …and each expands its body with the body's own 25/75 split intact.
    for (const wrapper of inner.children) {
      expect(wrapper.children.map((c) => dims(c).height)).toEqual([25, 75]);
    }
  });

  it('preserves slot (Children) content sizes when threaded in', () => {
    const config = parseIsdw(`
./p
define Frame() {
Col()[100,100,top-left] {
Children()[100,100,top-left]{}
}
}
Frame()[100,100,top-left] {
Col()[35,100,top-left]{}
Col()[65,100,top-left]{}
}
`);
    // Find the two slotted columns anywhere in the tree.
    const all = flatten(config.pages[0].layout);
    const slotted = all.filter(
      (n) => dims(n).height === 35 || dims(n).height === 65
    );
    expect(slotted.map((n) => dims(n).height).sort((a, b) => a! - b!)).toEqual([
      35, 65,
    ]);
  });
});

describe('alignment — Table sugar preserves column widths', () => {
  it('keeps the table own dims and each column width', () => {
    const config = parseIsdw(`
./p
Col()[100,100,top-left] {
Table(@rows)[100,100,top-left] {
Column("A")[10,30,top-left]{
Text(@item.a)[100,100,top-left]{}
}
Column("B")[10,70,top-left]{
Text(@item.b)[100,100,top-left]{}
}
}
}
`);
    // The Table expands to a Col; its bound node keeps the declared 100/100.
    const all = flatten(config.pages[0].layout);
    // Column widths (30 / 70) must appear on the generated header + body cells.
    const widths = all
      .map((n) => dims(n).width)
      .filter((w) => w === 30 || w === 70);
    // header row has one 30 + one 70 cell; body row template another pair.
    expect(widths.filter((w) => w === 30).length).toBeGreaterThanOrEqual(2);
    expect(widths.filter((w) => w === 70).length).toBeGreaterThanOrEqual(2);
  });
});

describe('alignment — out-of-flow nodes take no flow space', () => {
  it('marks a Modal with display:contents while keeping siblings tiling', () => {
    const config = parseIsdw(`
./p
Col()[100,100,top-left] {
Col()[100,100,top-left]{}
Modal(@state.open)[50,50,center] {
Text("hi")[100,100,top-left]{}
}
}
`);
    const modal = nodeForComponent(config, 0, 'Modal');
    expect(modal).toBeDefined();
    // Out-of-flow ⇒ rendered with display:contents so it occupies no flow space.
    expect(modal!.isdwStyle?.display).toBe('contents');
    // The in-flow sibling still declares the full 100% it tiles to.
    const inner = config.pages[0].layout.children[0];
    const inFlow = inner.children.find(
      (c) => c.isdwStyle?.display !== 'contents'
    );
    expect(dims(inFlow!)).toEqual({ height: 100, width: 100 });
  });

  it('treats an out-of-flow definition the same way', () => {
    const config = parseIsdw(`
./p
define Chrome() {
Overlay()[100,100,top-left] {
Button("x", noop)[10,10,bottom-right]{}
}
Modal(@state.open)[40,40,center] {
Text("hi")[100,100,top-left]{}
}
}
Col()[100,100,top-left] {
Col()[100,100,top-left]{}
Chrome()[100,100,top-left]{}
}
`);
    // The Chrome() wrapper must render display:contents (no flow space), so the
    // 100%-tall body sibling is valid beside it.
    const inner = config.pages[0].layout.children[0];
    const chromeWrapper = inner.children.find(
      (c) => c.isdwStyle?.display === 'contents'
    );
    expect(chromeWrapper).toBeDefined();
  });
});
