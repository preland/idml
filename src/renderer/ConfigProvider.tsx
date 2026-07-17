'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { UIConfig } from '../types';
import type { DarkRule } from '../types/config.types';
import { validateConfig } from '../schema/config.schema';
import { injectTokenVars } from './tokens/token-resolver';
import { registerMethod, clearRegistry } from './registry/method-registry';
import { registerComponent, clearComponentRegistry } from './registry/component-registry';

/** Compile the DSL `dark { }` rules into a scoped stylesheet. Each rule is
 *  emitted under `.dark .idml-root` (so it only bites when an ancestor toggles
 *  the `dark` class and the element is inside an idml page). `!important` beats
 *  the light Tailwind utilities; selector specificity resolves any overlaps
 *  (e.g. a `.leaflet-container` reset beats the broad `.idml-root` color). */
function buildDarkCss(rules?: DarkRule[]): string {
  if (!rules || rules.length === 0) return '';
  const kebab = (k: string) => k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
  return rules
    .map((r) => {
      const sel = r.selector
        .split(',')
        .map((s) => `.dark .idml-root ${s.trim()}`.trim())
        .join(', ');
      const body = Object.entries(r.style)
        .map(([k, v]) => `${kebab(k)}: ${v} !important`)
        .join('; ');
      return `${sel} { ${body} }`;
    })
    .join('\n');
}

export interface ConfigContextValue {
  config: UIConfig;
  darkMode: boolean;
  setDarkMode: (value: boolean) => void;
  tokenVars: Record<string, string>;
  /**
   * When true, structural Row/Col containers are drawn with a debug bounding-box
   * outline. Off by default so rendered pages look like real pages; the editor
   * preview can opt in to visualise layout structure.
   */
  debug: boolean;
  /**
   * True when the page is rendered inside the visual editor's preview iframe
   * (detected from the `__idmlEditor` query param). Turns on `data-idml-id` on
   * every node + the hover/right-click-select/highlight overlay machinery.
   */
  editorMode: boolean;
}

// Exported so tests (and other low-level consumers) can render the renderer
// tree against a hand-built context without ConfigProvider's effect-driven
// config validation — which never runs under server-side rendering.
export const ConfigContext = createContext<ConfigContextValue | undefined>(undefined);

export function useConfigContext(): ConfigContextValue {
  const ctx = useContext(ConfigContext);
  if (!ctx) throw new Error('useConfigContext must be used inside <ConfigProvider>');
  return ctx;
}

export interface MethodRegistration {
  id: string;
  fn: (...args: unknown[]) => unknown;
}

export interface ComponentRegistration {
  name: string;
  component: React.ComponentType<Record<string, unknown>>;
}

export interface ConfigProviderProps {
  config: UIConfig | unknown;
  methods?: MethodRegistration[];
  components?: ComponentRegistration[];
  children: React.ReactNode;
  onConfigInvalid?: (error: Error) => void;
  /** Draw debug bounding boxes around structural containers. Default false. */
  debug?: boolean;
}

export function ConfigProvider({
  config: rawConfig,
  methods = [],
  components = [],
  children,
  onConfigInvalid,
  debug = false,
}: ConfigProviderProps): React.ReactElement | null {
  const [validConfig, setValidConfig] = useState<UIConfig | null>(null);
  const [darkMode, setDarkMode] = useState(false);
  const [editorMode, setEditorMode] = useState(false);

  // Detect the editor preview iframe (client-only, so SSR stays deterministic).
  // window.name (set on the iframe element) survives the app's client-side
  // redirects; the query param is a fallback for a first paint before any nav.
  useEffect(() => {
    try {
      const byName = window.name === '__idmlEditorPreview';
      const byParam = new URLSearchParams(window.location.search).has('__idmlEditor');
      setEditorMode(byName || byParam);
    } catch {
      /* non-browser */
    }
  }, []);

  useEffect(() => {
    try {
      const parsed = validateConfig(rawConfig);
      setValidConfig(parsed);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      onConfigInvalid?.(error);
    }
  }, [rawConfig, onConfigInvalid]);

  useEffect(() => {
    clearRegistry();
    for (const { id, fn } of methods) {
      registerMethod(id, fn);
    }
  }, [methods]);

  useEffect(() => {
    clearComponentRegistry();
    for (const { name, component } of components) {
      registerComponent(name, component);
    }
  }, [components]);

  // Editor preview interaction: hover-highlight every node, right-click to select
  // (persistent highlight in a distinct colour), and accept selection changes from
  // the parent editor (tree / breadcrumb clicks). Overlays are pointer-events:none
  // fixed boxes so they never block the underlying page. Because every pixel in an
  // idml layout belongs to a tiled node, `closest('[data-idml-id]')` from the
  // event target always resolves to the nearest authored node — so hovering the
  // viewport always highlights something (a leaf, or its container).
  useEffect(() => {
    if (!editorMode || typeof document === 'undefined') return;

    const mkOverlay = (border: string, fill: string): HTMLDivElement => {
      const d = document.createElement('div');
      Object.assign(d.style, {
        position: 'fixed', pointerEvents: 'none', zIndex: '2147483647',
        border: `2px solid ${border}`, background: fill, boxSizing: 'border-box',
        display: 'none', borderRadius: '2px', transition: 'left 40ms linear, top 40ms linear, width 40ms linear, height 40ms linear',
      } as CSSStyleDeclaration);
      document.body.appendChild(d);
      return d;
    };
    const hoverBox = mkOverlay('#f59e0b', 'rgba(245,158,11,0.14)'); // amber = hover
    const selBox = mkOverlay('#2563eb', 'rgba(37,99,235,0.14)'); // blue = selected
    let selId: string | null = null;

    const nodeFrom = (t: EventTarget | null): HTMLElement | null =>
      t instanceof HTMLElement ? t.closest('[data-idml-id]') : null;
    const elFor = (id: string | null): HTMLElement | null =>
      id ? document.querySelector<HTMLElement>(`[data-idml-id="${(window.CSS?.escape ?? ((s: string) => s))(id)}"]`) : null;
    const place = (box: HTMLDivElement, el: HTMLElement | null) => {
      if (!el) { box.style.display = 'none'; return; }
      const r = el.getBoundingClientRect();
      box.style.display = 'block';
      box.style.left = `${r.left}px`;
      box.style.top = `${r.top}px`;
      box.style.width = `${r.width}px`;
      box.style.height = `${r.height}px`;
    };
    const placeSel = () => place(selBox, elFor(selId));

    const onMove = (e: MouseEvent) => {
      const node = nodeFrom(e.target);
      const id = node?.getAttribute('data-idml-id') ?? null;
      // Hide hover on the already-selected node so its blue highlight stands alone.
      if (!node || (id && id === selId)) { hoverBox.style.display = 'none'; return; }
      place(hoverBox, node);
    };
    const onLeave = () => { hoverBox.style.display = 'none'; };
    const onContext = (e: MouseEvent) => {
      const node = nodeFrom(e.target);
      if (!node) return;
      e.preventDefault();
      selId = node.getAttribute('data-idml-id');
      hoverBox.style.display = 'none';
      placeSel();
      window.parent.postMessage({ type: 'idml:select', componentId: selId }, window.location.origin);
    };
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === 'idml:setSelection') {
        selId = typeof e.data.id === 'string' ? e.data.id : null;
        placeSel();
      }
    };
    const onScroll = () => placeSel();

    document.addEventListener('mousemove', onMove, true);
    document.addEventListener('mouseleave', onLeave);
    document.addEventListener('contextmenu', onContext, true);
    window.addEventListener('message', onMessage);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('mousemove', onMove, true);
      document.removeEventListener('mouseleave', onLeave);
      document.removeEventListener('contextmenu', onContext, true);
      window.removeEventListener('message', onMessage);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
      hoverBox.remove();
      selBox.remove();
    };
  }, [editorMode]);

  if (!validConfig) return null;

  const tokenVars = injectTokenVars(validConfig.tokens, darkMode);
  const darkCss = buildDarkCss(validConfig.darkStyles);

  return (
    <ConfigContext.Provider value={{ config: validConfig, darkMode, setDarkMode, tokenVars, debug, editorMode }}>
      <div style={tokenVars as React.CSSProperties}>
        {darkCss ? <style dangerouslySetInnerHTML={{ __html: darkCss }} /> : null}
        {children}
      </div>
    </ConfigContext.Provider>
  );
}
