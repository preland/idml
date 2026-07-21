import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ConfigProvider, ConfigRenderer } from '../../src/renderer';
import { parseIdml } from '../../src/parser/idml-parser';

const REPEAT_PAGE = `
  ./home
  Repeat(@users)[100,100,top-left] {
    Text(@item.name)[100,10,top-left]{}
  }
`;

describe('Repeat (iteration)', () => {
  it('renders one row per data item, resolving @item fields', async () => {
    const config = parseIdml(REPEAT_PAGE);

    render(
      <ConfigProvider
        config={config}
        methods={[{ id: 'users', fn: () => [{ name: 'Alice' }, { name: 'Bob' }, { name: 'Carol' }] }]}
      >
        <ConfigRenderer page="/home" />
      </ConfigProvider>
    );

    expect(await screen.findByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('Carol')).toBeInTheDocument();
  });

  it('reactively adds/removes rows when the data method (a hook) changes', async () => {
    let setUsers: (u: { name: string }[]) => void = () => {};
    const useUsers = () => {
      const [u, setU] = React.useState([{ name: 'A' }]);
      setUsers = setU;
      return u;
    };

    const config = parseIdml(REPEAT_PAGE);
    render(
      <ConfigProvider config={config} methods={[{ id: 'users', fn: useUsers }]}>
        <ConfigRenderer page="/home" />
      </ConfigProvider>
    );

    expect(await screen.findByText('A')).toBeInTheDocument();
    expect(screen.queryByText('B')).toBeNull();

    act(() => setUsers([{ name: 'A' }, { name: 'B' }]));
    expect(await screen.findByText('B')).toBeInTheDocument();
  });

  it('renders nothing for an empty/missing data array (no crash)', async () => {
    const config = parseIdml(REPEAT_PAGE);
    render(
      <ConfigProvider config={config} methods={[{ id: 'users', fn: () => [] }]}>
        <ConfigRenderer page="/home" />
      </ConfigProvider>
    );
    // Nothing to assert beyond "did not throw"; the repeat container is present.
    expect(await screen.findByText((_, el) => el?.getAttribute('data-idml-repeat') === '')).toBeInTheDocument();
  });
});

// A Repeat flows along its PARENT's main axis, choosing equal-fill vs natural
// (scroll) size from whether that parent is definite or content-flow. Row vs
// column is the same code path — so a horizontal strip needs no special casing.
describe('Repeat (layout mode from parent)', () => {
  const repeatOf = (parent: string) =>
    parseIdml(`
      Strip:Row { overflowX: auto }
      Grid:Row { }
      Feed:Col { overflowY: auto }
      Stack:Col { }
      ./home
      ${parent}()[100,100,top-left] {
        Repeat(@xs)[100,100,top-left] {
          Text(@item.n)[100,10,top-left]{}
        }
      }
    `).pages[0].components.find((c) => c.type === 'Repeat');

  it('definite Row parent -> equal-fill row (fillDirection)', () => {
    const r = repeatOf('Grid');
    expect(r?.props?.fillDirection).toBe('row');
    expect(r?.props?.flowDirection).toBeUndefined();
  });

  it('definite Col parent -> equal-fill column (fillDirection)', () => {
    const r = repeatOf('Stack');
    expect(r?.props?.fillDirection).toBe('column');
  });

  it('content-flow Row parent (overflowX) -> horizontal flow (flowDirection: row)', () => {
    const r = repeatOf('Strip');
    expect(r?.props?.flowDirection).toBe('row');
    expect(r?.props?.fillDirection).toBeUndefined();
  });

  it('content-flow Col parent (overflowY) -> vertical flow (flowDirection: column)', () => {
    const r = repeatOf('Feed');
    expect(r?.props?.flowDirection).toBe('column');
  });

  it('renders a content-flow Row Repeat as a horizontal flex line, items un-wrapped', async () => {
    const config = parseIdml(`
      Strip:Row { overflowX: auto }
      ./home
      Strip()[100,100,top-left] {
        Repeat(@xs)[100,100,top-left] {
          Text(@item.n)[100,50,top-left]{}
        }
      }
    `);
    render(
      <ConfigProvider config={config} methods={[{ id: 'xs', fn: () => [{ n: 'a' }, { n: 'b' }] }]}>
        <ConfigRenderer page="/home" />
      </ConfigProvider>
    );
    const box = await screen.findByText((_, el) => el?.getAttribute('data-idml-repeat') === '');
    // Flows horizontally, and items keep their own size (no equal-fill 1/N cell).
    expect(box.style.flexDirection).toBe('row');
    expect(box.style.display).toBe('flex');
    expect([...box.children].some((c) => (c as HTMLElement).style.flex === '1 1 0')).toBe(false);
  });
});
