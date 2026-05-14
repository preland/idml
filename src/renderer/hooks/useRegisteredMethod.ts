import { getMethod } from '../registry/method-registry';

export function useRegisteredMethod(id: string): ((...args: unknown[]) => unknown) | undefined {
  return getMethod(id);
}
