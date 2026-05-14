'use client';

import { useCallback, useState } from 'react';
import type { UIConfig } from '../../types';

export function useSaveConfig() {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = useCallback(async (config: UIConfig) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/_isd/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `Save failed: ${res.status}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  }, []);

  return { save, saving, error };
}
