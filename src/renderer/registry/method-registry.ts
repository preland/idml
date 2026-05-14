type RegisteredMethod = (...args: unknown[]) => unknown;

const registry = new Map<string, RegisteredMethod>();

export function registerMethod(id: string, fn: RegisteredMethod): void {
  if (registry.has(id)) {
    console.warn(`[isd-ui] registerMethod: overwriting existing method "${id}"`);
  }
  registry.set(id, fn);
}

export function getMethod(id: string): RegisteredMethod | undefined {
  return registry.get(id);
}

export function getAllMethodIds(): string[] {
  return Array.from(registry.keys());
}

export function clearRegistry(): void {
  registry.clear();
}
