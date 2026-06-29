import { z } from 'zod';
import { DataBindingDefSchema, VisibilityDefSchema } from './binding.schema';

export const ComponentDefSchema: z.ZodType<any> = z.lazy(() =>
  z
    .object({
      id: z.string().min(1),
      type: z.string().min(1),
      props: z.record(z.unknown()).optional(),
      tokenProps: z
        .object({
          color: z.string().optional(),
          background: z.string().optional(),
          typography: z.string().optional(),
          padding: z.string().optional(),
        })
        .strict()
        .optional(),
      bindings: z.array(DataBindingDefSchema).optional(),
      visibility: VisibilityDefSchema.optional(),
      children: z.array(ComponentDefSchema).optional(),
      idmlStyle: z.record(z.string()).optional(),
      className: z.string().optional(),
    })
    .strict()
);
