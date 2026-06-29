import { z } from 'zod';

const percentageString = z.string().regex(/^\d+(\.\d+)?%$/, {
  message:
    'All size values must be expressed as percentages (e.g. "100%", "33.3%"). px, rem, em, vw, vh are not allowed.',
});

export const SizeDefSchema = z
  .object({
    width: percentageString.optional(),
    height: percentageString.optional(),
    minWidth: percentageString.optional(),
    minHeight: percentageString.optional(),
    maxWidth: percentageString.optional(),
    maxHeight: percentageString.optional(),
  })
  .strict();

const VisibilitySchema = z
  .object({ ref: z.string(), negate: z.boolean().optional() })
  .strict();

const ConditionalClassSchema = z
  .object({ classes: z.string(), ref: z.string(), negate: z.boolean().optional() })
  .strict();

const DynamicDimSchema = z
  .object({
    ref: z.string(),
    whenTrue: z.string().optional(),
    whenFalse: z.string().optional(),
  })
  .strict();

const DynamicSizeSchema = z
  .object({ width: DynamicDimSchema.optional(), height: DynamicDimSchema.optional() })
  .strict();

export const LayoutDefSchema: z.ZodType<any> = z.lazy(() =>
  z.discriminatedUnion('type', [
    z
      .object({
        type: z.literal('flex'),
        direction: z.enum(['row', 'column', 'row-reverse', 'column-reverse']),
        wrap: z.enum(['nowrap', 'wrap', 'wrap-reverse']).optional(),
        justifyContent: z
          .enum(['flex-start', 'flex-end', 'center', 'space-between', 'space-around', 'space-evenly'])
          .optional(),
        alignItems: z.enum(['flex-start', 'flex-end', 'center', 'stretch', 'baseline']).optional(),
        gap: z.string().optional(),
        size: SizeDefSchema.optional(),
        children: z.array(LayoutDefSchema),
        componentId: z.string().optional(),
        idmlStyle: z.record(z.string()).optional(),
        className: z.string().optional(),
        classRefs: z.array(z.string()).optional(),
        condClasses: z.array(ConditionalClassSchema).optional(),
        visibility: VisibilitySchema.optional(),
        dynamicSize: DynamicSizeSchema.optional(),
      })
      .strict(),
    z
      .object({
        type: z.literal('grid'),
        columns: z.number().int().min(1).max(24),
        rows: z.number().int().min(1).optional(),
        gap: z.string().optional(),
        size: SizeDefSchema.optional(),
        children: z.array(LayoutDefSchema),
        componentId: z.string().optional(),
        idmlStyle: z.record(z.string()).optional(),
        className: z.string().optional(),
        classRefs: z.array(z.string()).optional(),
        condClasses: z.array(ConditionalClassSchema).optional(),
        visibility: VisibilitySchema.optional(),
        dynamicSize: DynamicSizeSchema.optional(),
      })
      .strict(),
  ])
);

export const FlexDefSchema = LayoutDefSchema;
export const GridDefSchema = LayoutDefSchema;
