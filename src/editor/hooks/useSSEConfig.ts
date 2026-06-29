'use client';

import { useEffect, useCallback } from 'react';
import type { UIConfig } from '../../types';

export function useSSEConfig(onConfigChange: (config: UIConfig) => void): void {
  const handleChange = useCallback(() => {
    fetch('/api/_isd/config')
      .then((r) => r.json())
      .then((raw: unknown) => onConfigChange(raw as UIConfig))
      .catch((err) => console.error('[idml editor] Failed to reload config:', err));
  }, [onConfigChange]);

  useEffect(() => {
    const es = new EventSource('/api/_isd/events');

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'config:change') {
          handleChange();
        }
      } catch {
        // ignore parse errors
      }
    };

    es.onerror = () => {
      console.warn('[idml editor] SSE connection lost, will retry automatically');
    };

    return () => es.close();
  }, [handleChange]);
}
