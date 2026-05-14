import React from 'react';
import type { TokensDef, ComponentDef } from '../../types';

export function injectTokenVars(tokens: TokensDef, darkMode: boolean): Record<string, string> {
  const vars: Record<string, string> = {};

  for (const color of tokens.colors) {
    const value = darkMode && color.darkValue ? color.darkValue : color.value;
    vars[`--isd-color-${color.name}`] = value;
  }

  for (const spacing of tokens.spacing) {
    vars[`--isd-spacing-${spacing.name}`] = spacing.value;
  }

  return vars;
}

export function resolveTokenProps(
  tokenProps: ComponentDef['tokenProps'],
  tokens: TokensDef
): React.CSSProperties {
  if (!tokenProps) return {};

  const style: React.CSSProperties = {};

  if (tokenProps.color) {
    style.color = `var(--isd-color-${tokenProps.color})`;
  }

  if (tokenProps.background) {
    style.backgroundColor = `var(--isd-color-${tokenProps.background})`;
  }

  if (tokenProps.typography) {
    const token = tokens.typography.find((t) => t.name === tokenProps.typography);
    if (token) {
      style.fontSize = token.fontSize;
      if (token.fontWeight) style.fontWeight = token.fontWeight as React.CSSProperties['fontWeight'];
      if (token.lineHeight) style.lineHeight = token.lineHeight;
      if (token.letterSpacing) style.letterSpacing = token.letterSpacing;
      if (token.fontFamily) style.fontFamily = token.fontFamily;
    }
  }

  if (tokenProps.padding) {
    style.padding = `var(--isd-spacing-${tokenProps.padding})`;
  }

  return style;
}
