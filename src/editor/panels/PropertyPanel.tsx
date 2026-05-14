'use client';

import React, { useState } from 'react';
import type { ComponentDef, TokensDef } from '../../types';

interface PropertyPanelProps {
  component: ComponentDef;
  tokens: TokensDef;
  onChange: (updated: ComponentDef) => void;
}

export function PropertyPanel({
  component,
  tokens,
  onChange,
}: PropertyPanelProps): React.ReactElement {
  const [expandedSection, setExpandedSection] = useState<string | null>('props');

  const updateComponent = (updates: Partial<ComponentDef>) => {
    onChange({ ...component, ...updates });
  };

  return (
    <div style={{ padding: '12px', overflow: 'auto', height: '100%', fontSize: '12px' }}>
      <div style={{ marginBottom: '16px' }}>
        <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '4px' }}>ID</div>
        <div
          style={{
            fontFamily: 'monospace',
            padding: '4px 6px',
            background: '#f3f4f6',
            borderRadius: '2px',
          }}
        >
          {component.id}
        </div>
      </div>

      <Section
        title="Type"
        expanded={expandedSection === 'type'}
        onToggle={() =>
          setExpandedSection(expandedSection === 'type' ? null : 'type')
        }
      >
        <input
          type="text"
          value={component.type}
          onChange={(e) => updateComponent({ type: e.target.value })}
          style={{ width: '100%', padding: '4px', fontSize: '12px' }}
        />
      </Section>

      <Section
        title="Token Props"
        expanded={expandedSection === 'tokenProps'}
        onToggle={() =>
          setExpandedSection(expandedSection === 'tokenProps' ? null : 'tokenProps')
        }
      >
        <PropertyInput
          label="Color"
          value={component.tokenProps?.color ?? ''}
          onChange={(value) =>
            updateComponent({
              tokenProps: { ...component.tokenProps, color: value || undefined },
            })
          }
          options={tokens.colors.map((c) => c.name)}
        />
        <PropertyInput
          label="Background"
          value={component.tokenProps?.background ?? ''}
          onChange={(value) =>
            updateComponent({
              tokenProps: { ...component.tokenProps, background: value || undefined },
            })
          }
          options={tokens.colors.map((c) => c.name)}
        />
        <PropertyInput
          label="Typography"
          value={component.tokenProps?.typography ?? ''}
          onChange={(value) =>
            updateComponent({
              tokenProps: { ...component.tokenProps, typography: value || undefined },
            })
          }
          options={tokens.typography.map((t) => t.name)}
        />
      </Section>

      <Section
        title="Visibility"
        expanded={expandedSection === 'visibility'}
        onToggle={() =>
          setExpandedSection(expandedSection === 'visibility' ? null : 'visibility')
        }
      >
        {component.visibility ? (
          <>
            <div style={{ marginBottom: '8px' }}>
              <div style={{ fontSize: '10px', color: '#6b7280' }}>Method</div>
              <input
                type="text"
                value={component.visibility.methodId}
                onChange={(e) =>
                  updateComponent({
                    visibility: { ...component.visibility, methodId: e.target.value },
                  })
                }
                style={{ width: '100%', padding: '4px', fontSize: '12px' }}
              />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}>
              <input
                type="checkbox"
                checked={component.visibility.negate ?? false}
                onChange={(e) =>
                  updateComponent({
                    visibility: { ...component.visibility, negate: e.target.checked },
                  })
                }
              />
              Negate (show when false)
            </label>
            <button
              onClick={() => updateComponent({ visibility: undefined })}
              style={{
                marginTop: '8px',
                padding: '4px 8px',
                fontSize: '11px',
                background: '#fee2e2',
                color: '#dc2626',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Remove visibility
            </button>
          </>
        ) : (
          <button
            onClick={() =>
              updateComponent({ visibility: { methodId: '', negate: false } })
            }
            style={{
              padding: '4px 8px',
              fontSize: '11px',
              background: '#dbeafe',
              color: '#1a56db',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Add visibility rule
          </button>
        )}
      </Section>
    </div>
  );
}

function Section({
  title,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div style={{ marginBottom: '12px' }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%',
          padding: '6px 8px',
          textAlign: 'left',
          background: '#f3f4f6',
          border: '1px solid #e5e7eb',
          cursor: 'pointer',
          fontSize: '11px',
          fontWeight: 600,
        }}
      >
        {expanded ? '▼' : '▶'} {title}
      </button>
      {expanded && <div style={{ padding: '8px', background: '#fafafa' }}>{children}</div>}
    </div>
  );
}

function PropertyInput({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}): React.ReactElement {
  return (
    <div style={{ marginBottom: '8px' }}>
      <label style={{ display: 'block', fontSize: '10px', color: '#6b7280', marginBottom: '2px' }}>
        {label}
      </label>
      {options.length > 0 ? (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: '100%',
            padding: '4px',
            fontSize: '12px',
            border: '1px solid #d1d5db',
          }}
        >
          <option value="">None</option>
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: '100%',
            padding: '4px',
            fontSize: '12px',
            border: '1px solid #d1d5db',
          }}
        />
      )}
    </div>
  );
}
