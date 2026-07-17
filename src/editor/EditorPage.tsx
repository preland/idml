'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { ComponentTree } from './panels/ComponentTree';
import { LivePreview } from './panels/LivePreview';
import { SourceEditPanel, type Origin, type Variant, type Values } from './panels/SourceEditPanel';

// The idml visual editor. It edits ONE page at a time (component ids are per-page
// and must match the ids the real page renders as data-idml-id, so click-to-select
// works). The centre pane is a live iframe of the real route; the right pane edits
// the selected component's authored source and writes it back via /api/idml/save.

interface PageComponent {
  id: string;
  type?: string;
  components?: PageComponent[];
}
// The rendered layout tree — used to compute a selected node's ancestor chain
// (for the breadcrumb) since containers aren't in the flat `components` list.
interface LayoutNode {
  nodeId?: string;
  componentId?: string;
  children?: LayoutNode[];
}
interface EditorPayload {
  route: string;
  file: string;
  config: { pages: { route: string; components: PageComponent[]; layout: LayoutNode }[]; tokens?: unknown };
  origins: Record<string, Origin>;
  variants: Record<string, Variant>;
  values: Record<string, Values>;
  undoDepth: number;
}

/** The chain of node ids from the outermost identified ancestor down to `targetId`
 *  (inclusive), by walking the layout tree. Empty if not found. */
function ancestorPath(root: LayoutNode | undefined, targetId: string): string[] {
  if (!root) return [];
  const walk = (node: LayoutNode, trail: string[]): string[] | null => {
    const id = node.componentId ?? node.nodeId;
    const here = id ? [...trail, id] : trail;
    if (id === targetId) return here;
    for (const child of node.children ?? []) {
      const found = walk(child, here);
      if (found) return found;
    }
    return null;
  };
  return walk(root, []) ?? [];
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
    fetch('/api/idml/pages')
      .then((r) => r.json())
      .then((d) => {
        setPages(d.pages ?? []);
        if (d.pages?.[0]) setRoute(d.pages[0].route);
      })
      .catch((e) => setError(String(e)));
  }, []);

  const loadConfig = useCallback((r: string) => {
    setError(null);
    fetch(`/api/idml/config?route=${encodeURIComponent(r)}`)
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
    const es = new EventSource('/api/idml/events');
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

  const [undoing, setUndoing] = useState(false);
  const undo = useCallback(async () => {
    setUndoing(true);
    try {
      await fetch('/api/idml/undo', { method: 'POST' });
    } finally {
      setUndoing(false);
      if (route) loadConfig(route);
      setPreviewNonce((n) => n + 1);
    }
  }, [route, loadConfig]);

  const page = data?.config.pages[0];
  const origin = selectedId ? data?.origins[selectedId] : undefined;
  const variant = origin?.variant ? data?.variants[origin.variant] : undefined;
  const values = selectedId ? data?.values[selectedId] : undefined;
  const labelFor = (id: string) => data?.values[id]?.name ?? findType(page?.components ?? [], id) ?? id;
  const selectedType = selectedId ? labelFor(selectedId) : undefined;
  // Ancestor chain of the selection, so containers up the hierarchy are reachable
  // by clicking a breadcrumb (they can't all be hit directly in the viewport).
  const crumbs = selectedId && page ? ancestorPath(page.layout, selectedId) : [];

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh', fontFamily: 'system-ui' }}>
      {/* Left: page switcher + component tree */}
      <div style={{ width: '20%', borderRight: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '8px', borderBottom: '1px solid #e5e7eb' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={{ fontSize: '11px', fontWeight: 600 }}>idml editor</span>
            <button
              onClick={undo}
              disabled={undoing || !data || data.undoDepth === 0}
              title={data && data.undoDepth > 0 ? `Undo last save (${data.undoDepth})` : 'Nothing to undo'}
              style={{
                fontSize: '11px',
                padding: '2px 8px',
                borderRadius: '4px',
                border: '1px solid #d1d5db',
                background: '#fff',
                cursor: !data || data.undoDepth === 0 || undoing ? 'not-allowed' : 'pointer',
                opacity: !data || data.undoDepth === 0 ? 0.5 : 1,
              }}
            >
              ↶ Undo{data && data.undoDepth > 0 ? ` (${data.undoDepth})` : ''}
            </button>
          </div>
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
        {route && (
          <LivePreview
            pageRoute={route}
            onComponentSelect={setSelectedId}
            selectedId={selectedId}
            reloadNonce={previewNonce}
          />
        )}
      </div>

      {/* Right: source editor */}
      <div style={{ width: '26%', borderLeft: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '8px', borderBottom: '1px solid #e5e7eb', fontSize: '12px', fontWeight: 600 }}>
          Edit source
        </div>
        {/* Ancestor breadcrumb — click to select a container up the hierarchy. */}
        {crumbs.length > 0 && (
          <div style={{ padding: '6px 8px', borderBottom: '1px solid #e5e7eb', fontSize: '10px', display: 'flex', flexWrap: 'wrap', gap: '1px', alignItems: 'center', lineHeight: 1.6 }}>
            {crumbs.map((id, i) => (
              <React.Fragment key={id}>
                {i > 0 && <span style={{ color: '#9ca3af', margin: '0 1px' }}>›</span>}
                <button
                  onClick={() => setSelectedId(id)}
                  title={id}
                  style={{
                    fontSize: '10px', padding: '1px 4px', border: 'none', borderRadius: '3px', cursor: 'pointer',
                    background: id === selectedId ? '#dbeafe' : 'transparent',
                    color: id === selectedId ? '#1a56db' : '#374151',
                    fontWeight: id === selectedId ? 600 : 400,
                  }}
                >
                  {labelFor(id)}
                </button>
              </React.Fragment>
            ))}
          </div>
        )}
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
