'use client';

import React, { useEffect, useState } from 'react';

// The editor's write-back panel. Given the selected component's origin + (if any)
// its styled variant, it offers edit fields for the authored source and posts
// each change to /api/idml/save, which patches the .idml in place. className edits
// on a shared variant offer two modes: change the variant everywhere, or clone it
// into a new variant used only here.

interface Span {
  start: number;
  end: number;
}
export interface Origin {
  id: string;
  file: string;
  kind: 'direct' | 'define' | 'synthetic';
  spans: { text?: Span; height?: Span; width?: Span; anchor?: Span; className?: Span };
  variant?: string;
  classFile?: string;
  classSpan?: Span;
}
export interface Variant {
  name: string;
  baseType: string;
  file: string;
  usageCount: number;
}
export interface Values {
  name?: string;
  text?: string;
  height?: string;
  width?: string;
  anchor?: string;
  className?: string;
}

interface Props {
  route: string;
  componentId: string | null;
  componentType?: string;
  origin?: Origin;
  variant?: Variant;
  values?: Values;
  onSaved: () => void;
}

// Valid idml anchors (vertical × horizontal, plus single-axis shorthands).
const ANCHORS = [
  'top-left', 'top-center', 'top-right',
  'center-left', 'center', 'center-right',
  'bottom-left', 'bottom-center', 'bottom-right',
];

const labelStyle: React.CSSProperties = { fontSize: '11px', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '2px' };
const inputStyle: React.CSSProperties = { width: '100%', padding: '4px 6px', fontSize: '12px', border: '1px solid #d1d5db', borderRadius: '4px', boxSizing: 'border-box' };
const btn: React.CSSProperties = { padding: '4px 8px', fontSize: '11px', border: 'none', borderRadius: '4px', cursor: 'pointer' };
const primaryBtn: React.CSSProperties = { ...btn, background: '#1a56db', color: '#fff' };
const ghostBtn: React.CSSProperties = { ...btn, background: '#e5e7eb', color: '#111827' };

export function SourceEditPanel({ route, componentId, componentType, origin, variant, values, onSaved }: Props): React.ReactElement {
  // Local field state, reset whenever the selected component changes.
  const [fields, setFields] = useState<Values>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    setFields(values ?? {});
    setMsg(null);
  }, [componentId, values]);

  if (!componentId || !origin) {
    return <div style={{ padding: '12px', fontSize: '12px', color: '#6b7280' }}>Select a component to edit its source.</div>;
  }

  async function save(prop: string, value: string, mode?: 'all' | 'clone') {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/idml/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ route, componentId, prop, value, mode }),
      });
      const j = await res.json();
      if (!res.ok || j.error) {
        setMsg({ kind: 'err', text: j.error || `Save failed (${res.status})` });
      } else {
        const extra = j.newVariantName ? `, new variant ${j.newVariantName}` : '';
        setMsg({ kind: 'ok', text: `Saved — ${j.target}, ${j.affects} element${j.affects === 1 ? '' : 's'} affected${extra}` });
        onSaved();
      }
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  const shared = origin.kind === 'define';
  const set = (k: keyof Values) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setFields((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div style={{ padding: '12px', fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div>
        <div style={{ fontWeight: 700 }}>{componentType ?? 'Component'}</div>
        <div style={{ fontSize: '10px', color: '#6b7280', fontFamily: 'monospace' }}>#{componentId}</div>
        <span
          style={{
            display: 'inline-block',
            marginTop: '4px',
            padding: '1px 6px',
            borderRadius: '9999px',
            fontSize: '10px',
            background: origin.kind === 'direct' ? '#dcfce7' : origin.kind === 'define' ? '#fef9c3' : '#e5e7eb',
            color: '#374151',
          }}
        >
          {origin.kind}
          {origin.file ? ` · ${origin.file}` : ''}
        </span>
        {shared && (
          <div style={{ marginTop: '4px', fontSize: '10px', color: '#92400e' }}>
            Part of a reusable component — text/size edits here change every place it is used.
          </div>
        )}
      </div>

      {/* Text */}
      {origin.spans.text && (
        <FieldRow label="Text">
          <input style={inputStyle} value={fields.text ?? ''} onChange={set('text')} disabled={busy} />
          <SaveBtn onClick={() => save('text', fields.text ?? '')} busy={busy} />
        </FieldRow>
      )}

      {/* Dimensions */}
      {(origin.spans.height || origin.spans.width || origin.spans.anchor) && (
        <div>
          <span style={labelStyle}>Dimensions</span>
          <div style={{ display: 'flex', gap: '6px' }}>
            {origin.spans.height && <DimInput label="H%" value={fields.height ?? ''} onChange={set('height')} onSave={() => save('height', fields.height ?? '')} busy={busy} />}
            {origin.spans.width && <DimInput label="W%" value={fields.width ?? ''} onChange={set('width')} onSave={() => save('width', fields.width ?? '')} busy={busy} />}
          </div>
          {origin.spans.anchor && (
            <div style={{ marginTop: '6px' }}>
              <FieldRow label="Anchor">
                <select
                  style={inputStyle}
                  value={ANCHORS.includes(fields.anchor ?? '') ? fields.anchor : ''}
                  onChange={set('anchor')}
                  disabled={busy}
                >
                  {/* Keep an out-of-list current value selectable rather than dropping it. */}
                  {fields.anchor && !ANCHORS.includes(fields.anchor) && <option value={fields.anchor}>{fields.anchor}</option>}
                  {ANCHORS.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
                <SaveBtn onClick={() => save('anchor', fields.anchor ?? '')} busy={busy} />
              </FieldRow>
            </div>
          )}
        </div>
      )}

      {/* className */}
      {(origin.variant || origin.spans.className) && (
        <div>
          <span style={labelStyle}>Classes</span>
          {origin.variant && variant ? (
            <>
              <div style={{ fontSize: '10px', color: '#6b7280', marginBottom: '4px' }}>
                Styled by variant <code style={{ background: '#f3f4f6', padding: '0 3px', borderRadius: '3px' }}>{variant.name}</code>
                {' · '}
                <strong style={{ color: variant.usageCount > 1 ? '#b45309' : '#374151' }}>
                  used by {variant.usageCount} element{variant.usageCount === 1 ? '' : 's'}
                </strong>
                {' · '}
                {variant.file}
              </div>
              <textarea style={{ ...inputStyle, minHeight: '48px', fontFamily: 'monospace' }} value={fields.className ?? ''} onChange={set('className')} disabled={busy} />
              <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                <button style={busy ? { ...primaryBtn, opacity: 0.6 } : primaryBtn} disabled={busy} onClick={() => save('className', fields.className ?? '', 'all')}>
                  Apply to variant ({variant.usageCount})
                </button>
                <button style={busy ? { ...ghostBtn, opacity: 0.6 } : ghostBtn} disabled={busy} onClick={() => save('className', fields.className ?? '', 'clone')} title="Create a new variant with these classes, used only by this element">
                  Only this one (clone)
                </button>
              </div>
              {shared && (
                <div style={{ marginTop: '4px', fontSize: '10px', color: '#92400e' }}>
                  This element is part of a reusable block — “only this one” clones the
                  variant for this authored occurrence, which changes every instance
                  rendered from that block.
                </div>
              )}
            </>
          ) : (
            <FieldRow label="">
              <input style={inputStyle} value={fields.className ?? ''} onChange={set('className')} disabled={busy} />
              <SaveBtn onClick={() => save('className', fields.className ?? '')} busy={busy} />
            </FieldRow>
          )}
        </div>
      )}

      {!origin.spans.text && !origin.spans.height && !origin.spans.width && !origin.spans.anchor && !origin.variant && !origin.spans.className && (
        <div style={{ fontSize: '11px', color: '#6b7280' }}>Nothing editable here (this element is data-bound or generated).</div>
      )}

      {msg && (
        <div style={{ fontSize: '11px', color: msg.kind === 'ok' ? '#15803d' : '#dc2626' }}>{msg.text}</div>
      )}
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      {label && <span style={labelStyle}>{label}</span>}
      <div style={{ display: 'flex', gap: '6px' }}>{children}</div>
    </div>
  );
}

function SaveBtn({ onClick, busy }: { onClick: () => void; busy: boolean }) {
  return (
    <button style={busy ? { ...primaryBtn, opacity: 0.6 } : primaryBtn} disabled={busy} onClick={onClick}>
      Save
    </button>
  );
}

function DimInput({ label, value, onChange, onSave, busy }: { label: string; value: string; onChange: React.ChangeEventHandler<HTMLInputElement>; onSave: () => void; busy: boolean }) {
  return (
    <div style={{ flex: 1 }}>
      <span style={{ fontSize: '10px', color: '#6b7280' }}>{label}</span>
      <div style={{ display: 'flex', gap: '4px' }}>
        <input style={inputStyle} value={value} onChange={onChange} disabled={busy} />
        <SaveBtn onClick={onSave} busy={busy} />
      </div>
    </div>
  );
}
