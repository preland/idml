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
  isdwStyle?: Record<string, string>;
  className?: string;
}

export interface GridDef {
  type: 'grid';
  columns: number;
  rows?: number;
  gap?: string;
  size?: SizeDef;
  children: LayoutDef[];
  componentId?: string;
  isdwStyle?: Record<string, string>;
  className?: string;
}

export type LayoutDef = FlexDef | GridDef;
