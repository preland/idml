import React from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { RepeatItemContext } from '../repeat-context';
import { FormStateProvider } from '../form-context';

interface ComponentProps {
  [key: string]: any;
  children?: ReactNode;
}

const Text = ({ text, children, ...props }: ComponentProps) =>
  React.createElement('span', props, text || children);

const Heading = ({ level = 1, text, children, ...props }: ComponentProps) => {
  const Tag = (`h${level}` as unknown) as keyof React.JSX.IntrinsicElements;
  return React.createElement(Tag, props, text || children);
};

const BUTTON_BASE: React.CSSProperties = {
  border: 'none',
  outline: 'none',
  textDecoration: 'none',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 'inherit',
};

const Button = ({ text, children, onClick, href, style, type = 'button', ...props }: ComponentProps) => {
  const merged = { ...BUTTON_BASE, ...style };
  // Render both the label and any slotted children (e.g. an icon placed inside
  // the button via `Button("Save", { Image(...) })`).
  const content = [text, children];
  // Default type="button" so a button inside a Form doesn't trigger native form
  // submission on click — our onClick handler runs instead.
  return href
    ? React.createElement(Link, { href: href as string, style: merged, ...props }, content)
    : React.createElement('button', { type, onClick, style: merged, ...props }, content);
};

const Image = ({ src, alt, ...props }: ComponentProps) =>
  React.createElement('img', { src, alt: alt || '', ...props });

const List = ({ items = [], children, ...props }: ComponentProps) =>
  React.createElement(
    'ul',
    props,
    items.map((item: any, i: number) =>
      React.createElement('li', { key: i }, typeof item === 'string' ? item : JSON.stringify(item))
    ),
    children
  );

const Card = ({ children, ...props }: ComponentProps) =>
  React.createElement('div', props, children);

const Divider = (props: ComponentProps) => React.createElement('hr', props);

const Spacer = (props: ComponentProps) => React.createElement('div', props);

const Icon = ({ name, ...props }: ComponentProps) =>
  React.createElement('span', props, name || '●');

// Stub. The real Table is being designed as an isdw object with its own data
// binding/column format; for now it renders a labelled placeholder so pages that
// reference it compose and lay out correctly.
const Table = ({ children, ...props }: ComponentProps) =>
  React.createElement('div', { 'data-isd-table': '', ...props }, children ?? 'Table');

const Input = ({ type = 'text', value, onChange, placeholder, name, disabled, style, ...props }: ComponentProps) =>
  React.createElement('input', { type, value, onChange, placeholder, name, disabled, style, ...props });

const Textarea = ({ value, onChange, placeholder, name, rows, style, ...props }: ComponentProps) =>
  React.createElement('textarea', { value, onChange, placeholder, name, rows, style, ...props });

const Option = ({ value, label, children, ...props }: ComponentProps) =>
  React.createElement('option', { value, ...props }, label ?? children);

const Select = ({ value, onChange, name, options, children, style, ...props }: ComponentProps) =>
  React.createElement(
    'select',
    { value, onChange, name, style, ...props },
    Array.isArray(options)
      ? options.map((opt: any, i: number) =>
          React.createElement('option', { key: i, value: opt.value }, opt.label)
        )
      : children
  );

const Checkbox = ({ checked, onChange, name, disabled, style, ...props }: ComponentProps) =>
  React.createElement('input', { type: 'checkbox', checked, onChange, name, disabled, style, ...props });

const Radio = ({ checked, value, name, onChange, style, ...props }: ComponentProps) =>
  React.createElement('input', { type: 'radio', checked, value, name, onChange, style, ...props });

const Label = ({ htmlFor, text, children, style, ...props }: ComponentProps) =>
  React.createElement('label', { htmlFor, style, ...props }, text ?? children);

// Slot marker. Inside a reusable component definition, `Children` marks the
// region that the call site's children fill. The renderer threads the slot in
// via the `slot` prop (see ComponentRenderer); here we just render it.
const Children = ({ slot, children, ...props }: ComponentProps) =>
  React.createElement(React.Fragment, null, slot ?? children);

// Renders its child template (`children`) once per element of the `data` array
// (bound via `Repeat(@items)`), exposing each element as the current `item` so
// the template can read `@item.field`. `data` is reactive: when the bound method
// (e.g. a useQuery hook) returns new data, the rows re-render.
const Repeat = ({ data, children, style, ...props }: ComponentProps) => {
  const items = Array.isArray(data) ? data : [];
  return React.createElement(
    'div',
    { 'data-isd-repeat': '', style, ...props },
    items.map((item, i) =>
      React.createElement(RepeatItemContext.Provider, { key: i, value: item }, children)
    )
  );
};

// Establishes a nested form-state scope so `~name` model bindings inside it are
// isolated from other forms / the page-level store.
const Form = ({ children, style, ...props }: ComponentProps) =>
  React.createElement(
    FormStateProvider,
    null,
    React.createElement('form', { style, ...props }, children)
  );

export const BUILTIN_COMPONENTS = {
  Text,
  Heading,
  Button,
  Image,
  List,
  Card,
  Divider,
  Spacer,
  Icon,
  Table,
  Input,
  Textarea,
  Select,
  Option,
  Checkbox,
  Radio,
  Label,
  Children,
  Repeat,
  Form,
};
