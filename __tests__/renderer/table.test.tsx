import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConfigProvider, ConfigRenderer } from '../../src/renderer';
import { parseIsdw } from '../../src/parser/isdw-parser';

const TABLE_PAGE = `
./admin/users
Table(@users)[100,100,center] {
Column("Name")[10,40,top-left]{ Text(@item.name)[100,100,top-left]{} }
Column("Email")[10,40,top-left]{ Text(@item.email)[100,100,top-left]{} }
Column("Actions")[10,20,top-left]{
Button("Edit", editUser)[100,100,top-left]{}
}
}
`;

describe('Table', () => {
  it('renders column headers and one row of cells per data item', async () => {
    const config = parseIsdw(TABLE_PAGE);

    render(
      <ConfigProvider
        config={config}
        methods={[
          {
            id: 'users',
            fn: () => [
              { name: 'Alice', email: 'alice@x.com' },
              { name: 'Bob', email: 'bob@x.com' },
            ],
          },
          { id: 'editUser', fn: () => {} },
        ]}
      >
        <ConfigRenderer page="/admin/users" />
      </ConfigProvider>
    );

    // Headers
    expect(await screen.findByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Email')).toBeInTheDocument();
    expect(screen.getByText('Actions')).toBeInTheDocument();

    // One cell per item, resolving @item fields
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('alice@x.com')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('bob@x.com')).toBeInTheDocument();

    // An Edit button per row (2 rows)
    expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(2);
  });
});
