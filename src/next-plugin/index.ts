import type { NextConfig } from 'next';
import path from 'node:path';

export interface UIConfigOptions {
  configPath?: string;
  editorEnabled?: boolean;
}

export function withUIConfig(
  options: UIConfigOptions = {}
): (nextConfig: NextConfig) => NextConfig {
  const {
    configPath = './ui.config.json',
    editorEnabled = process.env.NODE_ENV === 'development',
  } = options;

  const resolvedConfigPath = path.resolve(process.cwd(), configPath);

  return function (nextConfig: NextConfig): NextConfig {
    return {
      ...nextConfig,

      env: {
        ...nextConfig.env,
        ISD_UI_CONFIG_PATH: resolvedConfigPath,
        ISD_UI_EDITOR_ENABLED: String(editorEnabled),
      },

      async rewrites() {
        const existing = await nextConfig.rewrites?.();
        const isdRewrites = editorEnabled
          ? [
              {
                source: '/_isd-editor',
                destination: '/_isd-editor-internal',
              },
              {
                source: '/_isd-editor/:path*',
                destination: '/_isd-editor-internal/:path*',
              },
            ]
          : [];

        if (Array.isArray(existing)) {
          return [...existing, ...isdRewrites];
        }

        return {
          beforeFiles: [...(existing?.beforeFiles ?? [])],
          afterFiles: [...(existing?.afterFiles ?? []), ...isdRewrites],
          fallback: [...(existing?.fallback ?? [])],
        };
      },
    };
  };
}
