import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfigProvider, ConfigRenderer } from '../../src/renderer';
import { parseIdml } from '../../src/parser/idml-parser';

// Open button flips state.createOpen on; the Modal reads @state.createOpen; the
// Close button flips it off — all via the form-state store + the `set` helper.
// Form is a column container, so its children (the open button + the modal node)
// tile to 100% on height. The Modal's own children are exempt from tiling.
const MODAL_PAGE = `
./home
Form()[100,100,top-left] {
Button("New User", openCreate)[100,100,top-left]{}
Modal(@state.createOpen)[50,100,center] {
Text("Create User")[20,100,top-left]{}
Button("Cancel", closeCreate)[80,100,top-left]{}
}
}
`;

type Helpers = { set: (n: string, v: unknown) => void };
const methods = [
  { id: 'openCreate', fn: (...args: unknown[]) => { (args[1] as Helpers).set('createOpen', true); } },
  { id: 'closeCreate', fn: (...args: unknown[]) => { (args[1] as Helpers).set('createOpen', false); } },
];

describe('Modal', () => {
  it('is hidden until opened, then shows in a portal, then closes', async () => {
    const config = parseIdml(MODAL_PAGE);
    render(
      <ConfigProvider config={config} methods={methods}>
        <ConfigRenderer page="/home" />
      </ConfigProvider>
    );

    // Closed initially.
    expect(await screen.findByRole('button', { name: 'New User' })).toBeInTheDocument();
    expect(screen.queryByText('Create User')).toBeNull();

    // Open it.
    fireEvent.click(screen.getByRole('button', { name: 'New User' }));
    expect(screen.getByText('Create User')).toBeInTheDocument();

    // Close it.
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('Create User')).toBeNull();
  });
});
