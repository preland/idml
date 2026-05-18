'use client';

import React from 'react';
import type { ComponentDef } from '../types';
import { useConfigContext } from './ConfigProvider';
import { useVisibility } from './hooks/useVisibility';
import { resolveTokenProps } from './tokens/token-resolver';
import { getComponent } from './registry/component-registry';
import { BUILTIN_COMPONENTS } from './builtins';
import { getMethod } from './registry/method-registry';

export interface ComponentRendererProps {
  component: ComponentDef;
  components: ComponentDef[];
}

export function ComponentRenderer({
  component,
  components,
}: ComponentRendererProps): React.ReactElement | null {
  const { config } = useConfigContext();
  const isVisible = useVisibility(component.visibility);

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

  const boundProps = useBoundProps(component.bindings ?? []);

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

  return (
    <Component {...component.props} {...boundProps} style={tokenStyle} data-isd-id={component.id}>
      {childElements}
    </Component>
  );
}

function useBoundProps(bindings: any[]): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  for (const binding of bindings) {
    const method = getMethod(binding.methodId);
    if (method && typeof method === 'function') {
      props[binding.prop] = method;
    }
  }
  return props;
}
