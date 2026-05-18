'use client';

import React from 'react';
import { useConfigContext } from './ConfigProvider';
import { LayoutRenderer } from './LayoutRenderer';

export interface ConfigRendererProps {
  page: string;
}

export function ConfigRenderer({ page }: ConfigRendererProps): React.ReactElement | null {
  const { config } = useConfigContext();
  const pageDef = config.pages.find((p) => p.route === page);

  if (!pageDef) {
    console.warn(`[isd-ui] No page found for route "${page}"`);
    return null;
  }

  return (
    <div
      data-isd-page={page}
      style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}
    >
      <LayoutRenderer layout={pageDef.layout} components={pageDef.components} />
    </div>
  );
}
