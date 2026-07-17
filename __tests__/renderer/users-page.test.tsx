import React from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { ConfigProvider, ConfigRenderer } from '../../src/renderer';
import { parseIdml } from '../../src/parser/idml-parser';

// The page is a real .idml artifact at the test route ./test/users (vitest runs
// from the project root, so resolve against cwd).
const SOURCE = readFileSync(resolve(process.cwd(), 'test-users-page.idml'), 'utf-8');

type Helpers = { set: (n: string, v: unknown) => void; item?: any };

const USERS = [
  { id: 1, name: 'Alice', email: 'alice@x.com', role: 'Admin' },
  { id: 2, name: 'Bob', email: 'bob@x.com', role: 'Researcher' },
];

function renderPage() {
  const created: any[] = [];
  const updated: any[] = [];
  const methods = [
    { id: 'users', fn: () => USERS },
    { id: 'logout', fn: () => {} },
    { id: 'openFeedback', fn: () => {} },
    { id: 'openCreate', fn: (...a: unknown[]) => (a[1] as Helpers).set('createOpen', true) },
    { id: 'closeCreate', fn: (...a: unknown[]) => (a[1] as Helpers).set('createOpen', false) },
    { id: 'createUser', fn: (...a: unknown[]) => { created.push(a[0]); (a[1] as Helpers).set('createOpen', false); } },
    {
      id: 'editUser',
      fn: (...a: unknown[]) => {
        // Prefill the shared form record from the clicked row, then open the modal.
        const h = a[1] as Helpers;
        h.set('email', h.item.email);
        h.set('name', h.item.name);
        h.set('role', h.item.role);
        h.set('editOpen', true);
      },
    },
    { id: 'updateUser', fn: (...a: unknown[]) => { updated.push(a[0]); (a[1] as Helpers).set('editOpen', false); } },
    { id: 'closeEdit', fn: (...a: unknown[]) => (a[1] as Helpers).set('editOpen', false) },
  ];

  const config = parseIdml(SOURCE);
  render(
    <ConfigProvider config={config} methods={methods}>
      <ConfigRenderer page="/test/users" />
    </ConfigProvider>
  );
  return { created, updated };
}

describe('jsbio Users page (recreated in .idml)', () => {
  it('parses to the test route', () => {
    const config = parseIdml(SOURCE);
    expect(config.pages[0].route).toBe('/test/users');
  });

  it('renders the sidebar chrome, header and action button', async () => {
    renderPage();
    expect(await screen.findByText('JSBIO')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Logout' })).toBeInTheDocument();
    expect(screen.getByText('User Management')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign Out' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create User' })).toBeInTheDocument();
  });

  it('renders the users table with headers, rows, role badges and Edit buttons', async () => {
    renderPage();
    // Headers
    for (const h of ['Name', 'Email', 'Role', 'Actions']) {
      expect(await screen.findByText(h)).toBeInTheDocument();
    }
    // Row data
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('alice@x.com')).toBeInTheDocument();
    expect(screen.getByText('bob@x.com')).toBeInTheDocument();
    // Role badges (one per row)
    expect(screen.getByText('Admin')).toBeInTheDocument();
    expect(screen.getByText('Researcher')).toBeInTheDocument();
    // One Edit button per row
    expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(2);
  });

  it('opens the create modal with labelled inputs and a role <select> of options', async () => {
    renderPage();
    expect(screen.queryByText('Create New User')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Create User' }));

    const heading = await screen.findByText('Create New User');
    const modal = heading.closest('[data-idml-modal]') as HTMLElement;
    expect(within(modal).getByText('Email')).toBeInTheDocument();
    expect(within(modal).getByText('Name')).toBeInTheDocument();
    expect(within(modal).getByText('Role')).toBeInTheDocument();

    // The role <select> carries the option set.
    const select = modal.querySelector('select') as HTMLSelectElement;
    const optionValues = Array.from(select.options).map((o) => o.value);
    expect(optionValues).toEqual(
      expect.arrayContaining(['Commenter', 'Researcher', 'Admin', 'Disabled'])
    );
  });

  it('two-way binds form fields and submits the entered values', async () => {
    const { created } = renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Create User' }));
    const heading = await screen.findByText('Create New User');
    const modal = heading.closest('[data-idml-modal]') as HTMLElement;

    const inputs = modal.querySelectorAll('input');
    fireEvent.change(inputs[0], { target: { value: 'carol@x.com' } });
    fireEvent.change(inputs[1], { target: { value: 'Carol' } });
    expect((inputs[0] as HTMLInputElement).value).toBe('carol@x.com');

    // The modal's own submit button (not the sidebar/header ones).
    fireEvent.click(within(modal).getByRole('button', { name: 'Create User' }));
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ email: 'carol@x.com', name: 'Carol' });
  });

  it('Edit prefills the shared form from the clicked row and opens the edit modal', async () => {
    renderPage();
    // Click the second row's Edit (Bob).
    const editButtons = await screen.findAllByRole('button', { name: 'Edit' });
    fireEvent.click(editButtons[1]);

    const heading = await screen.findByText('Edit User');
    const modal = heading.closest('[data-idml-modal]') as HTMLElement;
    const inputs = modal.querySelectorAll('input');
    // Prefilled from Bob's record via the per-row `item` helper.
    expect((inputs[0] as HTMLInputElement).value).toBe('bob@x.com');
    expect((inputs[1] as HTMLInputElement).value).toBe('Bob');
  });
});
