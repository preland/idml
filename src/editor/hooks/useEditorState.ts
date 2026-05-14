'use client';

import { useState, useCallback } from 'react';
import type { UIConfig } from '../../types';

export interface EditorState {
  config: UIConfig;
  selectedComponentId: string | null;
  selectedPageRoute: string;
  history: UIConfig[];
  future: UIConfig[];
}

export function useEditorState(initialConfig: UIConfig) {
  const [state, setState] = useState<EditorState>({
    config: initialConfig,
    selectedComponentId: null,
    selectedPageRoute: initialConfig.pages[0]?.route ?? '/',
    history: [],
    future: [],
  });

  const selectComponent = useCallback((id: string | null) => {
    setState((s) => ({ ...s, selectedComponentId: id }));
  }, []);

  const selectPage = useCallback((route: string) => {
    setState((s) => ({ ...s, selectedPageRoute: route, selectedComponentId: null }));
  }, []);

  const updateConfig = useCallback((next: UIConfig) => {
    setState((s) => ({
      ...s,
      config: next,
      history: [...s.history, s.config].slice(-50),
      future: [],
    }));
  }, []);

  const undo = useCallback(() => {
    setState((s) => {
      if (s.history.length === 0) return s;
      const prev = s.history[s.history.length - 1];
      return {
        ...s,
        config: prev,
        history: s.history.slice(0, -1),
        future: [s.config, ...s.future],
      };
    });
  }, []);

  const redo = useCallback(() => {
    setState((s) => {
      if (s.future.length === 0) return s;
      const next = s.future[0];
      return {
        ...s,
        config: next,
        history: [...s.history, s.config],
        future: s.future.slice(1),
      };
    });
  }, []);

  return { state, selectComponent, selectPage, updateConfig, undo, redo };
}
