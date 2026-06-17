import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BUILTIN_COMPONENTS } from '../../src/renderer/builtins';

const noop = () => {};

describe('form-input builtins', () => {
  it('Input renders an <input> with type, placeholder and value', () => {
    const { Input } = BUILTIN_COMPONENTS;
    render(<Input placeholder="Name" value="Ada" onChange={noop} name="name" />);
    const el = screen.getByPlaceholderText('Name') as HTMLInputElement;
    expect(el.tagName).toBe('INPUT');
    expect(el.type).toBe('text');
    expect(el.value).toBe('Ada');
    expect(el.name).toBe('name');
  });

  it('Input spreads style and respects disabled', () => {
    const { Input } = BUILTIN_COMPONENTS;
    render(<Input placeholder="X" disabled style={{ color: 'red' }} />);
    const el = screen.getByPlaceholderText('X') as HTMLInputElement;
    expect(el.disabled).toBe(true);
    expect(el.style.color).toBe('red');
  });

  it('Textarea renders a <textarea> with placeholder, rows and value', () => {
    const { Textarea } = BUILTIN_COMPONENTS;
    render(<Textarea placeholder="Bio" rows={5} value="hello" onChange={noop} />);
    const el = screen.getByPlaceholderText('Bio') as HTMLTextAreaElement;
    expect(el.tagName).toBe('TEXTAREA');
    expect(el.rows).toBe(5);
    expect(el.value).toBe('hello');
  });

  it('Select renders options from an options prop', () => {
    const { Select } = BUILTIN_COMPONENTS;
    render(
      <Select
        value="b"
        onChange={noop}
        name="choice"
        options={[
          { value: 'a', label: 'Alpha' },
          { value: 'b', label: 'Beta' },
        ]}
      />
    );
    const el = screen.getByRole('combobox') as HTMLSelectElement;
    expect(el.tagName).toBe('SELECT');
    expect(el.name).toBe('choice');
    const opts = el.querySelectorAll('option');
    expect(opts.length).toBe(2);
    expect(opts[0].value).toBe('a');
    expect(opts[0].textContent).toBe('Alpha');
    expect(el.value).toBe('b');
  });

  it('Select renders children when no options prop given', () => {
    const { Select, Option } = BUILTIN_COMPONENTS;
    render(
      <Select value="x" onChange={noop}>
        <Option value="x" label="Ex" />
        <Option value="y">Why</Option>
      </Select>
    );
    const el = screen.getByRole('combobox') as HTMLSelectElement;
    const opts = el.querySelectorAll('option');
    expect(opts.length).toBe(2);
    expect(opts[0].value).toBe('x');
    expect(opts[0].textContent).toBe('Ex');
    expect(opts[1].textContent).toBe('Why');
  });

  it('Option renders an <option> with value and label', () => {
    const { Option } = BUILTIN_COMPONENTS;
    render(
      <select defaultValue="v">
        {Option({ value: 'v', label: 'Vee' })}
      </select>
    );
    const opt = document.querySelector('option') as HTMLOptionElement;
    expect(opt.value).toBe('v');
    expect(opt.textContent).toBe('Vee');
  });

  it('Checkbox reflects checked state', () => {
    const { Checkbox } = BUILTIN_COMPONENTS;
    render(<Checkbox checked onChange={noop} name="agree" />);
    const el = screen.getByRole('checkbox') as HTMLInputElement;
    expect(el.type).toBe('checkbox');
    expect(el.checked).toBe(true);
    expect(el.name).toBe('agree');
  });

  it('Radio renders a radio input with value and name', () => {
    const { Radio } = BUILTIN_COMPONENTS;
    render(<Radio checked value="opt1" name="group" onChange={noop} />);
    const el = screen.getByRole('radio') as HTMLInputElement;
    expect(el.type).toBe('radio');
    expect(el.value).toBe('opt1');
    expect(el.name).toBe('group');
    expect(el.checked).toBe(true);
  });

  it('Label renders its text and htmlFor', () => {
    const { Label } = BUILTIN_COMPONENTS;
    render(<Label htmlFor="email" text="Email" />);
    const el = screen.getByText('Email') as HTMLLabelElement;
    expect(el.tagName).toBe('LABEL');
    expect(el.htmlFor).toBe('email');
  });

  it('Label renders children when no text prop given', () => {
    const { Label } = BUILTIN_COMPONENTS;
    render(<Label htmlFor="pw">Password</Label>);
    const el = screen.getByText('Password') as HTMLLabelElement;
    expect(el.htmlFor).toBe('pw');
  });
});
