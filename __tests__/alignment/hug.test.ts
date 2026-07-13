import { describe, it, expect, afterAll } from 'vitest';
import { parseIdml } from '../../src/parser/idml-parser';
import type { ComponentDef } from '../../src/types';
import { findChromium, closeBrowser } from './measure';

// The exact-fill sizing model has three trailing keywords:
//   fit | fit-w | fit-h    -> content-size the element, capped at its declared %
//                            (the % IS still reserved in the tiling sum; the box
//                            draws smaller and truncates with an ellipsis).
//   hug                    -> fill the REMAINING main-axis space (flex: 1 1 0),
//                            split equally with sibling `hug`s. (Was `grow`.)
//   fill | fill-w | fill-h -> cross-axis stretch (align-self: stretch).
// The retired keywords `grow`, `hug-w`, `hug-h` are now unknown-keyword errors.

const CHROMIUM = findChromium();

afterAll(async () => {
  await closeBrowser();
});

/** The ComponentDef of the first component of a given type on page 0. */
function comp(src: string, type: string): ComponentDef {
  const c = parseIdml(src).pages[0].components.find((x) => x.type === type);
  if (!c) throw new Error(`no ${type} component`);
  return c;
}

describe('fit — content-sizing conversion (leaf components)', () => {
  it('fit shrinks both axes and adds ellipsis overflow', () => {
    const b = comp(
      `
./p
Col()[100,100,top-left] {
Button("Create User", openCreate)[100,100,top-right,fit]{}
}
`,
      'Button'
    );
    expect(b.idmlStyle).toMatchObject({
      width: 'fit-content',
      maxWidth: '100%',
      minWidth: '0',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      height: 'fit-content',
      maxHeight: '100%',
    });
  });

  it('fit-w shrinks width only', () => {
    const b = comp(
      `
./p
Col()[100,100,top-left] {
Text("Admin")[100,100,top-left,fit-w]{}
}
`,
      'Text'
    );
    expect(b.idmlStyle).toMatchObject({ width: 'fit-content', textOverflow: 'ellipsis' });
    expect(b.idmlStyle?.height).toBeUndefined();
    expect(b.idmlStyle?.maxHeight).toBeUndefined();
  });

  it('fit-h shrinks height only', () => {
    const b = comp(
      `
./p
Col()[100,100,top-left] {
Button("X", noop)[100,100,top-left,fit-h]{}
}
`,
      'Button'
    );
    expect(b.idmlStyle).toMatchObject({ height: 'fit-content', maxHeight: '100%' });
    expect(b.idmlStyle?.width).toBeUndefined();
  });

  it('leaves the element’s tile (cell size) unchanged — the % is still reserved', () => {
    // The cell still occupies its declared 20%/100% so sibling tiling is intact;
    // fit only shrinks the drawn box within the cell.
    const config = parseIdml(`
./p
Row()[100,100,top-left] {
Spacer()[100,80,top-left]{}
Button("Create User", openCreate)[100,20,top-right,fit]{}
}
`);
    const row = config.pages[0].layout.children[0];
    const buttonCell = row.children[1];
    expect(buttonCell.size).toEqual({ height: '100%', width: '20%' });
  });

  it('works through a styled variant and definition expansion', () => {
    const config = parseIdml(`
./p
PrimaryButton:Button \`bg-blue-600 text-white rounded\`
define Bar() {
PrimaryButton("Create User", openCreate)[100,100,top-right,fit]{}
}
Col()[100,100,top-left] {
Bar()[100,100,top-left]{}
}
`);
    const btn = config.pages[0].components.find((c) => c.type === 'Button');
    expect(btn?.idmlStyle).toMatchObject({ width: 'fit-content', textOverflow: 'ellipsis' });
  });
});

describe('fit — the reserved % is counted in the tiling sum', () => {
  it('a fit main-% counts toward the tile (fit + fixed sibling fill exactly)', () => {
    expect(() =>
      parseIdml(`
./p
Col()[100,100,top-left] {
Text("head")[40,100,top-left,fit-h]{}
Spacer()[60,100,top-left]{}
}
`)
    ).not.toThrow();
  });

  it('a fit whose reserved % over-claims still throws', () => {
    expect(() =>
      parseIdml(`
./p
Col()[100,100,top-left] {
Text("head")[60,100,top-left,fit-h]{}
Spacer()[60,100,top-left]{}
}
`)
    ).toThrow(/over-claim/);
  });
});

describe('fit — container content-flow (children pack)', () => {
  it('a fit-h container keeps its size but drops its children’s main-axis size (they pack)', () => {
    const cfg = parseIdml(`
./p
Col()[100,100,top-left] {
Col()[100,100,top-left,fit-h] {
Text("a")[50,100,top-left]{}
Text("b")[50,100,top-left]{}
}
}
`);
    const outer = cfg.pages[0].layout.children[0];
    const section = outer.children[0];
    // The section keeps its own size; its children lose their height so they
    // size to content and pack (width — the cross axis — is retained).
    expect(section.size).toEqual({ height: '100%', width: '100%' });
    for (const child of section.children) {
      expect(child.size?.height).toBeUndefined();
      expect(child.size?.width).toBe('100%');
    }
  });

  it('a fit-h container is content-flow, so under-filling children are allowed', () => {
    // The children pack/flow inside the content-sized container, so they need
    // not tile to 100% — only over-claim is still rejected.
    expect(() =>
      parseIdml(`
./p
Col()[100,100,top-left] {
Col()[100,100,top-left,fit-h] {
Text("a")[10,100,top-left]{}
Text("b")[10,100,top-left]{}
}
}
`)
    ).not.toThrow();
  });

  it('a scrolling container is content-flow too (children stack + scroll)', () => {
    expect(() =>
      parseIdml(`
./p
ScrollCol:Col { overflowY: auto }
Col()[100,100,top-left] {
ScrollCol()[100,100,top-left] {
Text("a")[10,100,top-left]{}
Text("b")[10,100,top-left]{}
}
}
`)
    ).not.toThrow();
  });

  it('still enforces strict tiling for ordinary (definite) containers', () => {
    expect(() =>
      parseIdml(`
./p
Col()[100,100,top-left] {
Col()[10,100,top-left]{}
Col()[10,100,top-left]{}
}
`)
    ).toThrow(/must fill height exactly|need 100%/);
  });
});

describe('hug — fills the remaining main-axis space (flex)', () => {
  it('a hug child flex-grows, drops its main size, and absorbs the leftover', () => {
    const cfg = parseIdml(`
./p
Col()[100,100,top-left] {
Text("head")[20,100,top-left,fit-h]{}
Col()[80,100,top-left,hug] {
Text("body")[100,100,top-left]{}
}
}
`);
    const outer = cfg.pages[0].layout.children[0];
    const grown = outer.children[1];
    expect(grown.idmlStyle).toMatchObject({ flexGrow: '1', flexShrink: '1', flexBasis: '0', minHeight: '0' });
    // its main-axis (height) size is dropped so flex owns it
    expect(grown.size?.height).toBeUndefined();
  });

  it('lets a fixed head + hug body coexist without a tile-sum error', () => {
    expect(() =>
      parseIdml(`
./p
Col()[100,100,top-left] {
Text("head")[20,100,top-left,fit-h]{}
Spacer()[80,100,top-left,hug]{}
}
`)
    ).not.toThrow();
  });

  it('throws when a hug has no remaining space to fill', () => {
    expect(() =>
      parseIdml(`
./p
Col()[100,100,top-left] {
Text("head")[100,100,top-left]{}
Spacer()[100,100,top-left,hug]{}
}
`)
    ).toThrow(/needs remaining space/);
  });
});

describe('fill — cross-axis stretch (align-self: stretch)', () => {
  it('a fill-h container keeps its size, packs children, and sets align-self', () => {
    const cfg = parseIdml(`
./p
Row()[100,100,top-left] {
Col()[100,50,top-left,fill-h] {
Text("a")[50,100,top-left]{}
Text("b")[50,100,top-left]{}
}
Col()[100,50,top-left,fill-h] {
Text("c")[100,100,top-left]{}
}
}
`);
    const row = cfg.pages[0].layout.children[0];
    const card = row.children[0];
    // Fill keeps the card's own tile size (so it fills the parent) and stretches
    // it to the flex line; its children lose their main-axis height so they pack.
    expect(card.size).toEqual({ height: '100%', width: '50%' });
    expect(card.idmlStyle).toMatchObject({ alignSelf: 'stretch' });
    for (const child of card.children) {
      expect(child.size?.height).toBeUndefined();
    }
  });

  it('a fill-h def call stretches its wrapper (align-self + auto height)', () => {
    const layout = parseIdml(`
define Card() {
Col()[100,100,top-left]{}
}
./p
Row()[100,100,top-left] {
Card()[100,50,top-left,fill-h]{}
Card()[100,50,top-left,fill-h]{}
}
`).pages[0].layout;
    const wrapper = layout.children[0].children[0];
    expect(wrapper.idmlStyle).toMatchObject({ alignSelf: 'stretch', height: 'auto' });
  });
});

describe('fit — invalid placements are rejected', () => {
  const cases: [string, string][] = [
    [
      'a Children slot',
      `./p\ndefine D() {\nChildren()[100,100,top-left,fit]{}\n}\nCol()[100,100,top-left]{\nD()[100,100,top-left]{}\n}`,
    ],
  ];
  for (const [label, src] of cases) {
    it(`throws for fit on ${label}`, () => {
      expect(() => parseIdml(src)).toThrow(/cannot use hug|hug applies/);
    });
  }

  // fit on a definition CALL is allowed — it content-sizes the expansion wrapper
  // (a def call can't otherwise shrink), so e.g. a fit-h nav row is content-height.
  it('fit-h on a definition call content-sizes the expansion wrapper', () => {
    const layout = parseIdml(
      `./p\ndefine D() {\nText("x")[100,100,top-left]{}\n}\nCol()[100,100,top-left]{\nD()[100,100,top-left,fit-h]{}\n}`
    ).pages[0].layout;
    const wrapper = layout.children[0].children[0];
    expect(wrapper.idmlStyle?.height).toBe('fit-content');
  });

  // A Table IS fittable — it expands to a Col of content-height rows, so `fit-h`
  // gives a content-height card (no dead space below the last row) by dropping
  // the fixed height while keeping the tiled width.
  it('fit-h on a Table drops its fixed height (content-height card)', () => {
    const layout = parseIdml(
      `./p\nCol()[100,100,top-left]{\nTable(@r)[100,100,top-left,fit-h]{\nColumn("A")[100,100,top-left]{Text(@item.a)[100,100,top-left]{}}\n}\n}`
    ).pages[0].layout;
    const findTable = (n: any): any => {
      if (n.children?.some((c: any) => (c.className ?? '').includes('bg-gray-50'))) return n;
      for (const c of n.children ?? []) {
        const f = findTable(c);
        if (f) return f;
      }
      return null;
    };
    const table = findTable(layout);
    expect(table).toBeTruthy();
    expect(table.size?.height).toBeUndefined();
    expect(table.size?.width).toBe('100%');
  });

  it('throws on an unknown sizing keyword', () => {
    expect(() => parseIdml(`./p\nCol()[100,100,top-left]{\nText("x")[100,100,top-left,squish]{}\n}`)).toThrow(
      /unknown sizing keyword/
    );
  });

  it('rejects the retired keywords grow / hug-w / hug-h as unknown', () => {
    for (const kw of ['grow', 'hug-w', 'hug-h']) {
      expect(() =>
        parseIdml(`./p\nCol()[100,100,top-left]{\nText("x")[100,100,top-left,${kw}]{}\n}`)
      ).toThrow(/unknown sizing keyword/);
    }
  });
});

describe.skipIf(!CHROMIUM)('fit — empirical content-size + ellipsis', () => {
  const VW = 1000;
  const VH = 800;

  it('a fit button hugs content, far narrower than its full tile', async () => {
    // The button's tile is the full 1000px width, but a short label should hug
    // to a small content width (well under a third of the tile).
    const probe = await measureButton(
      `
./p
Col()[100,100,top-left] {
Button("OK", noop)[20,100,top-left,fit]{}
Col()[80,100,top-left]{}
}
`,
      CHROMIUM!,
      { width: VW, height: VH }
    );
    expect(probe.width).toBeLessThan(VW / 3);
  });

  it('truncates an overflowing label with an ellipsis (… not full overflow)', async () => {
    // A 10%-wide tile (= 100px) far too small for the label: content is clipped
    // to the tile and ends in an ellipsis instead of spilling out.
    const probe = await measureButton(
      `
./p
Col()[100,100,top-left] {
Row()[15,100,top-left] {
Button("Overflows the tiny tile easily", noop)[100,10,top-left,fit]{}
Spacer()[100,90,top-left]{}
}
Col()[85,100,top-left]{}
}
`,
      CHROMIUM!,
      { width: VW, height: VH }
    );
    // Must NOT overflow its 10%-wide tile (= 100px) — content is clipped.
    expect(probe.width).toBeLessThanOrEqual(100 + 1);
    // Ellipsis is active: rendered (client) width is less than the un-clipped
    // content (scroll) width, and the CSS text-overflow is ellipsis.
    expect(probe.scrollWidth).toBeGreaterThan(probe.clientWidth);
    expect(probe.textOverflow).toBe('ellipsis');
  });
});

// Small helper that renders a fixture and measures the first <button>'s box and
// the styles relevant to truncation. Kept here (not in measure.ts) because it is
// specific to the ellipsis assertion.
async function measureButton(
  source: string,
  exe: string,
  viewport: { width: number; height: number }
): Promise<{ width: number; clientWidth: number; scrollWidth: number; textOverflow: string }> {
  const { measureDom } = await import('./measure');
  return measureDom(source, { exe, viewport }, () => {
    const el = document.querySelector('button') as HTMLElement;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      width: r.width,
      clientWidth: el.clientWidth,
      scrollWidth: el.scrollWidth,
      textOverflow: cs.textOverflow,
    };
  });
}
