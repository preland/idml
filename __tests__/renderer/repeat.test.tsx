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
    expect(await screen.findByText((_, el) => el?.getAttribute('data-isd-repeat') === '')).toBeInTheDocument();
  });
});
