import type { UIConfig, LayoutDef, ComponentDef, FlexDef, SizeDef, DataBindingDef } from '../types';
import type { PercentageString } from '../types/layout.types';

// ==================== PARSED INTERMEDIATE TYPES ====================

type DimValue = number | 'auto';

// An argument value in a component call. Bare identifiers become tagged strings
// (FN_REF_PREFIX = handler, VALUE_REF_PREFIX = reactive value binding); `null`,
// booleans, numbers and strings are literals; a `{ }` block is a children marker.
type IsdwArg = string | number | boolean | null | Record<string, unknown>;

interface ParsedItem {
  name: string;
  args: IsdwArg[];
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
  defaultArgs: IsdwArg[];
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
  | 'COMMA'
  | 'VALUE_REF'
  | 'MODEL_REF';

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

    // Route: ./segment or ./segment/segment (multi-segment routes supported)
    if (stripped[i] === '.' && stripped[i + 1] === '/') {
      let j = i + 2;
      while (j < stripped.length && /[\w/-]/.test(stripped[j])) j++;
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

    // Reactive value reference: @methodName or @item.field or @obj.field — binds a
    // prop to a live value. A dotted path's first segment is either the reserved
    // `item` (current repeat row) or a registered method; later segments index
    // into the result. A bare identifier (no @) is a handler instead.
    if (stripped[i] === '@' && /[a-zA-Z_]/.test(stripped[i + 1] ?? '')) {
      let j = i + 1;
      while (j < stripped.length && /[\w.-]/.test(stripped[j])) j++;
      tokens.push({ type: 'VALUE_REF', value: stripped.slice(i + 1, j) });
      i = j;
      continue;
    }

    // Two-way model reference: ~stateName — binds an input's value to a form-state
    // cell (read + write). Used on form inputs, e.g. Input(~email).
    if (stripped[i] === '~' && /[a-zA-Z_]/.test(stripped[i + 1] ?? '')) {
      let j = i + 1;
      while (j < stripped.length && /[\w-]/.test(stripped[j])) j++;
      tokens.push({ type: 'MODEL_REF', value: stripped.slice(i + 1, j) });
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
// Prefix for `@method` value references — a prop bound to a method's live return value.
const VALUE_REF_PREFIX = '\x00val:';
// Prefix for `~name` model references — a two-way binding to a form-state cell.
const MODEL_REF_PREFIX = '\x00model:';

// Names that resolve to builtins (renderer-provided) or layout primitives, so an
// `import` of them needn't be defined in the target file. Kept here (rather than
// importing from the renderer) to preserve the parser/renderer separation.
const BUILTIN_NAMES = new Set([
  'Text', 'Heading', 'Button', 'Image', 'List', 'Card', 'Divider', 'Spacer',
  'Icon', 'Table', 'Children', 'Row', 'Col', 'Repeat', 'Form',
  'Input', 'Textarea', 'Select', 'Option', 'Checkbox', 'Radio', 'Label',
]);

class IsdwParser {
  private tokens: Token[];
  private pos = 0;
  styleRegistry: Map<string, StyleEntry> = new Map();
  // Reusable component definitions: name -> body template (item list). A `define`
  // block registers one; using the name as an item expands the body (macro-style),
  // substituting the call's children at the `Children` marker. See convertItem.
  defRegistry: Map<string, ParsedItem[]> = new Map();

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

  // Entry point. resolve() is called to load imported .isdw files.
  parseFile(resolve?: (path: string) => string): ParsedPage[] {
    this.parseImports(resolve);
    this.parseTopDecls();

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
        const t = this.peek();
        // Imports / definitions may appear anywhere in a file — including after
        // the route line (a natural "this is the /x page, and it needs these"
        // ordering). Process them into the shared registries and continue.
        if (t?.type === 'IDENT' && t.value === 'import') { this.parseImports(resolve); continue; }
        if (t?.type === 'IDENT' && t.value === 'define') { this.parseDefinition(); continue; }
        if (t?.type === 'IDENT' && this.peek(1)?.type === 'COLON' && this.peek(2)?.type === 'IDENT') {
          this.parseStyleDefs();
          continue;
        }
        items.push(this.parseItem());
      }
      pages.push({ route, scroll, items });
    }
    return pages;
  }

  // Consume import lines. Two forms:
  //   import "path"                  (whole-file style/def import)
  //   import Name, Name from "path"  (named component/def import)
  // In both cases the referenced .isdw file is parsed and its definitions +
  // style-defs are registered into the shared registries.
  private parseImports(resolve?: (path: string) => string): void {
    while (this.peek(0)?.type === 'IDENT' && this.peek(0)?.value === 'import') {
      const next = this.peek(1);

      if (next?.type === 'STRING') {
        // Whole-file form: import "path"
        this.pos++; // consume 'import'
        const importPath = this.consume('STRING').value as string;
        this.resolveImport(importPath, [], resolve);
        continue;
      }

      if (next?.type === 'IDENT') {
        // Named form: import A, B from "path"
        this.pos++; // consume 'import'
        const names: string[] = [this.consume('IDENT').value as string];
        while (this.peek()?.type === 'COMMA') {
          this.pos++;
          names.push(this.consume('IDENT').value as string);
        }
        const fromTok = this.consume('IDENT');
        if (fromTok.value !== 'from') {
          throw new Error(`[isdw] Expected 'from' in import, got "${fromTok.value}"`);
        }
        const importPath = this.consume('STRING').value as string;
        this.resolveImport(importPath, names, resolve);
        continue;
      }

      break;
    }
  }

  // Resolve and parse an imported .isdw file into the shared registries.
  // `names`, when non-empty, are validated against what the file actually defines.
  private resolveImport(
    importPath: string,
    names: string[],
    resolve?: (path: string) => string
  ): void {
    // Only .isdw (or extension-less) imports are resolvable here. Other imports
    // (e.g. .ts/.tsx) are documentation-only at parse time.
    const afterLastSlash = importPath.slice(importPath.lastIndexOf('/') + 1);
    const dotIdx = afterLastSlash.lastIndexOf('.');
    const ext = dotIdx >= 0 ? afterLastSlash.slice(dotIdx) : '';
    if (ext !== '.isdw' && ext !== '') return;
    if (!resolve) return;

    const src = resolve(importPath);
    const sub = new IsdwParser(tokenize(src));
    sub.styleRegistry = this.styleRegistry; // share registries
    sub.defRegistry = this.defRegistry;
    sub.parseImports(resolve); // transitive imports
    sub.parseTopDecls();

    for (const name of names) {
      if (
        !this.defRegistry.has(name) &&
        !this.styleRegistry.has(name) &&
        !BUILTIN_NAMES.has(name)
      ) {
        console.warn(`[isdw] import: "${name}" is not defined in ${importPath}`);
      }
    }
  }

  // Parse the top-of-file declarations: `define` component definitions and
  // `Name:BaseType` style-defs, in any order, until a page route or EOF.
  private parseTopDecls(): void {
    for (;;) {
      const t = this.peek();
      if (t?.type === 'IDENT' && t.value === 'define') {
        this.parseDefinition();
        continue;
      }
      if (
        t?.type === 'IDENT' &&
        this.peek(1)?.type === 'COLON' &&
        this.peek(2)?.type === 'IDENT'
      ) {
        this.parseStyleDefs();
        continue;
      }
      break;
    }
  }

  // Consume `define Name(params?) { ...items including Children()... }`.
  private parseDefinition(): void {
    this.pos++; // consume 'define'
    const name = this.consume('IDENT').value as string;

    // Parameter list is parsed but not yet substituted into the body.
    this.consume('LPAREN');
    if (this.peek()?.type !== 'RPAREN') this.parseArgList();
    this.consume('RPAREN');

    this.consume('LBRACE');
    const body: ParsedItem[] = [];
    while (this.peek()?.type !== 'RBRACE') {
      body.push(this.parseItem());
    }
    this.consume('RBRACE');

    this.defRegistry.set(name, body);
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
      const defaultArgs: IsdwArg[] = [];
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
    const parsedArgs: IsdwArg[] = [];
    if (this.peek()?.type !== 'RPAREN') parsedArgs.push(...this.parseArgList());
    this.consume('RPAREN');

    // Lift any `{ ... }` children-block args out of the arg list; they become
    // part of this item's children (merged with the trailing `{ }` block below).
    const inlineChildren: ParsedItem[] = [];
    const valueArgs: IsdwArg[] = [];
    for (const a of parsedArgs) {
      if (a && typeof a === 'object' && Array.isArray((a as Record<string, unknown>).__isdwChildren)) {
        inlineChildren.push(...((a as { __isdwChildren: ParsedItem[] }).__isdwChildren));
      } else {
        valueArgs.push(a);
      }
    }

    // Use provided value args; fall back to style-def defaults if none given
    const args = valueArgs.length > 0 ? valueArgs : (regEntry?.defaultArgs ?? []);

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
    const children: ParsedItem[] = [...inlineChildren];
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

  private parseArgList(): IsdwArg[] {
    const args: IsdwArg[] = [];
    args.push(this.parseArg());
    while (this.peek()?.type === 'COMMA') {
      this.pos++;
      if (this.peek()?.type === 'RPAREN') break;
      args.push(this.parseArg());
    }
    return args;
  }

  private parseArg(): IsdwArg {
    const t = this.peek();
    if (!t) throw new Error('[isdw] Expected argument');
    if (t.type === 'STRING') { this.pos++; return t.value as string; }
    if (t.type === 'NUMBER') { this.pos++; return t.value as number; }
    // @method — reactive value binding (prop bound to the method's return value).
    if (t.type === 'VALUE_REF') { this.pos++; return `${VALUE_REF_PREFIX}${t.value}`; }
    // ~name — two-way model binding to a form-state cell.
    if (t.type === 'MODEL_REF') { this.pos++; return `${MODEL_REF_PREFIX}${t.value}`; }
    if (t.type === 'IDENT') {
      this.pos++;
      // Literal keywords. `null` is the explicit "no handler / no value" placeholder.
      if (t.value === 'null')  return null;
      if (t.value === 'true')  return true;
      if (t.value === 'false') return false;
      // Any other bare identifier = function reference (e.g. a Button onClick handler).
      return `${FN_REF_PREFIX}${t.value}`;
    }
    // A `{ ... }` argument is a children block — child items placed inside the
    // component (e.g. `Button("Save", { Image(...) })`). Returned tagged so
    // parseItem can lift them into the item's children.
    if (t.type === 'LBRACE') {
      this.pos++; // consume '{'
      const childItems: ParsedItem[] = [];
      while (this.peek()?.type !== 'RBRACE') {
        childItems.push(this.parseItem());
      }
      this.consume('RBRACE');
      return { __isdwChildren: childItems };
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

interface ConvertCtx {
  components: ComponentDef[];
  defs: Map<string, ParsedItem[]>;
  /** Call-site children to inject at a `Children` marker (set while expanding a definition). */
  slotChildren?: ParsedItem[];
  /** Definition names currently being expanded — guards against infinite recursion. */
  expanding: Set<string>;
}

function sizeOf(item: ParsedItem): SizeDef {
  const size: SizeDef = {};
  if (item.height !== 'auto') size.height = pct(item.height as number);
  if (item.width !== 'auto')  size.width  = pct(item.width as number);
  return size;
}

function convertItem(item: ParsedItem, ctx: ConvertCtx): LayoutDef {
  const size = sizeOf(item);
  const isdwStyle = Object.keys(item.style).length ? item.style : undefined;
  const colAnchor = anchorToFlexProps(item.anchor, 'column');

  // `Children` slot marker — replaced by the enclosing definition's call children.
  if (item.name === 'Children') {
    const slot = ctx.slotChildren ?? [];
    // Slot content is real page content: convert it without an active slot context.
    const childCtx: ConvertCtx = { ...ctx, slotChildren: undefined };
    return {
      type: 'flex',
      direction: 'column',
      ...colAnchor,
      size,
      children: slot.map(child => convertItem(child, childCtx)),
      isdwStyle,
    };
  }

  // Reusable component definition — expand its body, injecting this call's
  // children at any `Children` marker inside it.
  const defBody = ctx.defs.get(item.name);
  if (defBody && !ctx.expanding.has(item.name)) {
    const innerCtx: ConvertCtx = {
      ...ctx,
      slotChildren: item.children,
      expanding: new Set(ctx.expanding).add(item.name),
    };
    return {
      type: 'flex',
      direction: 'column',
      ...colAnchor,
      size,
      children: defBody.map(t => convertItem(t, innerCtx)),
      isdwStyle,
    };
  }

  // Layout primitives (Row/Col).
  if (LAYOUT_ITEMS.has(item.name)) {
    const direction = item.name === 'Row' ? 'row' : 'column';
    const { justifyContent, alignItems } = anchorToFlexProps(item.anchor, direction);
    return {
      type: 'flex',
      direction,
      justifyContent,
      alignItems,
      size,
      children: item.children.map(child => convertItem(child, ctx)),
      isdwStyle,
    };
  }

  // Component (builtin / registered / custom). Children stay as layout nodes on
  // the bound cell; the LayoutRenderer threads them into the component as its
  // slot so containers (Card, Table, imported components) render their content.
  // slotChildren is passed through so a `Children` marker nested inside a
  // definition's component still resolves.
  const id = genId(item.name.toLowerCase());
  ctx.components.push(buildComponentDef(item, id));
  const children = item.children.map(child => convertItem(child, ctx));
  return { type: 'flex', direction: 'column', ...colAnchor, size, children, componentId: id };
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

  // Classify call args. `@x` -> reactive value binding; a bare identifier -> a
  // handler (onClick); a "/..." string -> a route href; everything else (strings,
  // numbers, booleans, null) is a positional literal.
  const valueRefs: string[] = [];
  const modelRefs: string[] = [];
  const handlerRefs: string[] = [];
  const literals: IsdwArg[] = [];
  for (const a of item.args) {
    if (typeof a === 'string' && a.startsWith(VALUE_REF_PREFIX)) valueRefs.push(a.slice(VALUE_REF_PREFIX.length));
    else if (typeof a === 'string' && a.startsWith(MODEL_REF_PREFIX)) modelRefs.push(a.slice(MODEL_REF_PREFIX.length));
    else if (typeof a === 'string' && a.startsWith(FN_REF_PREFIX)) handlerRefs.push(a.slice(FN_REF_PREFIX.length));
    else literals.push(a);
  }

  // The prop a leading `@value` / `~model` binds to, per component. Bound props are
  // applied after literal props in the renderer, so they win when both are present.
  const primaryProp = PRIMARY_PROP[item.name] ?? 'value';
  const bindings: DataBindingDef[] = [
    ...valueRefs.map(methodId => ({ prop: primaryProp, methodId, kind: 'value' as const })),
    ...modelRefs.map(methodId => ({ prop: primaryProp, methodId, kind: 'model' as const })),
    ...handlerRefs.map(methodId => ({ prop: 'onClick', methodId })),
  ];
  const withBindings = (def: ComponentDef): ComponentDef =>
    bindings.length ? { ...def, bindings } : def;

  const [first, second] = literals;

  switch (item.name) {
    case 'Text':
      return withBindings({ id, type: 'Text', props: { text: String(first ?? '') }, isdwStyle });

    case 'Heading':
      return withBindings({
        id,
        type: 'Heading',
        props: { text: String(first ?? ''), level: typeof second === 'number' ? second : 1 },
        isdwStyle,
      });

    case 'Button': {
      // For a Button, a "/..." literal is a route href; the first non-route
      // literal is the label.
      const route = literals.find(a => typeof a === 'string' && a.startsWith('/')) as string | undefined;
      const label = literals.find(a => typeof a === 'string' && !a.startsWith('/'));
      const props: Record<string, unknown> = { text: String(label ?? '') };
      if (route) props.href = route;
      return withBindings({ id, type: 'Button', props, isdwStyle });
    }

    case 'Image':
      return withBindings({ id, type: 'Image', props: { src: String(first ?? ''), alt: String(second ?? '') }, isdwStyle });

    default:
      return withBindings({
        id,
        type: item.name,
        props: Object.fromEntries(literals.map((v, i) => [`arg${i}`, v])),
        isdwStyle,
      });
  }
}

// The prop that a leading `@value` reference binds to, per component type.
const PRIMARY_PROP: Record<string, string> = {
  Text: 'text',
  Heading: 'text',
  Button: 'text',
  Image: 'src',
  Input: 'value',
  Textarea: 'value',
  Select: 'value',
  Checkbox: 'checked',
  Table: 'data',
  Repeat: 'data',
};

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
    const ctx: ConvertCtx = { components, defs: parser.defRegistry, expanding: new Set() };
    const layoutChildren = items.map(item => convertItem(item, ctx));
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
