// Types
export type {
  UIConfig,
  PageDef,
  ComponentDef,
  LayoutDef,
  FlexDef,
  GridDef,
  SizeDef,
  TokensDef,
  DataBindingDef,
  VisibilityDef,
  ColorToken,
  TypographyToken,
  SpacingToken,
} from './types';

// Schema & validation
export { UIConfigSchema, validateConfig, safeValidateConfig } from './schema/config.schema';

// Renderer
export {
  ConfigProvider,
  useConfigContext,
  ConfigRenderer,
  LayoutRenderer,
  ComponentRenderer,
  useVisibility,
  useRegisteredMethod,
  registerMethod,
  getMethod,
  clearRegistry,
  registerComponent,
  getComponent,
  clearComponentRegistry,
  BUILTIN_COMPONENTS,
} from './renderer';

export type {
  ConfigProviderProps,
  ConfigContextValue,
  MethodRegistration,
  ComponentRegistration,
} from './renderer';

// Editor
export { EditorPage } from './editor';

// .idml parser
export { parseIdml, parseIdmlWithSource } from './parser/idml-parser';
export type {
  ParseOptions,
  ParseWithSourceResult,
  ComponentOrigin,
  VariantInfo,
  SourceSpan,
  ItemSrc,
} from './parser/idml-parser';
