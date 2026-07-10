import { z } from 'zod';

export const DataBindingDefSchema = z
  .object({
    prop: z.string().min(1),
    methodId: z.string().min(1),
    kind: z.enum(['handler', 'value', 'model']).optional(),
    dynamicKey: z.boolean().optional(),
  })
  .strict();

export const VisibilityDefSchema = z
  .object({
    methodId: z.string().min(1),
    negate: z.boolean().optional(),
  })
  .strict();
