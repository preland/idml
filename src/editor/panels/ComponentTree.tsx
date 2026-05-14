'use client';

import React from 'react';
import type { PageDef, ComponentDef } from '../../types';

interface ComponentTreeProps {
  pages: PageDef[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onPageChange: (route: string) => void;
}

export function ComponentTree({
  pages,
  selectedId,
  onSelect,
  onPageChange,
}: ComponentTreeProps): React.ReactElement {
  return (
    <div style={{ padding: '12px', overflow: 'auto', height: '100%' }}>
      <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '8px' }}>Pages</div>
      {pages.map((page) => (
        <div key={page.route} style={{ marginBottom: '12px' }}>
          <button
            onClick={() => onPageChange(page.route)}
            style={{
              display: 'block',
              width: '100%',
              padding: '6px 8px',
              textAlign: 'left',
              border: '1px solid #d1d5db',
              background: '#f9fafb',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 500,
            }}
          >
            {page.route}
          </button>
          <div style={{ paddingLeft: '8px', marginTop: '4px' }}>
            {page.components.map((comp) => (
              <ComponentTreeItem
                key={comp.id}
                component={comp}
                selected={selectedId === comp.id}
                onSelect={onSelect}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ComponentTreeItem({
  component,
  selected,
  onSelect,
}: {
  component: ComponentDef;
  selected: boolean;
  onSelect: (id: string) => void;
}): React.ReactElement {
  return (
    <div>
      <button
        onClick={() => onSelect(component.id)}
        style={{
          display: 'block',
          width: '100%',
          padding: '4px 6px',
          textAlign: 'left',
          border: selected ? '1px solid #1a56db' : '1px solid transparent',
          background: selected ? '#eff6ff' : 'transparent',
          cursor: 'pointer',
          fontSize: '11px',
          marginBottom: '2px',
        }}
      >
        <span style={{ fontFamily: 'monospace' }}>{component.type}</span>
        <span style={{ fontSize: '10px', color: '#6b7280' }}>#{component.id}</span>
      </button>
      {component.children?.map((child) => (
        <div key={child.id} style={{ paddingLeft: '12px' }}>
          <ComponentTreeItem component={child} selected={selected} onSelect={onSelect} />
        </div>
      ))}
    </div>
  );
}
