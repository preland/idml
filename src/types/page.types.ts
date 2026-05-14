import type { LayoutDef } from './layout.types';
import type { ComponentDef } from './component.types';

export interface PageDef {
  route: string;
  title?: string;
  layout: LayoutDef;
  components: ComponentDef[];
  meta?: {
    description?: string;
    ogTitle?: string;
  };
}
