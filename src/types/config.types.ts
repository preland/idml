import type { TokensDef } from './tokens.types';
import type { PageDef } from './page.types';

export interface UIConfig {
  version: '1';
  tokens: TokensDef;
  pages: PageDef[];
  userComponents?: string[];
}
