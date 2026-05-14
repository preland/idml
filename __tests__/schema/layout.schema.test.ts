import { describe, it, expect } from 'vitest';
import { SizeDefSchema, LayoutDefSchema } from '../../src/schema';

describe('SizeDefSchema', () => {
  it('accepts percentage values', () => {
    const valid = {
      width: '100%',
      height: '50%',
      minWidth: '25.5%',
    };
    expect(SizeDefSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects pixel values', () => {
    const invalid = { width: '100px' };
    const result = SizeDefSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects rem values', () => {
    const invalid = { height: '2rem' };
    const result = SizeDefSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects em values', () => {
    const invalid = { maxWidth: '100em' };
    const result = SizeDefSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects vw/vh values', () => {
    const invalid = { width: '100vw' };
    const result = SizeDefSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('allows empty object', () => {
    expect(SizeDefSchema.safeParse({}).success).toBe(true);
  });
});

describe('LayoutDefSchema', () => {
  it('accepts valid flex layout', () => {
    const flex = {
      type: 'flex' as const,
      direction: 'row' as const,
      gap: 'gap-md',
      size: { width: '100%' },
      children: [],
    };
    expect(LayoutDefSchema.safeParse(flex).success).toBe(true);
  });

  it('accepts valid grid layout', () => {
    const grid = {
      type: 'grid' as const,
      columns: 3,
      gap: 'gap-sm',
      size: { width: '100%', height: '100%' },
      children: [],
    };
    expect(LayoutDefSchema.safeParse(grid).success).toBe(true);
  });

  it('rejects layout with pixel size', () => {
    const invalid = {
      type: 'flex' as const,
      direction: 'column' as const,
      size: { width: '500px' },
      children: [],
    };
    expect(LayoutDefSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects unknown type', () => {
    const invalid = {
      type: 'unknown',
      children: [],
    };
    expect(LayoutDefSchema.safeParse(invalid).success).toBe(false);
  });
});
