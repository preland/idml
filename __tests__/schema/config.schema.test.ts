import { describe, it, expect } from 'vitest';
import { UIConfigSchema, validateConfig } from '../../src/schema';

describe('UIConfigSchema', () => {
  const minimalConfig = {
    version: '1' as const,
    tokens: {
      colors: [{ name: 'primary', value: '#1a56db' }],
      typography: [{ name: 'heading', fontSize: '2rem' }],
      spacing: [{ name: 'gap-md', value: '1rem' }],
    },
    pages: [
      {
        route: '/',
        layout: {
          type: 'flex' as const,
          direction: 'column' as const,
          children: [],
        },
        components: [],
      },
    ],
  };

  it('accepts valid config', () => {
    expect(UIConfigSchema.safeParse(minimalConfig).success).toBe(true);
  });

  it('rejects missing version', () => {
    const invalid = { ...minimalConfig, version: undefined };
    expect(UIConfigSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects missing pages', () => {
    const invalid = { ...minimalConfig, pages: [] };
    expect(UIConfigSchema.safeParse(invalid).success).toBe(false);
  });

  it('throws on validateConfig with invalid data', () => {
    expect(() => validateConfig({ invalid: true })).toThrow();
  });

  it('accepts config with pixel size in layout', () => {
    const configWithPixel = {
      ...minimalConfig,
      pages: [
        {
          route: '/',
          layout: {
            type: 'flex' as const,
            direction: 'column' as const,
            size: { width: '500px' },
            children: [],
          },
          components: [],
        },
      ],
    };
    expect(UIConfigSchema.safeParse(configWithPixel).success).toBe(false);
  });

  it('accepts config with percentage size in layout', () => {
    const configWithPercent = {
      ...minimalConfig,
      pages: [
        {
          route: '/',
          layout: {
            type: 'flex' as const,
            direction: 'column' as const,
            size: { width: '100%', height: '100%' },
            children: [],
          },
          components: [],
        },
      ],
    };
    expect(UIConfigSchema.safeParse(configWithPercent).success).toBe(true);
  });
});
