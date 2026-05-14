'use client';

import React, { useEffect, useState } from 'react';
import type { UIConfig } from '../types';
import { useEditorState } from './hooks/useEditorState';
import { useSSEConfig } from './hooks/useSSEConfig';
import { useSaveConfig } from './hooks/useSaveConfig';
import { ComponentTree } from './panels/ComponentTree';
import { LivePreview } from './panels/LivePreview';
import { PropertyPanel } from './panels/PropertyPanel';

export function EditorPage(): React.ReactElement {
  const [initialConfig, setInitialConfig] = useState<UIConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/_isd/config')
      .then((r) => r.json())
      .then((config: UIConfig) => {
        setInitialConfig(config);
        setLoading(false);
      })
      .catch((err) => {
        console.error('[isd-ui editor] Failed to load config:', err);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <div style={{ padding: '16px' }}>Loading editor...</div>;
  }

  if (!initialConfig) {
    return <div style={{ padding: '16px', color: '#dc2626' }}>Failed to load configuration</div>;
  }

  return <EditorShell initialConfig={initialConfig} />;
}

function EditorShell({ initialConfig }: { initialConfig: UIConfig }): React.ReactElement {
  const { state, selectComponent, selectPage, updateConfig, undo, redo } =
    useEditorState(initialConfig);
  const { save, saving, error } = useSaveConfig();

  useSSEConfig((fresh) => {
    updateConfig(fresh);
  });

  const activePage = state.config.pages.find((p) => p.route === state.selectedPageRoute);
  const selectedComponent = activePage?.components.find((c) => c.id === state.selectedComponentId);

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh', fontFamily: 'system-ui' }}>
      {/* Left panel */}
      <div style={{ width: '20%', borderRight: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '8px', borderBottom: '1px solid #e5e7eb', fontSize: '12px', fontWeight: 600 }}>
          Structure
        </div>
        <ComponentTree
          pages={state.config.pages}
          selectedId={state.selectedComponentId}
          onSelect={selectComponent}
          onPageChange={selectPage}
        />
      </div>

      {/* Center panel */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div
          style={{
            padding: '8px',
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            gap: '8px',
            alignItems: 'center',
            fontSize: '12px',
          }}
        >
          <button
            onClick={undo}
            disabled={state.history.length === 0}
            style={{
              padding: '4px 8px',
              fontSize: '11px',
              cursor: state.history.length === 0 ? 'not-allowed' : 'pointer',
              opacity: state.history.length === 0 ? 0.5 : 1,
            }}
          >
            ↶ Undo
          </button>
          <button
            onClick={redo}
            disabled={state.future.length === 0}
            style={{
              padding: '4px 8px',
              fontSize: '11px',
              cursor: state.future.length === 0 ? 'not-allowed' : 'pointer',
              opacity: state.future.length === 0 ? 0.5 : 1,
            }}
          >
            ↷ Redo
          </button>
          <button
            onClick={() => save(state.config)}
            disabled={saving}
            style={{
              padding: '4px 8px',
              fontSize: '11px',
              background: '#dbeafe',
              color: '#1a56db',
              border: 'none',
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? '⋯ Saving' : '💾 Save'}
          </button>
          {error && (
            <div style={{ fontSize: '10px', color: '#dc2626', flex: 1 }}>
              Error: {error}
            </div>
          )}
        </div>
        {activePage && (
          <LivePreview pageRoute={state.selectedPageRoute} onComponentSelect={selectComponent} />
        )}
      </div>

      {/* Right panel */}
      <div style={{ width: '25%', borderLeft: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '8px', borderBottom: '1px solid #e5e7eb', fontSize: '12px', fontWeight: 600 }}>
          Properties
        </div>
        <div style={{ flex: 1, overflow: 'auto' }}>
          {selectedComponent && activePage ? (
            <PropertyPanel
              component={selectedComponent}
              tokens={state.config.tokens}
              onChange={(updated) => {
                const newPages = state.config.pages.map((p) =>
                  p.route === state.selectedPageRoute
                    ? {
                        ...p,
                        components: p.components.map((c) =>
                          c.id === updated.id ? updated : c
                        ),
                      }
                    : p
                );
                updateConfig({ ...state.config, pages: newPages });
              }}
            />
          ) : (
            <div style={{ padding: '12px', fontSize: '12px', color: '#6b7280' }}>
              Select a component to edit its properties
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
