export interface ColorToken {
  name: string;
  value: string;
  darkValue?: string;
}

export interface TypographyToken {
  name: string;
  fontFamily?: string;
  fontSize: string;
  fontWeight?: number | string;
  lineHeight?: string;
  letterSpacing?: string;
}

export interface SpacingToken {
  name: string;
  value: string;
}

export interface TokensDef {
  colors: ColorToken[];
  typography: TypographyToken[];
  spacing: SpacingToken[];
}
