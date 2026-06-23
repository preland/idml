import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConfigProvider, ConfigRenderer } from '../../src/renderer';
import { parseIsdw } from '../../src/parser/isdw-parser';

describe('className bridge', () => {
  it('applies a variant class to the rendered element', async () => {
    const config = parseIsdw(`
Saver:Button \`px-3 py-2 bg-blue-600 rounded\`
./home
Saver("Save", null)[100,100,top-right]{}
`);
    render(
      <ConfigProvider config={config}>
        <ConfigRenderer page="/home" />
      </ConfigProvider>
    );
    const btn = await screen.findByRole('button', { name: 'Save' });
    expect(btn).toHaveClass('px-3', 'py-2', 'bg-blue-600', 'rounded');
  });

  it('applies a variant class to a Row container (alongside the flex class)', async () => {
    const config = parseIsdw(`
Bar:Row \`gap-4 border-b\`
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
    const row = container.querySelector('.gap-4');
    expect(row).not.toBeNull();
    expect(row).toHaveClass('flex', 'gap-4', 'border-b');
  });
});
