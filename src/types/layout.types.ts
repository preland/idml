export type PercentageString = `${number}%`;

export interface SizeDef {
  width?: PercentageString;
  height?: PercentageString;
  minWidth?: PercentageString;
  minHeight?: PercentageString;
  maxWidth?: PercentageString;
  maxHeight?: PercentageString;
}

export type FlexDirection = 'row' | 'column' | 'row-reverse' | 'column-reverse';
export type FlexWrap = 'nowrap' | 'wrap' | 'wrap-reverse';
export type JustifyContent =
  | 'flex-start'
  | 'flex-end'
  | 'center'
  | 'space-between'
  | 'space-around'
  | 'space-evenly';
export type AlignItems = 'flex-start' | 'flex-end' | 'center' | 'stretch' | 'baseline';

export interface FlexDef {
  type: 'flex';
  direction: FlexDirection;
  wrap?: FlexWrap;
  justifyContent?: JustifyContent;
  alignItems?: AlignItems;
  gap?: string;
  size?: SizeDef;
  children: LayoutDef[];
  componentId?: string;
  /** Stable editor id for this node — components reuse their componentId,
   *  containers get their own. Rendered as `data-idml-id` in editor mode so the
   *  visual editor can select/highlight containers, not just components. */
  nodeId?: string;
  idmlStyle?: Record<string, string>;
  className?: string;
  /** Dynamic `@method` class refs (resolved per render, like a component's, so a
   *  container can carry a state-driven class — e.g. a per-row colour). */
  classRefs?: string[];
  /** Conditional class blocks (`` `classes`?@ref ``) applied per render. */
  condClasses?: ConditionalClass[];
  visibility?: LayoutVisibility;
  dynamicSize?: DynamicSize;
  /** Makes the cell focusable so a click can expand it (see the table cell
   *  expansion rule in ConfigProvider). Set by the parser, not authorable. */
  tabIndex?: number;
}

/** Reactive show/hide for a layout cell: render only when `ref` resolves truthy
 *  (a value path like `state.open`); `negate` flips the test. */
export interface LayoutVisibility {
  ref: string;
  negate?: boolean;
}

/** A class block that applies only when `ref` is truthy (`negate` flips it) —
 *  i.e. `` `scale-100 opacity-100`?@state.open ``. Lets state-driven visuals (a
 *  pop-up's scale/opacity) live in the .idml rather than a method. */
export interface ConditionalClass {
  classes: string;
  ref: string;
  negate?: boolean;
}

/** Reactive width/height resolved per render (applied AFTER static `size`, so it
 *  wins — letting a cell resize on state, e.g. a collapsing sidebar). The change
 *  is animated by the renderer (Web Animations API) unless the dim is `live`. */
export interface DynamicSize {
  width?: DynamicDim;
  height?: DynamicDim;
}

/** One reactive dimension. `ref` is a value path (`state.x` / method). With
 *  `whenTrue`/`whenFalse` it's a condition — the dim is `whenTrue` when the ref
 *  is truthy, else `whenFalse` (both inline CSS sizes from the .idml). Without
 *  them the ref's resolved value is the dim (bare number → `%`). */
export interface DynamicDim {
  ref: string;
  whenTrue?: string;
  whenFalse?: string;
  /**
   * Apply each new value IMMEDIATELY instead of easing into it. A normal dynamic
   * dim is a UI transition (a sidebar collapsing), so the renderer animates the
   * change over ~300ms. A `live` dim is a *continuously* changing quantity — a
   * value the page recomputes every frame, e.g. an animated object's position —
   * where easing would smear the motion and pile up overlapping animations. Set
   * by the `@ref!` dim syntax.
   */
  live?: boolean;
}

export interface GridDef {
  type: 'grid';
  columns: number;
  rows?: number;
  gap?: string;
  size?: SizeDef;
  children: LayoutDef[];
  componentId?: string;
  /** See FlexDef.nodeId. */
  nodeId?: string;
  idmlStyle?: Record<string, string>;
  className?: string;
  /** Dynamic `@method` class refs (resolved per render, like a component's, so a
   *  container can carry a state-driven class — e.g. a per-row colour). */
  classRefs?: string[];
  /** Conditional class blocks (`` `classes`?@ref ``) applied per render. */
  condClasses?: ConditionalClass[];
  visibility?: LayoutVisibility;
  dynamicSize?: DynamicSize;
  /** Makes the cell focusable so a click can expand it (see the table cell
   *  expansion rule in ConfigProvider). Set by the parser, not authorable. */
  tabIndex?: number;
}

export type LayoutDef = FlexDef | GridDef;
