import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ConfigProvider, ConfigRenderer } from '../../src/renderer';
import { parseIsdw } from '../../src/parser/isdw-parser';

describe('reactive value bindings', () => {
  it('renders a value-bound prop from a registered method', async () => {
    const config = parseIsdw(`
      ./home
      Text(@greeting)[100,10,top-left]{}
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

    const config = parseIsdw(`
      ./home
      Text(@greeting)[100,10,top-left]{}
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
