import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfigProvider, ConfigRenderer } from '../../src/renderer';
import { parseIdml } from '../../src/parser/idml-parser';

// End-to-end proof that `~@item.key` two-way-binds a Repeat-generated input to a
// form-state cell whose key comes from the current row — the capability that lets
// a data-driven (per-type) field grid be authored in the DSL instead of a widget.
describe('dynamic model bindings (~@path) — renderer', () => {
  const PAGE = `
./home
Repeat(@fields)[90,100,top-left] {
  Input(~@item.key)[100,100,top-left]{}
}
Button("dump", dump)[10,100,top-left]{}
`;

  it('writes each generated input to values[item.key] and reads it back', async () => {
    let captured: Record<string, unknown> = {};
    const config = parseIdml(PAGE);

    render(
      <ConfigProvider
        config={config}
        methods={[
          { id: 'fields', fn: () => [{ key: 'firstName' }, { key: 'surname' }] },
          { id: 'dump', fn: (values) => { captured = values as Record<string, unknown>; } },
        ]}
      >
        <ConfigRenderer page="/home" />
      </ConfigProvider>
    );

    const inputs = (await screen.findAllByRole('textbox')) as HTMLInputElement[];
    expect(inputs).toHaveLength(2);

    fireEvent.change(inputs[0], { target: { value: 'Alice' } });
    fireEvent.change(inputs[1], { target: { value: 'Smith' } });

    // Controlled read-back: each input reflects its own dynamic cell.
    expect(inputs[0].value).toBe('Alice');
    expect(inputs[1].value).toBe('Smith');

    // And the writes landed under the row-derived keys, not a literal "item.key".
    fireEvent.click(screen.getByRole('button'));
    expect(captured).toEqual({ firstName: 'Alice', surname: 'Smith' });
  });

  it('shares a cell when two dynamic inputs resolve to the same key', async () => {
    const config = parseIdml(`
./home
Repeat(@fields)[100,100,top-left] {
  Input(~@item.key)[100,100,top-left]{}
}
`);
    render(
      <ConfigProvider
        config={config}
        methods={[{ id: 'fields', fn: () => [{ key: 'q' }, { key: 'q' }] }]}
      >
        <ConfigRenderer page="/home" />
      </ConfigProvider>
    );

    const inputs = (await screen.findAllByRole('textbox')) as HTMLInputElement[];
    fireEvent.change(inputs[0], { target: { value: 'hi' } });
    expect(inputs[1].value).toBe('hi');
  });

  it('does not crash or pollute state when the key resolves to empty', async () => {
    let captured: Record<string, unknown> = { untouched: true };
    const config = parseIdml(`
./home
Repeat(@fields)[90,100,top-left] {
  Input(~@item.missing)[100,100,top-left]{}
}
Button("dump", dump)[10,100,top-left]{}
`);
    render(
      <ConfigProvider
        config={config}
        methods={[
          { id: 'fields', fn: () => [{ key: 'a' }] },
          { id: 'dump', fn: (values) => { captured = values as Record<string, unknown>; } },
        ]}
      >
        <ConfigRenderer page="/home" />
      </ConfigProvider>
    );

    const input = (await screen.findByRole('textbox')) as HTMLInputElement;
    // Writing to an unresolved key is a no-op (stays controlled at '').
    fireEvent.change(input, { target: { value: 'x' } });
    expect(input.value).toBe('');
    fireEvent.click(screen.getByRole('button'));
    expect(captured).toEqual({});
  });
});
