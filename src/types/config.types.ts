import type { TokensDef } from './tokens.types';
import type { PageDef } from './page.types';

/**
 * A dark-mode override authored via the `dark { ... }` block in the DSL. Each
 * rule targets a selector (a Tailwind color utility like `.bg-white`, the
 * `.idml-root` itself, or form controls) and overrides color props when an
 * ancestor carries the `dark` class. `style` keys are React-camelCase CSS props;
 * the renderer scopes each rule under `.dark .idml-root`.
 */
export interface DarkRule {
  selector: string;
  style: Record<string, string>;
}

export interface UIConfig {
  version: '1';
  tokens: TokensDef;
  pages: PageDef[];
  darkStyles?: DarkRule[];
  userComponents?: string[];
}
