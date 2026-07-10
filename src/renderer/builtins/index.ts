import React from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
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

// Stub. The real Table is being designed as an idml object with its own data
// binding/column format; for now it renders a labelled placeholder so pages that
// reference it compose and lay out correctly.
const Table = ({ children, ...props }: ComponentProps) =>
  React.createElement('div', { 'data-isd-table': '', ...props }, children ?? 'Table');

const Input = ({ type = 'text', value, onChange, onEnter, placeholder, name, disabled, style, ...props }: ComponentProps) =>
  React.createElement('input', {
    type, value, onChange, placeholder, name, disabled, style,
    // A DSL handler arg on an Input binds here (onEnter): fire it on Enter so a
    // single-line field submits (e.g. a chat send box). onEnter is destructured
    // out so it never leaks to the DOM as an unknown attribute.
    onKeyDown: onEnter
      ? (e: React.KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); (onEnter as (ev: unknown) => void)(e); } }
      : undefined,
    ...props,
  });

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
const Repeat = ({ data, children, style, fillDirection, ...props }: ComponentProps) => {
  const items = Array.isArray(data) ? data : [];
  const dir = fillDirection as 'row' | 'column' | undefined;
  // Equal-fill: N items each take 1/N of the parent's main axis. The repeat box
  // becomes a flex line in that direction filling its cell, and each item is
  // wrapped in a flex:1 cell. Without `fillDirection` (content-flow container),
  // items just stack at their natural size and the container scrolls.
  const boxStyle = dir
    ? { display: 'flex', flexDirection: dir, width: '100%', height: '100%', ...(style as object) }
    : style;
  return React.createElement(
    'div',
    { 'data-isd-repeat': '', style: boxStyle, ...props },
    items.map((item, i) => {
      const content = dir
        ? React.createElement(
            'div',
            { style: { flex: '1 1 0', minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' } },
            children
          )
        : children;
      return React.createElement(RepeatItemContext.Provider, { key: i, value: item }, content);
    })
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

const MODAL_BACKDROP: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
};
// Only structural defaults that keep a tall modal on-screen. Appearance —
// background, radius, padding, width, shadow — is left to the panel's className
// so an inline style here never overrides the author's utility classes (e.g.
// `max-w-md` would otherwise lose to an inline `maxWidth`).
const MODAL_PANEL: React.CSSProperties = {
  maxHeight: '90vh',
  overflow: 'auto',
};

// Overlay rendered in a portal when `open` is truthy. Open state typically lives
// in form state (`Modal(@state.isCreateOpen)`), toggled by handlers via `set`.
// Clicking the backdrop calls `onClose` if provided.
const Modal = ({ open, onClose, children, style, ...props }: ComponentProps) => {
  if (!open) return null;
  if (typeof document === 'undefined') return null; // SSR guard
  const panel = React.createElement(
    'div',
    {
      'data-isd-modal': '',
      style: { ...MODAL_PANEL, ...style },
      onClick: (e: React.MouseEvent) => e.stopPropagation(),
      ...props,
    },
    children
  );
  return createPortal(
    React.createElement('div', { 'data-isd-modal-backdrop': '', style: MODAL_BACKDROP, onClick: onClose }, panel),
    document.body
  );
};

// Sandbox enclosure for a react-only registered widget. idml owns the box: the
// `[h,w]` dims flow into `style` (Embed is fill-height, so it fills its cell),
// and the widget renders inside an absolutely-positioned inner layer that can
// NEVER grow the box or paint outside it. Adversarial content — huge intrinsic
// size, a min-width blowout, absolute/negative-margin escapees — is clipped to
// the idml bounds (absolute children don't contribute to the parent's size, and
// `overflow: hidden` clips the paint). A `position: fixed` descendant (e.g. the
// widget's own full-screen modal) still reaches the viewport by design: an
// overflow-hidden ancestor that isn't a containing block doesn't clip fixed
// elements, and we deliberately avoid `contain`/`transform` here so it can't.
const EMBED_OUTER: React.CSSProperties = {
  position: 'relative',
  overflow: 'hidden',
  minWidth: 0,
  minHeight: 0,
};
const EMBED_INNER: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  overflow: 'auto',
  minWidth: 0,
  minHeight: 0,
};
const Embed = ({ children, style, ...props }: ComponentProps) =>
  React.createElement(
    'div',
    { 'data-isd-embed': '', style: { ...style, ...EMBED_OUTER }, ...props },
    React.createElement('div', { 'data-isd-embed-inner': '', style: EMBED_INNER }, children)
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
  Modal,
  Embed,
};
