'use client';

import React, { createContext, useCallback, useContext, useState } from 'react';

export interface FormStore {
  values: Record<string, unknown>;
  setValue: (name: string, value: unknown) => void;
}

/**
 * Form-state scope for two-way (`~name`) model bindings. A default scope is
 * provided at the page root (see ConfigRenderer); a `Form` component nests a new
 * one so multiple forms don't collide.
 */
export const FormStateContext = createContext<FormStore | undefined>(undefined);

export function FormStateProvider({
  initial,
  children,
}: {
  initial?: Record<string, unknown>;
  children: React.ReactNode;
}): React.ReactElement {
  const [values, setValues] = useState<Record<string, unknown>>(initial ?? {});
  const setValue = useCallback((name: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [name]: value }));
  }, []);
  return (
    <FormStateContext.Provider value={{ values, setValue }}>{children}</FormStateContext.Provider>
  );
}

export function useFormStore(): FormStore | undefined {
  return useContext(FormStateContext);
}
