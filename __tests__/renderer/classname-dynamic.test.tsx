import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConfigProvider, ConfigRenderer } from '../../src/renderer';
import { parseIsdw } from '../../src/parser/isdw-parser';

describe('dynamic className binding (@method in a class block)', () => {
  it('merges static classes with a resolved dynamic class', async () => {
    // Static classes live in the variant; the use site adds ONLY a dynamic
    // @binding (literal classes at a use site are rejected).
    const config = parseIsdw(`
Badge:Text \`px-2 rounded\`
./home
Badge("Admin")[100,100,top-left]\`@badgeClass\`{}
`);
    render(
      <ConfigProvider config={config} methods={[{ id: 'badgeClass', fn: () => 'bg-red-100 text-red-800' }]}>
        <ConfigRenderer page="/home" />
      </ConfigProvider>
    );
    const el = await screen.findByText('Admin');
    expect(el).toHaveClass('px-2', 'rounded', 'bg-red-100', 'text-red-800');
  });

  it('resolves a different class per Repeat row from the row item', async () => {
    const config = parseIsdw(`
RoleText:Text \`badge\`
./home
Repeat(@rows)[100,100,top-left] {
RoleText(@item.role)[100,100,top-left]\`@roleClass\`{}
}
`);
    render(
      <ConfigProvider
        config={config}
        methods={[
          { id: 'rows', fn: () => [{ role: 'Admin' }, { role: 'Viewer' }] },
          { id: 'roleClass', fn: (...a: unknown[]) => ((a[0] as { role: string })?.role === 'Admin' ? 'is-admin' : 'is-viewer') },
        ]}
      >
        <ConfigRenderer page="/home" />
      </ConfigProvider>
    );
    expect(await screen.findByText('Admin')).toHaveClass('badge', 'is-admin');
    expect(screen.getByText('Viewer')).toHaveClass('badge', 'is-viewer');
  });
});
