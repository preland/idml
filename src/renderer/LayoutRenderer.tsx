'use client';

import React from 'react';
import type { LayoutDef, ComponentDef } from '../types';
import { useConfigContext } from './ConfigProvider';
import { ComponentRenderer } from './ComponentRenderer';

interface LayoutRendererProps {
  layout: LayoutDef;
  components: ComponentDef[];
}

export function LayoutRenderer({ layout, components }: LayoutRendererProps): React.ReactElement {
  const { config } = useConfigContext();

  const sizeStyle = resolveSizeStyle(layout.size);
  const gapValue = layout.gap ? resolveGap(layout.gap, config.tokens.spacing) : undefined;

  const containerStyle: React.CSSProperties = {
    ...sizeStyle,
    // Show bounding boxes for structural Row/Col containers (not component-bound leaf cells)
    ...(layout.componentId ? {} : { outline: '1px solid rgba(100,100,100,0.35)' }),
    // Apply .isdw inline styles (can override sizeStyle values, e.g. height: '30vh' for scroll pages)
    ...(layout.isdwStyle ?? {}),
    // Prevent flex children from shrinking so percentage/vh heights are respected and scroll works
    flexShrink: 0,
  };

  let containerClass = '';

  if (layout.type === 'flex') {
    containerClass = 'flex';
    containerStyle.flexDirection = layout.direction;
    if (layout.wrap) containerStyle.flexWrap = layout.wrap;
    if (layout.justifyContent) containerStyle.justifyContent = layout.justifyContent;
    if (layout.alignItems) containerStyle.alignItems = layout.alignItems;
    if (gapValue) containerStyle.gap = gapValue;
  } else {
    containerClass = 'grid';
    containerStyle.gridTemplateColumns = `repeat(${layout.columns}, minmax(0, 1fr))`;
    if (layout.rows) containerStyle.gridTemplateRows = `repeat(${layout.rows}, minmax(0, 1fr))`;
    if (gapValue) containerStyle.gap = gapValue;
  }

  const boundComponent = layout.componentId
    ? components.find((c) => c.id === layout.componentId)
    : undefined;

  const children = layout.children.map((child, i) => (
    <LayoutRenderer key={i} layout={child} components={components} />
  ));

  // A node can both bind a component AND carry layout children — that's a custom
  // container (e.g. Card, or an imported DefaultPageFormat). The children are
  // rendered and handed to the component as its slot, so the component decides
  // where they go (directly, or at a `Children` marker once definitions land).
  return (
    <div className={containerClass} style={containerStyle} data-isd-layout>
      {boundComponent ? (
        <ComponentRenderer
          component={boundComponent}
          components={components}
          slot={layout.children.length > 0 ? children : undefined}
        />
      ) : (
        children
      )}
    </div>
  );
}

function resolveSizeStyle(size: LayoutDef['size']): React.CSSProperties {
  if (!size) return {};
  const s: React.CSSProperties = {};
  if (size.width) s.width = size.width;
  if (size.height) s.height = size.height;
  if (size.minWidth) s.minWidth = size.minWidth;
  if (size.minHeight) s.minHeight = size.minHeight;
  if (size.maxWidth) s.maxWidth = size.maxWidth;
  if (size.maxHeight) s.maxHeight = size.maxHeight;
  return s;
}

function resolveGap(tokenName: string, spacingTokens: any[]): string | undefined {
  return spacingTokens.find((t) => t.name === tokenName)?.value;
}
