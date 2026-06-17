import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfigProvider, ConfigRenderer } from '../../src/renderer';
import { parseIsdw } from '../../src/parser/isdw-parser';

describe('two-way form (model) bindings', () => {
  it('updates form state from an input and reflects it back (controlled)', async () => {
    const config = parseIsdw(`
      ./home
      Form()[100,100,top-left] {
        Input(~name)[100,10,top-left]{}
      }
    `);

    render(
      <ConfigProvider config={config}>
        <ConfigRenderer page="/home" />
      </ConfigProvider>
    );

    const input = (await screen.findByRole('textbox')) as HTMLInputElement;
    expect(input.value).toBe('');
    fireEvent.change(input, { target: { value: 'Alice' } });
    expect(input.value).toBe('Alice');
  });

  it('shares a state cell between inputs bound to the same name', async () => {
    const config = parseIsdw(`
      ./home
      Form()[100,100,top-left] {
        Input(~q)[100,10,top-left]{}
        Input(~q)[100,10,top-left]{}
      }
    `);

    render(
      <ConfigProvider config={config}>
        <ConfigRenderer page="/home" />
      </ConfigProvider>
    );

    const inputs = (await screen.findAllByRole('textbox')) as HTMLInputElement[];
    fireEvent.change(inputs[0], { target: { value: 'hi' } });
    expect(inputs[1].value).toBe('hi');
  });

  it('passes the current form values to a handler when it fires', async () => {
    const calls: Array<Record<string, unknown>> = [];
    const config = parseIsdw(`
      ./home
      Form()[100,100,top-left] {
        Input(~name)[100,10,top-left]{}
        Button("Save", save)[100,10,top-left]{}
      }
    `);

    render(
      <ConfigProvider
        config={config}
        methods={[{ id: 'save', fn: (values) => { calls.push(values as Record<string, unknown>); } }]}
      >
        <ConfigRenderer page="/home" />
      </ConfigProvider>
    );

    fireEvent.change(await screen.findByRole('textbox'), { target: { value: 'Alice' } });
    fireEvent.click(screen.getByRole('button'));

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({ name: 'Alice' });
  });

  it('works at page level without an explicit Form', async () => {
    const config = parseIsdw(`
      ./home
      Input(~loose)[100,10,top-left]{}
    `);

    render(
      <ConfigProvider config={config}>
        <ConfigRenderer page="/home" />
      </ConfigProvider>
    );

    const input = (await screen.findByRole('textbox')) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'x' } });
    expect(input.value).toBe('x');
  });
});
