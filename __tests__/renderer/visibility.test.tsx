import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { parseIdml } from '../../src/parser/idml-parser';
import { ConfigProvider } from '../../src/renderer/ConfigProvider';
import { ConfigRenderer } from '../../src/renderer/ConfigRenderer';
// `?@ref` / `?!@ref` conditionally render a cell from reactive state.

describe('visibility — parsing', () => {
  it('parses `?@state.x` into a positive visibility ref', () => {
    const cfg = parseIdml(`
./p
Col()[100,100,top-left] {
Text("hi")[100,100,top-left] ?@state.open {}
}
`);
    const textCell = cfg.pages[0].layout.children[0].children[0];
    expect(textCell.visibility).toEqual({ ref: 'state.open', negate: false });
  });

  it('parses `?!@state.x` as negated', () => {
    const cfg = parseIdml(`
./p
Col()[100,100,top-left] {
Text("hi")[100,100,top-left] ?!@state.open {}
}
`);
    const textCell = cfg.pages[0].layout.children[0].children[0];
    expect(textCell.visibility).toEqual({ ref: 'state.open', negate: true });
  });

  it('works on a container too', () => {
    const cfg = parseIdml(`
./p
Col()[100,100,top-left] {
Col()[100,100,top-left] ?@state.open {
Text("x")[100,100,top-left]{}
}
}
`);
    const inner = cfg.pages[0].layout.children[0].children[0];
    expect(inner.visibility).toEqual({ ref: 'state.open', negate: false });
  });
});

describe('visibility — rendering', () => {
  it('hides a cell whose state is falsy and shows it when set', () => {
    // `toggle` flips @state.open; the label is gated on it. Default falsy → hidden.
    const cfg = parseIdml(`
./p
Col()[100,100,top-left] {
Button("toggle", flip)[100,100,top-left]{}
Text("secret")[100,100,top-left] ?@state.open {}
}
`);
    const methods = [
      {
        id: 'flip',
        fn: (...a: unknown[]) => {
          const h = a[1] as { set: (n: string, v: unknown) => void };
          h.set('open', true);
        },
      },
    ];
    render(
      <ConfigProvider config={cfg} methods={methods}>
        <ConfigRenderer page="/p" />
      </ConfigProvider>
    );
    // Initially hidden (state.open is undefined → falsy).
    expect(screen.queryByText('secret')).toBeNull();
  });
});
