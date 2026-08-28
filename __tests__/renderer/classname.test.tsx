import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConfigProvider, ConfigRenderer } from '../../src/renderer';
import { parseIdml } from '../../src/parser/idml-parser';

describe('className bridge', () => {
  it('applies a variant class to the rendered element', async () => {
    const config = parseIdml(`
Saver:Button \`bg-blue-600 rounded text-white\`
./home
Saver("Save", null)[100,100,top-right]{}
`);
    render(
      <ConfigProvider config={config}>
        <ConfigRenderer page="/home" />
      </ConfigProvider>
    );
    const btn = await screen.findByRole('button', { name: 'Save' });
    expect(btn).toHaveClass('bg-blue-600', 'rounded', 'text-white');
  });

  it('applies a variant class to a Row container (alongside the flex class)', async () => {
    const config = parseIdml(`
Bar:Row \`bg-gray-100 border-b\`
./home
Bar()[100,100,top-left] {
Text("hi")[100,100,top-left]{}
}
`);
    const { container } = render(
      <ConfigProvider config={config}>
        <ConfigRenderer page="/home" />
      </ConfigProvider>
    );
    await screen.findByText('hi');
    const row = container.querySelector('.bg-gray-100');
    expect(row).not.toBeNull();
    expect(row).toHaveClass('flex', 'bg-gray-100', 'border-b');
  });
});

describe('a Button borderWidth actually draws', () => {
  it('restores border-style when a variant declares a width', () => {
    const cfg = parseIdml(`
Ringed:Button \`text-gray-500\` { borderWidth: 0.07vw }
./p
Col()[100,100,top-left] {
Ringed("?", noop)[100,100,center]{}
}
`);
    render(
      <ConfigProvider config={cfg} methods={[{ id: 'noop', fn: () => {} }]}>
        <ConfigRenderer page="/p" />
      </ConfigProvider>
    );
    const btn = screen.getByText('?').closest('button')!;
    expect(btn.style.borderStyle).toBe('solid');
    expect(btn.style.borderWidth).toBe('0.07vw');
  });

  it('leaves a plain button borderless', () => {
    const cfg = parseIdml(`
./p
Col()[100,100,top-left] {
Button("Go", noop)[100,100,center]{}
}
`);
    render(
      <ConfigProvider config={cfg} methods={[{ id: 'noop', fn: () => {} }]}>
        <ConfigRenderer page="/p" />
      </ConfigProvider>
    );
    const btn = screen.getByText('Go').closest('button')!;
    expect(btn.style.borderStyle).not.toBe('solid');
  });
});
