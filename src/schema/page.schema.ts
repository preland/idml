import { z } from 'zod';
import { LayoutDefSchema } from './layout.schema';
import { ComponentDefSchema } from './component.schema';

export const PageDefSchema = z
  .object({
    route: z.string().min(1),
    title: z.string().optional(),
    layout: LayoutDefSchema,
    components: z.array(ComponentDefSchema),
    meta: z
      .object({
        description: z.string().optional(),
        ogTitle: z.string().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
