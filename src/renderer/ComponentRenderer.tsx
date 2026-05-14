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

  const tokenStyle = resolveTokenProps(component.tokenProps, config.tokens);

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
    if (method) {
      props[binding.prop] = typeof method === 'function' ? method : method?.();
    }
  }
  return props;
}
