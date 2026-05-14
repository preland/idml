import type { NextConfig } from 'next';

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

  return function (nextConfig: NextConfig): NextConfig {
    return {
      ...nextConfig,

      env: {
        ...nextConfig.env,
        ISD_UI_CONFIG_PATH: configPath,
        ISD_UI_EDITOR_ENABLED: String(editorEnabled),
      },
    };
  };
}
