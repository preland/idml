import { z } from 'zod';

export const ColorTokenSchema = z
  .object({
    name: z.string().min(1),
    value: z.string().min(1),
    darkValue: z.string().optional(),
  })
  .strict();

export const TypographyTokenSchema = z
  .object({
    name: z.string().min(1),
    fontFamily: z.string().optional(),
    fontSize: z.string().min(1),
    fontWeight: z.union([z.number(), z.string()]).optional(),
    lineHeight: z.string().optional(),
    letterSpacing: z.string().optional(),
  })
  .strict();

export const SpacingTokenSchema = z
  .object({
    name: z.string().min(1),
    value: z.string().min(1),
  })
  .strict();

export const TokensDefSchema = z
  .object({
    colors: z.array(ColorTokenSchema),
    typography: z.array(TypographyTokenSchema),
    spacing: z.array(SpacingTokenSchema),
  })
  .strict();
