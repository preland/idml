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
