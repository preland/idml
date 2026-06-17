'use client';

import React from 'react';
import { useConfigContext } from './ConfigProvider';
import { LayoutRenderer } from './LayoutRenderer';
import { FormStateProvider } from './form-context';

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

  // A page-level form-state scope so `~name` model bindings work without an
  // explicit Form; a Form component nests its own scope when isolation is wanted.
  return (
    <FormStateProvider>
      <div
        data-isd-page={page}
        style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}
      >
        <LayoutRenderer layout={pageDef.layout} components={pageDef.components} />
      </div>
    </FormStateProvider>
  );
}
