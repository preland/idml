import { z } from 'zod';
import { TokensDefSchema } from './tokens.schema';
import { PageDefSchema } from './page.schema';
import type { UIConfig } from '../types';

const DarkRuleSchema = z
  .object({
    selector: z.string(),
    style: z.record(z.string()),
  })
  .strict();

export const UIConfigSchema = z
  .object({
    version: z.literal('1'),
    tokens: TokensDefSchema,
    pages: z.array(PageDefSchema).min(1),
    darkStyles: z.array(DarkRuleSchema).optional(),
    userComponents: z.array(z.string()).optional(),
  })
  .strict();

export type UIConfigType = z.infer<typeof UIConfigSchema>;

export function validateConfig(raw: unknown): UIConfig {
  return UIConfigSchema.parse(raw) as UIConfig;
}

export function safeValidateConfig(raw: unknown) {
  return UIConfigSchema.safeParse(raw);
}
