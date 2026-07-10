import { describe, it, expect } from 'vitest';
import { parseIdml } from '../../src/parser/idml-parser';

// `~@path` — a dynamic two-way model binding whose form-state KEY is resolved at
// render from a value-ref path (e.g. the current Repeat row's `item.key`). The
// static `~name` sugar can only target a parse-time literal key; this unblocks
// data-driven field grids that must bind each generated input to `values[item.key]`.
describe('idml parser — dynamic model bindings (~@path)', () => {
  const firstInput = (src: string) =>
    parseIdml(src).pages[0].components.find((c) => c.type === 'Input')!;

  it('parses ~@item.key into a model binding flagged dynamicKey', () => {
    const input = firstInput(`
./home
Input(~@item.key)[100,100,top-left]{}
`);
    expect(input.bindings).toEqual([
      { prop: 'value', methodId: 'item.key', kind: 'model', dynamicKey: true },
    ]);
  });

  it('keeps the static ~name binding unflagged (no dynamicKey)', () => {
    const input = firstInput(`
./home
Input(~email)[100,100,top-left]{}
`);
    expect(input.bindings).toEqual([
      { prop: 'value', methodId: 'email', kind: 'model' },
    ]);
  });

  it('resolves the dynamic key against the primary prop per component', () => {
    // Checkbox's primary prop is `checked`, so a dynamic model binds there.
    const checkbox = parseIdml(`
./home
Checkbox(~@item.flag)[100,100,top-left]{}
`).pages[0].components.find((c) => c.type === 'Checkbox')!;
    expect(checkbox.bindings).toEqual([
      { prop: 'checked', methodId: 'item.flag', kind: 'model', dynamicKey: true },
    ]);
  });

  it('does not treat ~@ as an inline style block or misread the ~', () => {
    // A multi-segment dotted path is captured whole.
    const input = firstInput(`
./home
Input(~@row.field.name)[100,100,top-left]{}
`);
    expect(input.bindings?.[0]).toMatchObject({ methodId: 'row.field.name', dynamicKey: true });
  });
});
