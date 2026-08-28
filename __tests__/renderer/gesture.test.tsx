import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { ConfigProvider, ConfigRenderer } from '../../src/renderer';
import { parseIdml } from '../../src/parser/idml-parser';

const page = (spec: string) => `
Box:Col
./p
Col()[100,100,top-left] {
  Box()[100,100,top-left] {
    Text("content")[100,100,top-left]{}
    Gesture("${spec}", onGesture)[100,100,top-left]{}
  }
}
`;

// jsdom has no PointerEvent; the listener only reads MouseEvent fields, so a
// MouseEvent dispatched under the pointer type exercises the same path.
function pointer(type: string, init: MouseEventInit) {
  return new MouseEvent(type, { bubbles: true, ...init });
}

/** The gesture measures its container, which jsdom reports as 0x0 unless told. */
function withBox(width: number, height: number) {
  const orig = HTMLElement.prototype.getBoundingClientRect;
  HTMLElement.prototype.getBoundingClientRect = function () {
    return { width, height, left: 0, top: 0, right: width, bottom: height, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
  };
  return () => { HTMLElement.prototype.getBoundingClientRect = orig; };
}

function mount(spec: string, onGesture: (e: unknown) => void) {
  const cfg = parseIdml(page(spec));
  const r = render(
    <ConfigProvider config={cfg} methods={[{ id: 'onGesture', fn: (_v: unknown, h: unknown) => onGesture((h as { event: unknown }).event) }]}>
      <ConfigRenderer page="/p" />
    </ConfigProvider>
  );
  const host = r.container.querySelector('[data-idml-gesture]')!.parentElement!.parentElement!;
  return { host, container: r.container };
}

describe('Gesture — continuous pointer input', () => {
  it('takes no layout space and renders no visible box', () => {
    const restore = withBox(200, 100);
    const { container } = mount('pan', () => {});
    const marker = container.querySelector('[data-idml-gesture]') as HTMLElement;
    expect(marker.style.display).toBe('none');
    restore();
  });

  it('reports a wheel as a scale plus the cursor position', () => {
    const restore = withBox(200, 100);
    const seen: any[] = [];
    const { host } = mount('zoom', (e) => seen.push(e));
    host.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, clientX: 50, bubbles: true, cancelable: true }));
    expect(seen[0].gesture).toBe('zoom');
    expect(seen[0].scale).toBeLessThan(1);
    expect(seen[0].atRatio).toBeCloseTo(0.25);
    host.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, clientX: 150, bubbles: true, cancelable: true }));
    expect(seen[1].scale).toBeGreaterThan(1);
    expect(seen[1].atRatio).toBeCloseTo(0.75);
    restore();
  });

  it('ignores an unmodified wheel when a modifier is required', () => {
    const restore = withBox(200, 100);
    const seen: any[] = [];
    const { host } = mount('zoom:ctrl', (e) => seen.push(e));
    host.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, clientX: 50, bubbles: true, cancelable: true }));
    expect(seen).toHaveLength(0);
    host.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, clientX: 50, ctrlKey: true, bubbles: true, cancelable: true }));
    expect(seen).toHaveLength(1);
    restore();
  });

  it('reports a drag as a per-move delta, in px and as a fraction', () => {
    const restore = withBox(200, 100);
    const seen: any[] = [];
    const { host } = mount('pan', (e) => seen.push(e));
    host.setPointerCapture = vi.fn();
    host.releasePointerCapture = vi.fn();
    host.dispatchEvent(pointer('pointerdown', { button: 0, clientX: 100, clientY: 0 }));
    host.dispatchEvent(pointer('pointermove', { clientX: 140, clientY: 0 }));
    host.dispatchEvent(pointer('pointermove', { clientX: 160, clientY: 0 }));
    host.dispatchEvent(pointer('pointerup', { clientX: 160, clientY: 0 }));
    expect(seen[0].phase).toBe('start');
    expect(seen[1]).toMatchObject({ gesture: 'pan', phase: 'move', dx: 40, dxRatio: 0.2 });
    expect(seen[2]).toMatchObject({ dx: 20, dxRatio: 0.1 });
    expect(seen[3].phase).toBe('end');
    restore();
  });

  it('reports a brush as the span from where the drag began', () => {
    const restore = withBox(200, 100);
    const seen: any[] = [];
    const { host } = mount('brush', (e) => seen.push(e));
    host.setPointerCapture = vi.fn();
    host.releasePointerCapture = vi.fn();
    host.dispatchEvent(pointer('pointerdown', { button: 0, clientX: 20, clientY: 0 }));
    host.dispatchEvent(pointer('pointermove', { clientX: 120, clientY: 0 }));
    host.dispatchEvent(pointer('pointerup', { clientX: 120, clientY: 0 }));
    const end = seen[seen.length - 1];
    expect(end).toMatchObject({ gesture: 'brush', phase: 'end' });
    expect(end.fromRatio).toBeCloseTo(0.1);
    expect(end.toRatio).toBeCloseTo(0.6);
    restore();
  });

  it('costs no tiling space, so a sibling still fills the container', () => {
    expect(() =>
      parseIdml(`
./p
Col()[100,100,top-left] {
  Text("only child")[100,100,top-left]{}
  Gesture("pan", onGesture)[100,100,top-left]{}
}
`)
    ).not.toThrow();
  });
});
