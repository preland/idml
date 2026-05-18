import type { DataBindingDef, VisibilityDef } from './binding.types';

export type BuiltinComponentType = 'Text' | 'Heading' | 'Button' | 'Image' | 'List' | 'Card' | 'Divider' | 'Spacer' | 'Icon';

export interface ComponentDef {
  id: string;
  type: BuiltinComponentType | string;
  props?: Record<string, unknown>;
  tokenProps?: {
    color?: string;
    background?: string;
    typography?: string;
    padding?: string;
  };
  bindings?: DataBindingDef[];
  visibility?: VisibilityDef;
  children?: ComponentDef[];
  isdwStyle?: Record<string, string>;
}
