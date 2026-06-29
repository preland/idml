import { describe, it, expect } from 'vitest';
import { parseIsdw } from '../../src/parser/isdw-parser';
import type { LayoutDef } from '../../src/types';

// A `@ref` dimension is parsed into `dynamicSize` (resolved per render), the
// static `size` for that axis is omitted, and tiling tolerates the dynamic
// sibling — the foundation for a sidebar that narrows on collapse.

function child(layout: LayoutDef, i: number): LayoutDef {
  return layout.children[i];
}

describe('isdw parser — dynamic (@ref) dimensions', () => {
  it('parses a @ref width into dynamicSize and drops the static width', () => {
    const config = parseIsdw(`
./home
Row()[100,100,top-left] {
Col()[100,@sidebarW,top-left]{}
Col()[100,@contentW,top-left]{}
}
`);
    const row = config.pages[0].layout.children[0];
    const sidebar = child(row, 0);
    const content = child(row, 1);
    expect(sidebar.dynamicSize).toEqual({ width: { ref: 'sidebarW' } });
    expect(sidebar.size?.width).toBeUndefined();
    expect(sidebar.size?.height).toBe('100%');
    expect(content.dynamicSize).toEqual({ width: { ref: 'contentW' } });
  });

  it('tolerates a dynamic-width sibling without a tiling sum error', () => {
    // 13.5 + (dynamic) does not statically sum to 100, but must not throw.
    expect(() =>
      parseIsdw(`
./home
Row()[100,100,top-left] {
Col()[100,@sidebarW,top-left]{}
Col()[100,86.5,top-left]{}
}
`)
    ).not.toThrow();
  });

  it('supports a @state path as a dimension ref', () => {
    const config = parseIsdw(`
./home
Row()[100,100,top-left] {
Col()[100,@state.w,top-left]{}
Col()[100,@state.rest,top-left]{}
}
`);
    expect(child(config.pages[0].layout.children[0], 0).dynamicSize).toEqual({ width: { ref: 'state.w' } });
  });
});

describe('isdw parser — conditional dim & class', () => {
  it('parses `@ref ? A : B` dim into whenTrue/whenFalse', () => {
    const config = parseIsdw(`
./home
Row()[100,100,top-left] {
Col()[100,@state.collapsed ? 3.4vw : 13.5vw,top-left]{}
}
`);
    const col = config.pages[0].layout.children[0].children[0];
    expect(col.dynamicSize).toEqual({ width: { ref: 'state.collapsed', whenTrue: '3.4vw', whenFalse: '13.5vw' } });
  });

  it('bare numbers in a conditional dim become percentages', () => {
    const config = parseIsdw(`
./home
Row()[100,100,top-left] {
Col()[100,@state.collapsed ? 100 : 20,top-left]{}
}
`);
    const col = config.pages[0].layout.children[0].children[0];
    expect(col.dynamicSize?.width).toEqual({ ref: 'state.collapsed', whenTrue: '100%', whenFalse: '20%' });
  });

  it('parses a conditional class block `\`x\`?@ref` onto a container', () => {
    const config = parseIsdw(`
./home
Col()[100,100,top-left]
\`scale-100 opacity-100\`?@state.open
\`scale-0 opacity-0\`?!@state.open{}
`);
    const col = config.pages[0].layout.children[0];
    expect(col.condClasses).toEqual([
      { classes: 'scale-100 opacity-100', ref: 'state.open', negate: false },
      { classes: 'scale-0 opacity-0', ref: 'state.open', negate: true },
    ]);
  });
});
