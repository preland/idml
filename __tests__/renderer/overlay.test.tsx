import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfigProvider, ConfigRenderer } from '../../src/renderer';
import { parseIdml } from '../../src/parser/idml-parser';

const PAGE = `
RoundBtn:Button \`rounded-full\`
./home
Overlay()[100,100,top-left] {
RoundBtn("Feedback", openFeedback)[10,10,bottom-right]{}
}
`;

describe('Overlay layer', () => {
  it('renders a fixed, click-through layer with an exactly-sized, clickable child', async () => {
    let clicked = 0;
    const { container } = render(
      <ConfigProvider config={parseIdml(PAGE)} methods={[{ id: 'openFeedback', fn: () => { clicked++; } }]}>
        <ConfigRenderer page="/home" />
      </ConfigProvider>
    );

    const btn = await screen.findByRole('button', { name: 'Feedback' });

    // The layer is fixed and does not capture pointer events itself.
    const layer = container.querySelector('div[style*="position: fixed"]') as HTMLElement;
    expect(layer).not.toBeNull();
    expect(layer.style.pointerEvents).toBe('none');

    // The button's cell is an absolute 10%×10% box pinned bottom-right, clickable.
    const cell = btn.closest('[style*="position: absolute"]') as HTMLElement;
    expect(cell).not.toBeNull();
    expect(cell.style.pointerEvents).toBe('auto');
    expect(cell.style.bottom).toBe('0px');
    expect(cell.style.right).toBe('0px');
    expect(cell.style.width).toBe('10%');
    expect(cell.style.height).toBe('10%');

    fireEvent.click(btn);
    expect(clicked).toBe(1);
  });
});
