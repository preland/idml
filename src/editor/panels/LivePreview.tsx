'use client';

import React, { useRef, useEffect } from 'react';

interface LivePreviewProps {
  pageRoute: string;
  onComponentSelect: (id: string) => void;
  /** The id currently selected in the editor — pushed into the iframe so it draws
   *  the persistent highlight even when selection came from the tree/breadcrumb. */
  selectedId?: string | null;
  /** Bump to force the iframe to reload (e.g. after a save writes new source). */
  reloadNonce?: number;
}

export function LivePreview({
  pageRoute,
  onComponentSelect,
  selectedId = null,
  reloadNonce = 0,
}: LivePreviewProps): React.ReactElement {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Right-click select inside the iframe → editor selection.
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'idml:select' && typeof event.data.componentId === 'string') {
        onComponentSelect(event.data.componentId);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [onComponentSelect]);

  // Editor selection → iframe highlight (post now if loaded, and again on load
  // after a reload).
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const post = () => iframe.contentWindow?.postMessage({ type: 'idml:setSelection', id: selectedId }, '*');
    post();
    iframe.addEventListener('load', post);
    return () => iframe.removeEventListener('load', post);
  }, [selectedId, reloadNonce]);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#fff' }}>
      <div style={{ padding: '8px', borderBottom: '1px solid #e5e7eb', fontSize: '12px' }}>
        Preview: {pageRoute}
      </div>
      <iframe
        ref={iframeRef}
        key={reloadNonce}
        // The iframe `name` turns on the in-page hover/select/highlight machinery
        // (ConfigProvider reads window.name). Unlike a query param it SURVIVES the
        // app's client-side redirects (e.g. an auth/landing bounce), so editor mode
        // stays on wherever the preview ends up. The param is kept as a fallback.
        name="__idmlEditorPreview"
        src={`${pageRoute}${pageRoute.includes('?') ? '&' : '?'}__idmlEditor=1`}
        style={{
          flex: 1,
          border: 'none',
          width: '100%',
        }}
        title="Live preview"
      />
    </div>
  );
}
