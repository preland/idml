import { describe, it, expect, afterAll } from 'vitest';
import { measure, measureDom, findChromium, closeBrowser, type Measured } from './measure';

// Browser zoom maps to scaling the layout viewport at a CONSTANT aspect ratio
// (e.g. 150% zoom on a 1440×900 window → a 960×600 layout viewport). So a page
// is "zoom-invariant" iff every element occupies the SAME FRACTION of the
// viewport at two different sizes of the same aspect ratio.
//
// That is exactly true when all sizing is viewport-relative (vw / vh / %), and
// FALSE the moment any px / rem (all Tailwind spacing, fixed icon px) sneaks in —
// those keep a constant px size, so their fraction of the viewport changes when
// the viewport does. This suite is the regression guard for that requirement.

const CHROMIUM = findChromium();
const ASPECT = { w: 1440, h: 900 };
const LARGE = { width: ASPECT.w, height: ASPECT.h };
const SMALL = { width: ASPECT.w * 0.65, height: ASPECT.h * 0.65 }; // ~154% "zoom"
const TOL = 0.006; // fraction-of-viewport tolerance (sub-pixel rounding)

afterAll(async () => {
  await closeBrowser();
});

function flatten(m: Measured): Measured[] {
  return [m, ...m.children.flatMap(flatten)];
}

/**
 * Render `source` at two same-aspect viewports and return, per node, the max
 * drift of its viewport-fraction geometry (x,y,w,h) between the two. A
 * zoom-invariant layout drifts ~0; any px/rem element drifts by ~its px size /
 * viewport.
 */
async function fractionDrift(
  source: string,
  resolve?: (p: string) => string
): Promise<{ maxDrift: number; worst: string }> {
  const opts = { exe: CHROMIUM!, resolve };
  const big = flatten(await measure(source, { ...opts, viewport: LARGE }));
  const small = flatten(await measure(source, { ...opts, viewport: SMALL }));
  expect(big.length).toBe(small.length);

  let maxDrift = 0;
  let worst = '';
  big.forEach((b, i) => {
    const s = small[i];
    const pairs: [string, number, number][] = [
      ['x', b.x / LARGE.width, s.x / SMALL.width],
      ['y', b.y / LARGE.height, s.y / SMALL.height],
      ['w', b.width / LARGE.width, s.width / SMALL.width],
      ['h', b.height / LARGE.height, s.height / SMALL.height],
    ];
    for (const [axis, bf, sf] of pairs) {
      const d = Math.abs(bf - sf);
      if (d > maxDrift) {
        maxDrift = d;
        worst = `node ${i} ${axis}: ${bf.toFixed(4)} vs ${sf.toFixed(4)}`;
      }
    }
  });
  return { maxDrift, worst };
}

/** Reusable assertion for use against real .isdw fixtures elsewhere. */
export async function assertZoomInvariant(source: string, resolve?: (p: string) => string): Promise<void> {
  const { maxDrift, worst } = await fractionDrift(source, resolve);
  expect(maxDrift, `largest zoom drift — ${worst}`).toBeLessThan(TOL);
}

describe.skipIf(!CHROMIUM)('zoom invariance', () => {
  it('a pure %/vw layout is zoom-invariant', async () => {
    await assertZoomInvariant(`
./p
Col()[100,100,top-left] {
Row()[30,100,top-left] {
Col()[100,40,top-left]{}
Col()[100,60,top-left]{}
}
Col()[70,100,top-left]{}
}
`);
  });

  it('a vw-font / vw-padding variant stays zoom-invariant', async () => {
    // Sizing expressed in vw (font size) keeps a constant fraction of the
    // viewport across zoom levels.
    await assertZoomInvariant(`
./p
Tile:Col { padding: 2vw }
Big:Text { fontSize: 3vw }
Col()[100,100,top-left] {
Tile()[40,100,top-left] {
Big("Hello")[100,100,top-left]{}
}
Col()[60,100,top-left]{}
}
`);
  });

  it('a vw border width stays a constant fraction of the viewport', async () => {
    const src = `
./p
Bordered:Col { borderLeftWidth: 0.5vw borderLeftStyle: solid }
Col()[100,100,top-left] {
Bordered()[100,100,top-left]{}
}
`;
    const read = (w: number) =>
      measureDom(src, { exe: CHROMIUM!, viewport: { width: w, height: 1000 } }, () => {
        return Math.max(
          ...Array.from(document.querySelectorAll('[data-isd-layout]')).map((el) =>
            parseFloat(getComputedStyle(el as HTMLElement).borderLeftWidth) || 0
          )
        );
      }) as Promise<number>;
    const big = await read(1000); // 0.5vw → 5px
    const small = await read(1600); // 0.5vw → 8px
    expect(big).toBeGreaterThan(0); // sanity: we actually measured the border
    // The FRACTION (px / viewport) is constant across sizes.
    expect(Math.abs(big / 1000 - small / 1600)).toBeLessThan(0.0005);
  });

  it('DETECTS a px border width as zoom-variant', async () => {
    const src = `
./p
PxBorder:Col { borderLeftWidth: 4px borderLeftStyle: solid }
Col()[100,100,top-left] {
PxBorder()[100,100,top-left]{}
}
`;
    const read = (w: number) =>
      measureDom(src, { exe: CHROMIUM!, viewport: { width: w, height: 1000 } }, () => {
        return Math.max(
          ...Array.from(document.querySelectorAll('[data-isd-layout]')).map((el) =>
            parseFloat(getComputedStyle(el as HTMLElement).borderLeftWidth) || 0
          )
        );
      }) as Promise<number>;
    const big = await read(1000);
    const small = await read(1600);
    // 4px stays 4px → its viewport fraction changes between sizes.
    expect(Math.abs(big / 1000 - small / 1600)).toBeGreaterThan(0.0005);
  });

  it('DETECTS a px size as zoom-variant (the test has teeth)', async () => {
    // A px-padded box keeps a constant px size, so its fraction of the viewport
    // changes between the two zoom levels — drift must exceed the tolerance.
    const { maxDrift } = await fractionDrift(`
./p
Padded:Col { padding: 40px }
Col()[100,100,top-left] {
Padded()[40,100,top-left] {
Text("x")[100,100,top-left]{}
}
Col()[60,100,top-left]{}
}
`);
    expect(maxDrift).toBeGreaterThan(TOL);
  });
});
