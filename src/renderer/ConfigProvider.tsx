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

  // Attach click-to-select listener in dev mode
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;

    const handler = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest('[data-isd-id]');
      if (target) {
        const id = target.getAttribute('data-isd-id');
        window.parent.postMessage({ type: 'isd:select', componentId: id }, window.location.origin);
      }
    };

    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  if (!validConfig) return null;

  const tokenVars = injectTokenVars(validConfig.tokens, darkMode);
  const darkCss = buildDarkCss(validConfig.darkStyles);

  return (
    <ConfigContext.Provider value={{ config: validConfig, darkMode, setDarkMode, tokenVars, debug }}>
      <div style={tokenVars as React.CSSProperties}>
        {darkCss ? <style dangerouslySetInnerHTML={{ __html: darkCss }} /> : null}
        {children}
      </div>
    </ConfigContext.Provider>
  );
}
