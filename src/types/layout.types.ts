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
  idmlStyle?: Record<string, string>;
  className?: string;
  /** Dynamic `@method` class refs (resolved per render, like a component's, so a
   *  container can carry a state-driven class — e.g. a per-row colour). */
  classRefs?: string[];
  /** Conditional class blocks (`` `classes`?@ref ``) applied per render. */
  condClasses?: ConditionalClass[];
  visibility?: LayoutVisibility;
  dynamicSize?: DynamicSize;
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
 *  is animated by the renderer (Web Animations API). */
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
}

export interface GridDef {
  type: 'grid';
  columns: number;
  rows?: number;
  gap?: string;
  size?: SizeDef;
  children: LayoutDef[];
  componentId?: string;
  idmlStyle?: Record<string, string>;
  className?: string;
  /** Dynamic `@method` class refs (resolved per render, like a component's, so a
   *  container can carry a state-driven class — e.g. a per-row colour). */
  classRefs?: string[];
  /** Conditional class blocks (`` `classes`?@ref ``) applied per render. */
  condClasses?: ConditionalClass[];
  visibility?: LayoutVisibility;
  dynamicSize?: DynamicSize;
}

export type LayoutDef = FlexDef | GridDef;
