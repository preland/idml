import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ConfigProvider, ConfigRenderer } from '../../src/renderer';
import { parseIdml } from '../../src/parser/idml-parser';

describe('reactive value bindings', () => {
  it('renders a value-bound prop from a registered method', async () => {
    const config = parseIdml(`
      ./home
      Text(@greeting)[100,100,top-left]{}
    `);

    render(
      <ConfigProvider config={config} methods={[{ id: 'greeting', fn: () => 'Hello Alice' }]}>
        <ConfigRenderer page="/home" />
      </ConfigProvider>
    );

    expect(await screen.findByText('Hello Alice')).toBeInTheDocument();
  });

  it('re-renders the bound component when a hook-method value changes', async () => {
    // The method is itself a hook (useState) — proving reactivity: changing its
    // state re-renders the component whose prop is bound to it.
    let setExternal: (v: string) => void = () => {};
    const useGreeting = () => {
      const [v, setV] = React.useState('first');
      setExternal = setV;
      return v;
    };

    const config = parseIdml(`
      ./home
      Text(@greeting)[100,100,top-left]{}
    `);

    render(
      <ConfigProvider config={config} methods={[{ id: 'greeting', fn: useGreeting }]}>
        <ConfigRenderer page="/home" />
      </ConfigProvider>
    );

    expect(await screen.findByText('first')).toBeInTheDocument();
    act(() => setExternal('second'));
    expect(await screen.findByText('second')).toBeInTheDocument();
  });
});

describe('a Checkbox keeps its intrinsic width', () => {
  it('does not stretch a Checkbox to its cell', () => {
    const cfg = parseIdml(`
./p
Col()[100,100,top-left] {
Checkbox(~agree)[100,100,center-left]{}
}
`);
    const { container } = render(
      <ConfigProvider config={cfg} methods={[]}>
        <ConfigRenderer page="/p" />
      </ConfigProvider>
    );
    const box = container.querySelector('input[type=checkbox]') as HTMLInputElement;
    expect(box.style.width).toBe('');
  });

  it('still stretches a Button to its cell', () => {
    const cfg = parseIdml(`
./p
Col()[100,100,top-left] {
Button("Go", noop)[100,100,center-left]{}
}
`);
    const { container } = render(
      <ConfigProvider config={cfg} methods={[{ id: 'noop', fn: () => {} }]}>
        <ConfigRenderer page="/p" />
      </ConfigProvider>
    );
    const btn = container.querySelector('button') as HTMLButtonElement;
    expect(btn.style.width).toBe('100%');
  });
});
