'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { ComponentTree } from './panels/ComponentTree';
import { LivePreview } from './panels/LivePreview';
import { SourceEditPanel, type Origin, type Variant, type Values } from './panels/SourceEditPanel';

// The idml visual editor. It edits ONE page at a time (component ids are per-page
// and must match the ids the real page renders as data-isd-id, so click-to-select
// works). The centre pane is a live iframe of the real route; the right pane edits
// the selected component's authored source and writes it back via /api/_isd/save.

interface PageComponent {
  id: string;
  type?: string;
  components?: PageComponent[];
}
interface EditorPayload {
  route: string;
  file: string;
  config: { pages: { route: string; components: PageComponent[] }[]; tokens?: unknown };
  origins: Record<string, Origin>;
  variants: Record<string, Variant>;
  values: Record<string, Values>;
}

export function EditorPage(): React.ReactElement {
  const [pages, setPages] = useState<{ route: string; file: string }[]>([]);
  const [route, setRoute] = useState<string | null>(null);
  const [data, setData] = useState<EditorPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewNonce, setPreviewNonce] = useState(0);

  // Page list for the switcher.
  useEffect(() => {
    fetch('/api/_isd/pages')
      .then((r) => r.json())
      .then((d) => {
        setPages(d.pages ?? []);
        if (d.pages?.[0]) setRoute(d.pages[0].route);
      })
      .catch((e) => setError(String(e)));
  }, []);

  const loadConfig = useCallback((r: string) => {
    setError(null);
    fetch(`/api/_isd/config?route=${encodeURIComponent(r)}`)
      .then(async (res) => {
        if (!res.ok) {
          const e = await res.json().catch(() => ({}));
          setData(null);
          setError(e.error || `Failed to load ${r} (${res.status})`);
          return;
        }
        setData(await res.json());
      })
      .catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    if (route) {
      setSelectedId(null);
      loadConfig(route);
    }
  }, [route, loadConfig]);

  // Reload on any .idml change (our own saves, or an external editor).
  useEffect(() => {
    const es = new EventSource('/api/_isd/events');
    es.onmessage = (ev) => {
      try {
        if (JSON.parse(ev.data).type === 'config:change' && route) {
          loadConfig(route);
          setPreviewNonce((n) => n + 1);
        }
      } catch {
        /* ignore */
      }
    };
    return () => es.close();
  }, [route, loadConfig]);

  const onSaved = useCallback(() => {
    if (route) loadConfig(route);
    setPreviewNonce((n) => n + 1);
  }, [route, loadConfig]);

  const page = data?.config.pages[0];
  const origin = selectedId ? data?.origins[selectedId] : undefined;
  const variant = origin?.variant ? data?.variants[origin.variant] : undefined;
  const values = selectedId ? data?.values[selectedId] : undefined;
  const selectedType = selectedId ? findType(page?.components ?? [], selectedId) : undefined;

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh', fontFamily: 'system-ui' }}>
      {/* Left: page switcher + component tree */}
      <div style={{ width: '20%', borderRight: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '8px', borderBottom: '1px solid #e5e7eb' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, marginBottom: '4px' }}>idml editor</div>
          <select
            value={route ?? ''}
            onChange={(e) => setRoute(e.target.value)}
            style={{ width: '100%', padding: '4px', fontSize: '12px' }}
          >
            {pages.map((p) => (
              <option key={p.route} value={p.route}>
                {p.route}
              </option>
            ))}
          </select>
        </div>
        <div style={{ flex: 1, overflow: 'auto' }}>
          {page ? (
            <ComponentTree
              pages={[page] as never}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onPageChange={() => undefined}
            />
          ) : (
            <div style={{ padding: '12px', fontSize: '12px', color: error ? '#dc2626' : '#6b7280' }}>
              {error ?? 'Loading…'}
            </div>
          )}
        </div>
      </div>

      {/* Centre: live preview */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {route && <LivePreview pageRoute={route} onComponentSelect={setSelectedId} reloadNonce={previewNonce} />}
      </div>

      {/* Right: source editor */}
      <div style={{ width: '26%', borderLeft: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '8px', borderBottom: '1px solid #e5e7eb', fontSize: '12px', fontWeight: 600 }}>
          Edit source
        </div>
        <div style={{ flex: 1, overflow: 'auto' }}>
          {route && (
            <SourceEditPanel
              route={route}
              componentId={selectedId}
              componentType={selectedType}
              origin={origin}
              variant={variant}
              values={values}
              onSaved={onSaved}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/** Find a component's type by id in the (possibly nested) component list. */
function findType(components: PageComponent[], id: string): string | undefined {
  for (const c of components) {
    if (c.id === id) return c.type;
    if (c.components) {
      const t = findType(c.components, id);
      if (t) return t;
    }
  }
  return undefined;
}
