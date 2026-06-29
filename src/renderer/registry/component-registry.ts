import type React from 'react';

type RegisteredComponent = React.ComponentType<Record<string, unknown>>;

const registry = new Map<string, RegisteredComponent>();

export function registerComponent(name: string, component: RegisteredComponent): void {
  if (registry.has(name)) {
    console.warn(`[idml] registerComponent: overwriting existing component "${name}"`);
  }
  registry.set(name, component);
}

export function getComponent(name: string): RegisteredComponent | undefined {
  return registry.get(name);
}

export function getAllComponentNames(): string[] {
  return Array.from(registry.keys());
}

export function clearComponentRegistry(): void {
  registry.clear();
}
