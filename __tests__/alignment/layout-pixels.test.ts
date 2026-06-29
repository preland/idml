import { describe, it, expect, afterAll } from 'vitest';
import { parseIdml } from '../../src/parser/idml-parser';
import type { LayoutDef } from '../../src/types';
import { measure, findChromium, closeBrowser, type Measured } from './measure';

// Empirical alignment regression suite. Renders the REAL renderer in a real
// Chromium and asserts the measured pixel box of every layout node equals the
// box implied by its declared cumulative percentages. This catches regressions
// the conversion tests can't — e.g. a renderer change that drops `flex-shrink:0`
// or wraps nodes in padded containers would silently break percentage fidelity
// while leaving `LayoutDef.size` untouched.
//
// Skips cleanly when no Chromium is available (e.g. minimal CI), so it never
// turns into a red build on machines without a browser.

const CHROMIUM = findChromium();
const VW = 1000;
const VH = 800; // intentionally != VW so an axis swap can't pass by luck
const TOL = 1; // px; flex with explicit %/no borders is near-exact

afterAll(async () => {
  await closeBrowser();
});

const pct = (v?: string) => (v ? Number(v.replace('%', '')) : undefined);

/** Pre-order list of the boxes each node *should* occupy, in px, derived purely
 *  from declared percentages against a fixed root box. */
function expectedBoxes(node: LayoutDef, w: number, h: number): { w: number; h: number }[] {
  const cw = pct(node.size?.width);
  const ch = pct(node.size?.height);
  const myW = cw === undefined ? w : (w * cw) / 100;
  const myH = ch === undefined ? h : (h * ch) / 100;
  const out = [{ w: myW, h: myH }];
  for (const child of node.children) out.push(...expectedBoxes(child, myW, myH));
  return out;
}

/** Pre-order flatten of the measured tree (same order as expectedBoxes). */
function flattenMeasured(m: Measured): Measured[] {
  return [m, ...m.children.flatMap(flattenMeasured)];
}

async function check(source: string): Promise<void> {
  const measured = await measure(source, { exe: CHROMIUM!, viewport: { width: VW, height: VH } });
  const root = parseIdml(source).pages[0].layout;
  const expected = expectedBoxes(root, VW, VH);
  const got = flattenMeasured(measured);

  expect(got.length).toBe(expected.length);
  got.forEach((node, i) => {
    expect(node.width, `node ${i} width`).toBeCloseTo(expected[i].w, 0);
    expect(Math.abs(node.width - expected[i].w)).toBeLessThanOrEqual(TOL);
    expect(Math.abs(node.height - expected[i].h)).toBeLessThanOrEqual(TOL);
  });
}

describe.skipIf(!CHROMIUM)('empirical alignment — rendered px match declared %', () => {
  it('tiles a column by height (20 / 30 / 50)', async () => {
    await check(`
./p
Col()[100,100,top-left] {
Col()[20,100,top-left]{}
Col()[30,100,top-left]{}
Col()[50,100,top-left]{}
}
`);
  });

  it('tiles a row by width (25 / 25 / 50)', async () => {
    await check(`
./p
Row()[100,100,top-left] {
Col()[100,25,top-left]{}
Col()[100,25,top-left]{}
Col()[100,50,top-left]{}
}
`);
  });

  it('honours fractional percentages (13.5 / 86.5)', async () => {
    await check(`
./p
Col()[100,100,top-left] {
Col()[13.5,100,top-left]{}
Col()[86.5,100,top-left]{}
}
`);
  });

  it('keeps percentages exact through deep mixed nesting', async () => {
    await check(`
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
  });

  it('out-of-flow Modal consumes no flow space (sibling fills 100%)', async () => {
    const measured = await measure(
      `
./p
Col()[100,100,top-left] {
Col()[100,100,top-left]{}
Modal(@state.open)[50,50,center] {
Text("hi")[100,100,top-left]{}
}
}
`,
      { exe: CHROMIUM!, viewport: { width: VW, height: VH } }
    );
    // root > inner Col[100,100] > [ in-flow Col(full), Modal(display:contents) ]
    const inner = measured.children[0];
    const inFlow = inner.children.find((c) => c.display !== 'contents');
    expect(inFlow, 'in-flow sibling should exist').toBeDefined();
    // It received the full viewport height — proof the Modal took no space.
    expect(Math.abs(inFlow!.height - VH)).toBeLessThanOrEqual(TOL);
    expect(Math.abs(inFlow!.width - VW)).toBeLessThanOrEqual(TOL);
  });
});

// Surface a clear note (rather than silent green) when the empirical suite is
// skipped for lack of a browser.
describe.runIf(!CHROMIUM)('empirical alignment', () => {
  it('SKIPPED: no Chromium found (set CHROMIUM_PATH to enable)', () => {
    expect(true).toBe(true);
  });
});
