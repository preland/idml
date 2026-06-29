import type { VisibilityDef } from '../../types';
import { getMethod } from '../registry/method-registry';

export function useVisibility(rule: VisibilityDef | undefined): boolean {
  if (!rule) return true;

  const method = getMethod(rule.methodId);
  if (!method) {
    console.warn(
      `[idml] Visibility method "${rule.methodId}" not registered — defaulting to visible`
    );
    return true;
  }

  const result = Boolean(method());
  return rule.negate ? !result : result;
}
