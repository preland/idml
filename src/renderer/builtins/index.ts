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
  React.createElement('div', { 'data-idml-table': '', ...props }, children ?? 'Table');

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

/**
 * A document-level keybinding. Renders nothing: `Hotkey("Escape", closeThing)`
 * declares that a key runs a method, which is otherwise inexpressible — a
 * handler in the DSL always hangs off an element the user has to reach with the
 * pointer. `value` is the combination ("Escape", "Ctrl+Enter", "Meta+K"),
 * matched case-insensitively against the event's key plus its modifiers.
 */
const Hotkey = ({ value, onClick }: ComponentProps) => {
  const handlerRef = React.useRef(onClick);
  handlerRef.current = onClick;
  const combo = String(value ?? '');
  React.useEffect(() => {
    if (!combo) return;
    const parts = combo.toLowerCase().split('+').map((s) => s.trim()).filter(Boolean);
    const key = parts[parts.length - 1];
    const needCtrl = parts.includes('ctrl');
    const needShift = parts.includes('shift');
    const needAlt = parts.includes('alt');
    const needMeta = parts.includes('meta');
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== key) return;
      // Ctrl and Meta are interchangeable so one binding covers both platforms.
      if (needCtrl && !(e.ctrlKey || e.metaKey)) return;
      if (needMeta && !(e.metaKey || e.ctrlKey)) return;
      if (needShift !== e.shiftKey) return;
      if (needAlt !== e.altKey) return;
      if (!needCtrl && !needMeta && (e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      (handlerRef.current as ((ev: unknown) => void) | undefined)?.(e);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [combo]);
  return null;
};

/**
 * A continuous pointer gesture on the container it sits in. Renders nothing and
 * takes no layout space — like `Hotkey`, it declares that an interaction runs a
 * method, which the DSL otherwise cannot say: a handler in idml fires on click,
 * and a drag or a wheel has no element to hang off.
 *
 * `Gesture("pan", onPan)` binds dragging, `"zoom"` the wheel, `"brush"` a
 * drag that reports the span it covered. A modifier may be required for the
 * wheel — `"zoom:ctrl"` leaves an unmodified wheel to scroll the page as usual.
 * Several Gestures may sit in one container; each listens for its own event, so
 * pan and zoom coexist without fighting over a layer.
 *
 * The handler receives the reading as its `event`, alongside the values and
 * helpers every idml handler gets. Distances are reported BOTH in pixels and as
 * a fraction of the container, because a caller almost always wants the
 * fraction: on a timeline, `dxRatio` is the share of the visible span that was
 * dragged, whatever the element's width happens to be.
 */
const GESTURE_MODIFIERS: Record<string, (e: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }) => boolean> = {
  ctrl: (e) => e.ctrlKey || e.metaKey,
  meta: (e) => e.metaKey || e.ctrlKey,
  shift: (e) => e.shiftKey,
  alt: (e) => e.altKey,
};

const Gesture = ({ value, onClick }: ComponentProps) => {
  const markerRef = React.useRef<HTMLSpanElement | null>(null);
  const handlerRef = React.useRef(onClick);
  handlerRef.current = onClick;
  const spec = String(value ?? 'pan');

  React.useEffect(() => {
    const [kindRaw, modRaw] = spec.toLowerCase().split(':');
    const kind = kindRaw.trim();
    const needMod = GESTURE_MODIFIERS[(modRaw ?? '').trim()];
    // The cell idml builds for an out-of-flow node is `display: contents`, so it
    // has no box to measure; step past those to the first ancestor that does.
    // That container is what the gesture reads its distances against.
    let host: HTMLElement | null = markerRef.current?.parentElement ?? null;
    while (host && getComputedStyle(host).display === 'contents') host = host.parentElement;
    if (!host) return;

    const fire = (payload: Record<string, unknown>) =>
      (handlerRef.current as ((ev: unknown) => void) | undefined)?.(payload);
    const box = () => host!.getBoundingClientRect();
    const cleanups: (() => void)[] = [];

    if (kind === 'zoom') {
      const onWheel = (e: WheelEvent) => {
        if (needMod && !needMod(e)) return;
        e.preventDefault();
        const r = box();
        fire({
          gesture: 'zoom',
          // >1 zooms in, <1 zooms out; the caller multiplies its span by it.
          scale: e.deltaY < 0 ? 1 / 1.15 : 1.15,
          deltaY: e.deltaY,
          atRatio: r.width ? (e.clientX - r.left) / r.width : 0.5,
          width: r.width,
          height: r.height,
        });
      };
      host.addEventListener('wheel', onWheel, { passive: false });
      cleanups.push(() => host!.removeEventListener('wheel', onWheel));
    }

    if (kind === 'pan' || kind === 'brush') {
      let origin: { x: number; y: number; r: DOMRect } | null = null;
      let last = { x: 0, y: 0 };
      const report = (e: PointerEvent, phase: string) => {
        if (!origin) return;
        const { r } = origin;
        const from = kind === 'pan' ? last : { x: origin.x, y: origin.y };
        const dx = e.clientX - from.x;
        const dy = e.clientY - from.y;
        fire({
          gesture: kind,
          phase,
          dx,
          dy,
          dxRatio: r.width ? dx / r.width : 0,
          dyRatio: r.height ? dy / r.height : 0,
          fromRatio: r.width ? (origin.x - r.left) / r.width : 0,
          toRatio: r.width ? (e.clientX - r.left) / r.width : 0,
          width: r.width,
          height: r.height,
        });
        last = { x: e.clientX, y: e.clientY };
      };
      const onDown = (e: PointerEvent) => {
        if (e.button !== 0) return;
        if (needMod && !needMod(e)) return;
        origin = { x: e.clientX, y: e.clientY, r: box() };
        last = { x: e.clientX, y: e.clientY };
        host!.setPointerCapture(e.pointerId);
        fire({ gesture: kind, phase: 'start', dx: 0, dy: 0, dxRatio: 0, dyRatio: 0,
               fromRatio: origin.r.width ? (e.clientX - origin.r.left) / origin.r.width : 0,
               toRatio: origin.r.width ? (e.clientX - origin.r.left) / origin.r.width : 0,
               width: origin.r.width, height: origin.r.height });
      };
      const onMove = (e: PointerEvent) => { if (origin) report(e, 'move'); };
      const onUp = (e: PointerEvent) => {
        if (!origin) return;
        report(e, 'end');
        try { host!.releasePointerCapture(e.pointerId); } catch { /* already released */ }
        origin = null;
      };
      host.addEventListener('pointerdown', onDown);
      host.addEventListener('pointermove', onMove);
      host.addEventListener('pointerup', onUp);
      host.addEventListener('pointercancel', onUp);
      cleanups.push(() => {
        host!.removeEventListener('pointerdown', onDown);
        host!.removeEventListener('pointermove', onMove);
        host!.removeEventListener('pointerup', onUp);
        host!.removeEventListener('pointercancel', onUp);
      });
    }

    return () => cleanups.forEach((fn) => fn());
  }, [spec]);

  return React.createElement('span', { ref: markerRef, 'data-idml-gesture': spec, style: { display: 'none' } });
};

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
const Repeat = ({ data, children, style, fillDirection, flowDirection, ...props }: ComponentProps) => {
  const items = Array.isArray(data) ? data : [];
  // A Repeat lays its items out along ONE axis, in one of two modes (the parser
  // picks based on whether the enclosing container is definite or content-flow):
  //   - `fillDirection` (definite parent): EQUAL-FILL — N items each take 1/N of
  //     the axis (wrapped in a flex:1 cell), filling the cell exactly.
  //   - `flowDirection` (content-flow parent — the container fits or scrolls its
  //     main axis): NATURAL — items keep their declared/content size (LayoutRenderer
  //     cells are flex-shrink:0), so they pack along the axis and the container
  //     scrolls when they overflow.
  // Both are just a flex line in the given direction, so the SAME mechanism works
  // for row or column — a vertical list and a horizontal strip differ only by the
  // parent's direction, with no Repeat-specific code per case.
  const fillDir = fillDirection as 'row' | 'column' | undefined;
  const flowDir = flowDirection as 'row' | 'column' | undefined;
  const dir = fillDir ?? flowDir;
  const boxStyle = dir
    ? { display: 'flex', flexDirection: dir, width: '100%', height: '100%', minWidth: 0, minHeight: 0, ...(style as object) }
    : style; // no layout info (unknown/legacy parent): plain block passthrough
  return React.createElement(
    'div',
    { 'data-idml-repeat': '', style: boxStyle, ...props },
    items.map((item, i) => {
      const content = fillDir
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
      'data-idml-modal': '',
      style: { ...MODAL_PANEL, ...style },
      onClick: (e: React.MouseEvent) => e.stopPropagation(),
      ...props,
    },
    children
  );
  return createPortal(
    React.createElement('div', { 'data-idml-modal-backdrop': '', style: MODAL_BACKDROP, onClick: onClose }, panel),
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
    { 'data-idml-embed': '', style: { ...style, ...EMBED_OUTER }, ...props },
    React.createElement('div', { 'data-idml-embed-inner': '', style: EMBED_INNER }, children)
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
  Hotkey,
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
  Gesture,
};
