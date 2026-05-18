import type { UIConfig, LayoutDef, ComponentDef, FlexDef, SizeDef } from '../types';
import type { PercentageString } from '../types/layout.types';

// ==================== PARSED INTERMEDIATE TYPES ====================

type DimValue = number | 'auto';

interface ParsedItem {
  name: string;
  args: Array<string | number | Record<string, unknown>>;
  height: DimValue;
  width: DimValue;
  anchor: string;
  children: ParsedItem[];
  style: Record<string, string>;
}

interface ParsedPage {
  route: string;
  scroll: boolean;
  items: ParsedItem[];
}

interface StyleEntry {
  baseType: string;
  defaultArgs: Array<string | number | Record<string, unknown>>;
  style: Record<string, string>;
}

// ==================== TOKENIZER ====================

type TokenType =
  | 'ROUTE'
  | 'IDENT'
  | 'NUMBER'
  | 'STRING'
  | 'COLOR'
  | 'STYLE_BLOCK'
  | 'COLON'
  | 'LPAREN'
  | 'RPAREN'
  | 'LBRACKET'
  | 'RBRACKET'
  | 'LBRACE'
  | 'RBRACE'
  | 'COMMA';

interface Token {
  type: TokenType;
  value?: string | number;
}

const SINGLE_CHAR_TOKENS: Record<string, TokenType> = {
  '(': 'LPAREN',
  ')': 'RPAREN',
  '[': 'LBRACKET',
  ']': 'RBRACKET',
  '{': 'LBRACE',
  '}': 'RBRACE',
  ',': 'COMMA',
  ':': 'COLON',
};

function tokenize(source: string): Token[] {
  // Strip whole-line comments (lines where # is the first non-whitespace char).
  // This preserves inline # such as hex colours inside style blocks.
  const stripped = source
    .split('\n')
    .map(line => (line.trimStart().startsWith('#') ? '' : line))
    .join('\n');

  const tokens: Token[] = [];
  let i = 0;

  while (i < stripped.length) {
    if (/\s/.test(stripped[i])) { i++; continue; }

    // Route: ./identifier
    if (stripped[i] === '.' && stripped[i + 1] === '/') {
      let j = i + 2;
      while (j < stripped.length && /[\w-]/.test(stripped[j])) j++;
      tokens.push({ type: 'ROUTE', value: '/' + stripped.slice(i + 2, j) });
      i = j;
      continue;
    }

    // Hex color: #rrggbb or #rgb
    if (stripped[i] === '#' && /[0-9a-fA-F]/.test(stripped[i + 1] ?? '')) {
      let j = i + 1;
      while (j < stripped.length && /[0-9a-fA-F]/.test(stripped[j])) j++;
      tokens.push({ type: 'COLOR', value: stripped.slice(i, j) });
      i = j;
      continue;
    }

    // Inline style block: <...content...>
    if (stripped[i] === '<') {
      let j = i + 1;
      while (j < stripped.length && stripped[j] !== '>') j++;
      tokens.push({ type: 'STYLE_BLOCK', value: stripped.slice(i + 1, j).trim() });
      i = j + 1;
      continue;
    }

    // Single-char tokens
    if (stripped[i] in SINGLE_CHAR_TOKENS) {
      tokens.push({ type: SINGLE_CHAR_TOKENS[stripped[i]] });
      i++;
      continue;
    }

    // Quoted string
    if (stripped[i] === '"') {
      let j = i + 1;
      while (j < stripped.length && stripped[j] !== '"') {
        if (stripped[j] === '\\') j++;
        j++;
      }
      tokens.push({ type: 'STRING', value: stripped.slice(i + 1, j) });
      i = j + 1;
      continue;
    }

    // Number (may include decimal point)
    if (/\d/.test(stripped[i])) {
      let j = i;
      while (j < stripped.length && /[\d.]/.test(stripped[j])) j++;
      tokens.push({ type: 'NUMBER', value: parseFloat(stripped.slice(i, j)) });
      i = j;
      continue;
    }

    // Identifier (includes hyphenated keywords like top-left)
    if (/[a-zA-Z_]/.test(stripped[i])) {
      let j = i;
      while (j < stripped.length && /[\w-]/.test(stripped[j])) j++;
      tokens.push({ type: 'IDENT', value: stripped.slice(i, j) });
      i = j;
      continue;
    }

    throw new Error(`[isdw] Unexpected character '${stripped[i]}' at position ${i}`);
  }

  return tokens;
}

// ==================== STYLE PROP MAPPER ====================

function applyStyleProp(key: string, val: string, result: Record<string, string>): void {
  switch (key) {
    case 'bg':       result.backgroundColor = val; break;
    case 'fg':       result.color = val; break;
    case 'size':     result.fontSize = val.endsWith('vw') ? val : `${val}vw`; break;
    case 'font':     result.fontFamily = val; break;
    case 'weight':   result.fontWeight = val; break;
    case 'style':
      if (val === 'bold')   result.fontWeight = '700';
      else if (val === 'italic') result.fontStyle = 'italic';
      break;
    case 'pad':      result.padding = val.endsWith('%') ? val : `${val}%`; break;
    case 'radius':   result.borderRadius = val.endsWith('px') ? val : `${val}px`; break;
    case 'gap':      result.gap = val.endsWith('vw') ? val : `${val}vw`; break;
    case 'align':    result.textAlign = val; break;
    case 'overflow': result.overflowY = val; break;
    case 'h':        result.height = val; break;
    case 'w':        result.width = val; break;
    default:         result[key] = val;
  }
}

// ==================== RECURSIVE DESCENT PARSER ====================

// Prefix added to bare-identifier args so callers can distinguish them from string values.
const FN_REF_PREFIX = '\x00fn:';

class IsdwParser {
  private tokens: Token[];
  private pos = 0;
  styleRegistry: Map<string, StyleEntry> = new Map();

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(offset = 0): Token | undefined { return this.tokens[this.pos + offset]; }

  private consume(type?: TokenType): Token {
    const t = this.tokens[this.pos++];
    if (!t) throw new Error('[isdw] Unexpected end of input');
    if (type && t.type !== type) {
      throw new Error(`[isdw] Expected ${type}, got ${t.type} ("${t.value}")`);
    }
    return t;
  }

  // Entry point. resolve() is called for style-file imports (.isdw).
  parseFile(resolve?: (path: string) => string): ParsedPage[] {
    this.parseImports(resolve);
    this.parseStyleDefs();

    const pages: ParsedPage[] = [];
    while (this.peek()) {
      const route = this.consume('ROUTE').value as string;

      let scroll = false;
      if (this.peek()?.type === 'LBRACKET') {
        this.consume('LBRACKET');
        const flag = this.consume('IDENT').value as string;
        if (flag === 'scroll') scroll = true;
        this.consume('RBRACKET');
      }

      const items: ParsedItem[] = [];
      while (this.peek() && this.peek()?.type !== 'ROUTE') {
        items.push(this.parseItem());
      }
      pages.push({ route, scroll, items });
    }
    return pages;
  }

  // Consume `import "path"` lines. Style imports (.isdw) are resolved immediately.
  private parseImports(resolve?: (path: string) => string): void {
    while (
      this.peek(0)?.type === 'IDENT' &&
      this.peek(0)?.value === 'import' &&
      this.peek(1)?.type === 'STRING'
    ) {
      this.pos++; // consume 'import'
      const importPath = this.consume('STRING').value as string;

      // Determine extension by looking only at the part after the last slash
      const afterLastSlash = importPath.slice(importPath.lastIndexOf('/') + 1);
      const dotIdx = afterLastSlash.lastIndexOf('.');
      const ext = dotIdx >= 0 ? afterLastSlash.slice(dotIdx) : '';
      const isStyleImport = ext === '.isdw' || ext === '';

      if (isStyleImport && resolve) {
        const src = resolve(importPath);
        const sub = new IsdwParser(tokenize(src));
        sub.styleRegistry = this.styleRegistry; // share registry
        sub.parseStyleDefs();
      }
      // Non-.isdw imports are documentation-only at parse time;
      // the page component handles the actual TS/JS import.
    }
  }

  // Consume `Name:BaseType("arg"...) { prop: value }` definitions.
  parseStyleDefs(): void {
    while (
      this.peek(0)?.type === 'IDENT' &&
      this.peek(1)?.type === 'COLON' &&
      this.peek(2)?.type === 'IDENT'
    ) {
      const name = this.consume('IDENT').value as string;
      this.consume('COLON');
      const baseType = this.consume('IDENT').value as string;

      // Optional pre-set args: Name:Type("arg1", "arg2") { ... }
      const defaultArgs: Array<string | number | Record<string, unknown>> = [];
      if (this.peek()?.type === 'LPAREN') {
        this.consume('LPAREN');
        if (this.peek()?.type !== 'RPAREN') defaultArgs.push(...this.parseArgList());
        this.consume('RPAREN');
      }

      const style = this.parseStyleDefBody();
      this.styleRegistry.set(name, { baseType, defaultArgs, style });
    }
  }

  // Parse `{ prop: value ... }` body of a style definition.
  private parseStyleDefBody(): Record<string, string> {
    this.consume('LBRACE');
    const result: Record<string, string> = {};
    while (this.peek()?.type !== 'RBRACE') {
      const key = this.consume('IDENT').value as string;
      this.consume('COLON');
      const val = this.parseStyleValue();
      applyStyleProp(key, val, result);
    }
    this.consume('RBRACE');
    return result;
  }

  // Parse a value token inside a style def body.
  private parseStyleValue(): string {
    const t = this.peek();
    if (!t) throw new Error('[isdw] Expected style value');

    if (t.type === 'COLOR') { this.pos++; return t.value as string; }

    if (t.type === 'NUMBER') {
      const n = this.consume('NUMBER').value as number;
      const next = this.peek();
      if (next?.type === 'IDENT' && ['vh', 'vw', 'px', 'rem', 'em'].includes(next.value as string)) {
        this.pos++;
        return `${n}${next.value}`;
      }
      return String(n);
    }

    if (t.type === 'IDENT') { this.pos++; return t.value as string; }

    throw new Error(`[isdw] Unexpected token type ${t.type} as style value`);
  }

  parseItem(): ParsedItem {
    const rawName = this.consume('IDENT').value as string;

    const regEntry = this.styleRegistry.get(rawName);
    const name = regEntry ? regEntry.baseType : rawName;
    const baseStyle: Record<string, string> = regEntry ? { ...regEntry.style } : {};

    // Args are always required: Name(arg, ...) or Name()
    this.consume('LPAREN');
    const parsedArgs: Array<string | number | Record<string, unknown>> = [];
    if (this.peek()?.type !== 'RPAREN') parsedArgs.push(...this.parseArgList());
    this.consume('RPAREN');

    // Use provided args; fall back to style-def defaults if none given
    const args = parsedArgs.length > 0 ? parsedArgs : (regEntry?.defaultArgs ?? []);

    // Dimensions: [height%, width%, anchor] — 'auto' means no fixed dimension
    this.consume('LBRACKET');
    const height = this.parseDimension();
    this.consume('COMMA');
    const width = this.parseDimension();
    this.consume('COMMA');
    const anchor = this.consume('IDENT').value as string;
    this.consume('RBRACKET');

    // Optional inline <key=val> override block (adds to / overrides registry style)
    let inlineStyle: Record<string, string> = {};
    if (this.peek()?.type === 'STYLE_BLOCK') {
      inlineStyle = parseInlineStyle(this.consume('STYLE_BLOCK').value as string);
    }

    const style = { ...baseStyle, ...inlineStyle };

    this.consume('LBRACE');
    const children: ParsedItem[] = [];
    while (this.peek()?.type !== 'RBRACE') {
      children.push(this.parseItem());
    }
    this.consume('RBRACE');

    return { name, args, height, width, anchor, children, style };
  }

  private parseDimension(): DimValue {
    if (this.peek()?.type === 'IDENT' && this.peek()?.value === 'auto') {
      this.pos++;
      return 'auto';
    }
    return this.consume('NUMBER').value as number;
  }

  private parseArgList(): Array<string | number | Record<string, unknown>> {
    const args: Array<string | number | Record<string, unknown>> = [];
    args.push(this.parseArg());
    while (this.peek()?.type === 'COMMA') {
      this.pos++;
      if (this.peek()?.type === 'RPAREN') break;
      args.push(this.parseArg());
    }
    return args;
  }

  private parseArg(): string | number | Record<string, unknown> {
    const t = this.peek();
    if (!t) throw new Error('[isdw] Expected argument');
    if (t.type === 'STRING') { this.pos++; return t.value as string; }
    if (t.type === 'NUMBER') { this.pos++; return t.value as number; }
    // Bare identifier as arg = function reference
    if (t.type === 'IDENT')  { this.pos++; return `${FN_REF_PREFIX}${t.value}`; }
    if (t.type === 'LBRACE') {
      this.pos++;
      this.consume('RBRACE');
      return {};
    }
    throw new Error(`[isdw] Unexpected token type ${t.type} as argument`);
  }
}

// ==================== INLINE STYLE BLOCK PARSER ====================

function parseInlineStyle(raw: string): Record<string, string> {
  const result: Record<string, string> = {};
  const parts = raw.trim().split(/\s+/);
  for (const part of parts) {
    if (!part) continue;
    if (part === 'bold')   { result.fontWeight = '700'; continue; }
    if (part === 'italic') { result.fontStyle = 'italic'; continue; }
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    applyStyleProp(part.slice(0, eq), part.slice(eq + 1), result);
  }
  return result;
}

// ==================== CONVERTER ====================

const LAYOUT_ITEMS = new Set(['Row', 'Col']);

const ANCHOR_V: Record<string, string> = { top: 'flex-start', center: 'center', bottom: 'flex-end' };
const ANCHOR_H: Record<string, string> = { left: 'flex-start', center: 'center', right: 'flex-end' };

function anchorToFlexProps(anchor: string, direction: 'row' | 'column') {
  const parts = anchor.split('-');
  if (parts.length === 1) {
    const val = (ANCHOR_V[parts[0]] ?? ANCHOR_H[parts[0]] ?? 'flex-start') as FlexDef['justifyContent'];
    return { justifyContent: val, alignItems: val as FlexDef['alignItems'] };
  }
  const [v = 'top', h = 'left'] = parts;
  const vVal = ANCHOR_V[v] ?? 'flex-start';
  const hVal = ANCHOR_H[h] ?? 'flex-start';
  if (direction === 'row') {
    return { justifyContent: hVal as FlexDef['justifyContent'], alignItems: vVal as FlexDef['alignItems'] };
  }
  return { justifyContent: vVal as FlexDef['justifyContent'], alignItems: hVal as FlexDef['alignItems'] };
}

function pct(n: number): PercentageString { return `${n}%` as PercentageString; }

let _idCounter = 0;
function genId(prefix: string): string { return `${prefix}-${++_idCounter}`; }

function convertItem(item: ParsedItem, components: ComponentDef[]): LayoutDef {
  const size: SizeDef = {};
  if (item.height !== 'auto') size.height = pct(item.height as number);
  if (item.width !== 'auto')  size.width  = pct(item.width as number);
  const isdwStyle = Object.keys(item.style).length ? item.style : undefined;

  if (LAYOUT_ITEMS.has(item.name)) {
    const direction = item.name === 'Row' ? 'row' : 'column';
    const { justifyContent, alignItems } = anchorToFlexProps(item.anchor, direction);
    return {
      type: 'flex',
      direction,
      justifyContent,
      alignItems,
      size,
      children: item.children.map(child => convertItem(child, components)),
      isdwStyle,
    };
  }

  const id = genId(item.name.toLowerCase());
  const { justifyContent, alignItems } = anchorToFlexProps(item.anchor, 'column');
  components.push(buildComponentDef(item, id));
  return { type: 'flex', direction: 'column', justifyContent, alignItems, size, children: [], componentId: id };
}

/**
 * Derive CSS alignment properties from the item's anchor so that content
 * centres (or aligns) correctly within the component element itself.
 * Text components use textAlign; Button uses flex centering.
 */
function anchorToComponentStyle(anchor: string, componentType: string): Record<string, string> {
  const parts = anchor.split('-');
  const h = parts.length === 1 ? parts[0] : parts[1] ?? parts[0];
  const v = parts.length === 1 ? parts[0] : parts[0];

  const css: Record<string, string> = {};

  if (componentType === 'Text' || componentType === 'Heading') {
    if (h === 'center') css.textAlign = 'center';
    else if (h === 'right') css.textAlign = 'right';
  }

  if (componentType === 'Button') {
    css.display = 'flex';
    css.justifyContent = h === 'center' ? 'center' : h === 'right' ? 'flex-end' : 'flex-start';
    css.alignItems = v === 'center' ? 'center' : v === 'bottom' ? 'flex-end' : 'flex-start';
  }

  return css;
}

function buildComponentDef(item: ParsedItem, id: string): ComponentDef {
  const anchorStyle = anchorToComponentStyle(item.anchor, item.name);
  const isdwStyle =
    Object.keys(item.style).length || Object.keys(anchorStyle).length
      ? { ...anchorStyle, ...item.style }  // explicit style overrides anchor defaults
      : undefined;

  const [first, second, third] = item.args;

  switch (item.name) {
    case 'Text':
      return { id, type: 'Text', props: { text: String(first ?? '') }, isdwStyle };

    case 'Heading':
      return {
        id,
        type: 'Heading',
        props: { text: String(first ?? ''), level: typeof second === 'number' ? second : 1 },
        isdwStyle,
      };

    case 'Button': {
      // arg classification: strings starting with '/' are routes (href),
      // strings starting with FN_REF_PREFIX are function bindings (onClick).
      const fnArgs = item.args.filter(a => typeof a === 'string' && a.startsWith(FN_REF_PREFIX)) as string[];
      const routeArg = item.args.find(a => typeof a === 'string' && (a as string).startsWith('/')) as string | undefined;

      const props: Record<string, unknown> = { text: String(first ?? '') };
      if (routeArg) props.href = routeArg;

      const bindings = fnArgs.map(fnRef => ({
        prop: 'onClick',
        methodId: fnRef.slice(FN_REF_PREFIX.length),
      }));

      return { id, type: 'Button', props, ...(bindings.length ? { bindings } : {}), isdwStyle };
    }

    case 'Image':
      return { id, type: 'Image', props: { src: String(first ?? ''), alt: String(second ?? '') }, isdwStyle };

    default:
      return {
        id,
        type: item.name,
        props: Object.fromEntries(item.args.map((v, i) => [`arg${i}`, v])),
        isdwStyle,
      };
  }
}

const DEFAULT_TOKENS: UIConfig['tokens'] = {
  colors: [
    { name: 'primary',    value: '#1a56db', darkValue: '#60a5fa' },
    { name: 'surface',    value: '#ffffff', darkValue: '#1e1e2e' },
    { name: 'on-surface', value: '#111827', darkValue: '#f9fafb' },
    { name: 'danger',     value: '#dc2626', darkValue: '#f87171' },
  ],
  typography: [
    { name: 'heading-xl', fontSize: '2.25rem', fontWeight: 700, lineHeight: '1.25' },
    { name: 'body-md',    fontSize: '1rem',    fontWeight: 400, lineHeight: '1.6'  },
    { name: 'label-sm',   fontSize: '0.75rem', fontWeight: 500, lineHeight: '1.4'  },
  ],
  spacing: [
    { name: 'gap-sm', value: '0.5rem' },
    { name: 'gap-md', value: '1rem'   },
    { name: 'gap-lg', value: '2rem'   },
  ],
};

export interface ParseOptions {
  /**
   * Called when an `import "./file.isdw"` line is encountered.
   * Should return the raw source of the imported file.
   */
  resolve?: (path: string) => string;
}

export function parseIsdw(source: string, options?: ParseOptions): UIConfig {
  _idCounter = 0;
  const parser = new IsdwParser(tokenize(source));
  const parsedPages = parser.parseFile(options?.resolve);

  const pages = parsedPages.map(({ route, scroll, items }) => {
    const components: ComponentDef[] = [];
    const layoutChildren = items.map(item => convertItem(item, components));
    const rootLayout: FlexDef = {
      type: 'flex',
      direction: 'column',
      size: { width: '100%', height: '100%' },
      children: layoutChildren,
      ...(scroll ? { isdwStyle: { overflowY: 'auto' } } : {}),
    };
    return { route, layout: rootLayout, components };
  });

  return { version: '1', tokens: DEFAULT_TOKENS, pages };
}
