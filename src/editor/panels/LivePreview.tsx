'use client';

import React, { useRef, useEffect } from 'react';

interface LivePreviewProps {
  pageRoute: string;
  onComponentSelect: (id: string) => void;
}

export function LivePreview({
  pageRoute,
  onComponentSelect,
}: LivePreviewProps): React.ReactElement {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'isd:select' && typeof event.data.componentId === 'string') {
        onComponentSelect(event.data.componentId);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [onComponentSelect]);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#fff' }}>
      <div style={{ padding: '8px', borderBottom: '1px solid #e5e7eb', fontSize: '12px' }}>
        Preview: {pageRoute}
      </div>
      <iframe
        ref={iframeRef}
        src={pageRoute}
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
