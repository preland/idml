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

  // Re-render on viewport resize so viewport-dependent method refs
  // (e.g. a `@short`-style dim/visibility that reads window.innerHeight) stay
  // live. Throttled to one update per animation frame so a resize drag doesn't
  // thrash the tree.
  const [, bumpViewport] = React.useState(0);
  React.useEffect(() => {
    let raf = 0;
    const onResize = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        bumpViewport((n) => n + 1);
      });
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  if (!pageDef) {
    console.warn(`[idml] No page found for route "${page}"`);
    return null;
  }

  // A page-level form-state scope so `~name` model bindings work without an
  // explicit Form; a Form component nests its own scope when isolation is wanted.
  return (
    <FormStateProvider>
      <div
        data-idml-page={page}
        style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}
      >
        <LayoutRenderer layout={pageDef.layout} components={pageDef.components} />
      </div>
    </FormStateProvider>
  );
}
