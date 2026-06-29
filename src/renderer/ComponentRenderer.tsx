'use client';

import React from 'react';
import type { ComponentDef } from '../types';
import { useConfigContext } from './ConfigProvider';
import { useVisibility } from './hooks/useVisibility';
import { resolveTokenProps } from './tokens/token-resolver';
import { getComponent } from './registry/component-registry';
import { BUILTIN_COMPONENTS } from './builtins';
import { getMethod } from './registry/method-registry';
import { RepeatItemContext } from './repeat-context';
import { FormStateContext } from './form-context';

export interface ComponentRendererProps {
  component: ComponentDef;
  components: ComponentDef[];
  /**
   * Rendered children to place inside this component (the "slot"). Supplied by
   * the LayoutRenderer when a layout node binds a component AND has layout
   * children — e.g. a custom container like `Card`/`DefaultPageFormat`. When
   * present it takes precedence over the component's own `children` defs.
   */
  slot?: React.ReactNode;
}

export function ComponentRenderer({
  component,
  components,
  slot,
}: ComponentRendererProps): React.ReactElement | null {
  const { config } = useConfigContext();
  const isVisible = useVisibility(component.visibility);
  // Evaluate bindings before any early return so hook order stays stable —
  // a 'value' binding may call a method that is itself a hook (useQuery/useState).
  const boundProps = useBoundProps(component.bindings ?? []);

  if (!isVisible) return null;

  // Block-like components fill their cell; text/heading stay natural height so
  // the parent flex container can centre them vertically.
  const FILL_HEIGHT = new Set(['Button', 'Image', 'Card', 'Divider', 'Spacer']);
  const tokenStyle = {
    width: '100%',
    ...(FILL_HEIGHT.has(component.type) ? { height: '100%' } : {}),
    boxSizing: 'border-box' as const,
    ...resolveTokenProps(component.tokenProps, config.tokens),
    ...(component.isdwStyle ?? {}),
  };

  const childElements = (component.children ?? []).map((child) => (
    <ComponentRenderer key={child.id} component={child} components={components} />
  ));

  const Component =
    getComponent(component.type) ??
    (BUILTIN_COMPONENTS as Record<string, any>)[component.type];

  if (!Component) {
    console.warn(`[isd-ui] Unknown component type "${component.type}"`);
    return null;
  }

  const content = slot ?? childElements;
  const hasContent = Array.isArray(content) ? content.length > 0 : content != null;

  const props: Record<string, unknown> = {
    ...component.props,
    ...boundProps,
    style: tokenStyle,
    'data-isd-id': component.id,
  };
  // className = static author classes + any dynamic `@method` classes (resolved
  // into boundProps.className), merged so both apply.
  const mergedClass = [component.className, boundProps.className as string | undefined]
    .filter(Boolean)
    .join(' ');
  if (mergedClass) props.className = mergedClass;
  else delete props.className;

  // Don't pass children to childless components — void elements (input, etc.)
  // error if given any children, even an empty array.
  return hasContent
    ? <Component {...props}>{content}</Component>
    : <Component {...props} />;
}

function useBoundProps(
  bindings: { prop: string; methodId: string; kind?: 'handler' | 'value' | 'model' }[]
): Record<string, unknown> {
  // The current Repeat row and the enclosing form-state scope. Read once,
  // unconditionally, to keep hook order stable.
  const item = React.useContext(RepeatItemContext);
  const formStore = React.useContext(FormStateContext);

  const props: Record<string, unknown> = {};
  for (const binding of bindings) {
    if (binding.kind === 'value') {
      // Resolve the method/path to a live value. If a referenced method is a hook
      // this subscribes the component and re-renders when its value changes.
      const resolved = resolveValueRef(binding.methodId, item, formStore?.values);
      // Multiple `@class` bindings accumulate onto one className string.
      if (binding.prop === 'className') {
        props.className = [props.className, resolved].filter(Boolean).join(' ');
      } else {
        props[binding.prop] = resolved;
      }
    } else if (binding.kind === 'model') {
      // Two-way: read the form-state cell into the prop, and write it back on change.
      const name = binding.methodId;
      const isChecked = binding.prop === 'checked';
      const current = formStore?.values[name];
      props[binding.prop] = isChecked ? Boolean(current) : (current ?? '');
      props.onChange = (e: { target?: { value?: unknown; checked?: unknown } }) =>
        formStore?.setValue(name, isChecked ? e?.target?.checked : e?.target?.value);
    } else {
      // Handler: wrap the method so it receives the current form values plus a
      // helpers object: `handler(values, { set, event, item })`. `set(name, value)`
      // writes form state (e.g. to open/close a Modal via `@state.x`); `item` is the
      // current Repeat row, so a per-row handler (e.g. a table's Edit button) knows
      // which record it was fired for.
      const method = getMethod(binding.methodId);
      if (typeof method === 'function') {
        const fn = method as (...a: unknown[]) => unknown;
        props[binding.prop] = (event: unknown) =>
          fn(formStore?.values ?? {}, {
            set: (name: string, value: unknown) => formStore?.setValue(name, value),
            event,
            item,
          });
      }
    }
  }
  return props;
}

/**
 * Resolve a value-reference path. The first segment selects the source:
 * - `item`  — the current Repeat row
 * - `state` — the enclosing form-state store (so `@state.isOpen` reads UI state)
 * - anything else — a registered method, called for its value
 * Each later segment indexes into the result. Examples: `users`, `item.name`,
 * `state.isCreateOpen`, `currentUser.email`.
 */
export function resolveValueRef(ref: string, item: unknown, state?: Record<string, unknown>): unknown {
  const segments = ref.split('.');
  let base: unknown;
  if (segments[0] === 'item') {
    base = item;
  } else if (segments[0] === 'state') {
    base = state;
  } else {
    // Pass the current row item AND the form state so a method can compute a
    // value from either — e.g. a role → colour-class mapping (per-row) or a
    // state-driven animation class (`feedbackOpen` → scale-100/scale-0). Plain
    // methods simply ignore the extra arguments.
    const method = getMethod(segments[0]);
    base =
      typeof method === 'function'
        ? (method as (it: unknown, st?: Record<string, unknown>) => unknown)(item, state)
        : undefined;
  }
  for (let i = 1; i < segments.length; i++) {
    if (base == null) return undefined;
    base = (base as Record<string, unknown>)[segments[i]];
  }
  return base;
}
