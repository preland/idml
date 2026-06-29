'use client';

import React from 'react';
import type { LayoutDef, ComponentDef } from '../types';
import type { DynamicDim } from '../types/layout.types';
import { useConfigContext } from './ConfigProvider';
import { ComponentRenderer, resolveValueRef } from './ComponentRenderer';
import { RepeatItemContext } from './repeat-context';
import { FormStateContext } from './form-context';

interface LayoutRendererProps {
  layout: LayoutDef;
  components: ComponentDef[];
}

const DIM_ANIM: KeyframeAnimationOptions = { duration: 300, easing: 'ease-in-out' };
const toDimStr = (v: unknown): string | undefined =>
  v == null ? undefined : typeof v === 'number' ? `${v}%` : String(v);

export function LayoutRenderer({ layout, components }: LayoutRendererProps): React.ReactElement | null {
  const { config, debug } = useConfigContext();
  // Reactive show/hide: a `?@ref` cell renders only when its ref is truthy.
  // Read contexts unconditionally to keep hook order stable.
  const item = React.useContext(RepeatItemContext);
  const formStore = React.useContext(FormStateContext);

  // Resolve reactive `@ref` dims once (used by both the style and the animation
  // effect). All hooks run BEFORE the visibility early-return so hook order is
  // stable across renders.
  const resolveDyn = (d: DynamicDim): string | undefined => {
    const v = resolveValueRef(d.ref, item, formStore?.values);
    // Conditional dim: pick one of the two inline sizes by the ref's truthiness.
    if (d.whenTrue !== undefined) return v ? d.whenTrue : d.whenFalse;
    return toDimStr(v);
  };
  const dynW = layout.dynamicSize?.width ? resolveDyn(layout.dynamicSize.width) : undefined;
  const dynH = layout.dynamicSize?.height ? resolveDyn(layout.dynamicSize.height) : undefined;
  const elRef = React.useRef<HTMLDivElement>(null);
  const prevDimsRef = React.useRef<{ w?: string; h?: string }>({ w: dynW, h: dynH });
  React.useLayoutEffect(() => {
    const el = elRef.current;
    const prev = prevDimsRef.current;
    if (el && layout.dynamicSize) {
      // Animate size changes with the Web Animations API. CSS transitions on a
      // flex item's width/flex-basis are unreliable (the new value often doesn't
      // apply mid-flex-layout, leaving it stuck); WAA sets the interpolated size
      // each frame, which the flex layout honours — a smooth slide.
      if (dynW !== undefined && prev.w !== undefined && prev.w !== dynW) {
        el.animate([{ width: prev.w }, { width: dynW }], DIM_ANIM);
      }
      if (dynH !== undefined && prev.h !== undefined && prev.h !== dynH) {
        el.animate([{ height: prev.h }, { height: dynH }], DIM_ANIM);
      }
    }
    prevDimsRef.current = { w: dynW, h: dynH };
    // Dev guardrail: an `overflow:hidden` container whose content is TALLER/WIDER
    // than its box is silently CLIPPING (e.g. sidebar items spilling past the
    // column). Tiling validates declared %s at parse time, but content-flow (hug)
    // packs by content and can overflow at runtime — surface that here.
    // (Vertical only — horizontal `overflow:hidden` is the intentional hug/
    // ellipsis clip, e.g. the launcher's collapsed label.)
    if (process.env.NODE_ENV !== 'production' && el) {
      const cs = getComputedStyle(el);
      if (cs.overflowY === 'hidden' && el.scrollHeight - el.clientHeight > 1) {
        console.error(
          `[idml] content overflows its box and is clipped — ` +
            `${el.scrollHeight - el.clientHeight}px taller than its height. ` +
            `Reduce the content or its spacing.`,
          el
        );
      }
    }
  }, [dynW, dynH]);

  if (layout.visibility) {
    const value = resolveValueRef(layout.visibility.ref, item, formStore?.values);
    const visible = layout.visibility.negate ? !value : Boolean(value);
    if (!visible) return null;
  }

  const sizeStyle = resolveSizeStyle(layout.size);
  const gapValue = layout.gap ? resolveGap(layout.gap, config.tokens.spacing) : undefined;

  const containerStyle: React.CSSProperties = {
    ...sizeStyle,
    // Debug aid (opt-in): show bounding boxes for structural Row/Col containers
    // (not component-bound leaf cells). Off by default so pages render cleanly.
    ...(debug && !layout.componentId ? { outline: '1px solid rgba(100,100,100,0.35)' } : {}),
    // Apply .idml inline styles (can override sizeStyle values, e.g. height: '30vh' for scroll pages)
    ...(layout.idmlStyle ?? {}),
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

  // Reactive sizing: apply the `@ref` dims resolved above, overriding the static
  // `size` so a cell can grow/shrink on state (e.g. a collapsing sidebar). The
  // transition between values is handled imperatively by the WAA effect above;
  // `min-width/height:0` lets the box shrink past its content during the slide.
  if (layout.dynamicSize) {
    if (dynW !== undefined) {
      containerStyle.width = dynW;
      containerStyle.minWidth = 0;
    }
    if (dynH !== undefined) {
      containerStyle.height = dynH;
      containerStyle.minHeight = 0;
    }
  }

  // Author-supplied utility classes (e.g. Tailwind) on Row/Col.
  if (layout.className) containerClass += ` ${layout.className}`;
  // Dynamic `@method` classes on a container (resolved per render, reactive to
  // state) — e.g. a pop-up panel's scale/opacity from `@feedbackPanelClass`.
  if (layout.classRefs?.length) {
    for (const ref of layout.classRefs) {
      const cls = resolveValueRef(ref, item, formStore?.values);
      if (cls) containerClass += ` ${cls}`;
    }
  }
  // Conditional class blocks: apply each block's classes when its `?@ref`
  // condition holds (`negate` flips it) — e.g. a pop-up's scale/opacity per
  // @state.feedbackOpen, with the actual classes declared in the .idml.
  if (layout.condClasses?.length) {
    for (const c of layout.condClasses) {
      const v = resolveValueRef(c.ref, item, formStore?.values);
      if (c.negate ? !v : Boolean(v)) containerClass += ` ${c.classes}`;
    }
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
    <div ref={elRef} className={containerClass} style={containerStyle} data-isd-layout>
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
