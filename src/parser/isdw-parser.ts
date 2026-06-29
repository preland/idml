import type { UIConfig, LayoutDef, ComponentDef, FlexDef, SizeDef, DataBindingDef } from '../types';
import type { PercentageString, DynamicSize, DynamicDim } from '../types/layout.types';

// ==================== PARSED INTERMEDIATE TYPES ====================

// A dimension is a static percentage number, or a `@ref` value-binding (resolved
// per render to a dimension) so a cell can resize on state — e.g. a sidebar that
// narrows when collapsed. A `@ref ? A : B` form picks A/B from the ref's
// truthiness so the two sizes (the visual values) live in the .isdw, not in a
// method. (`'auto'` is gone; see parseDimension.)
type DimRef = { ref: string; whenTrue?: string; whenFalse?: string };
// `'auto'` is internal-only (table expansion uses it for content-height); the
// parser rejects it as user input. `@ref` dims come from `parseDimension`.
type DimValue = number | 'auto' | DimRef;
const isDimRef = (d: DimValue): d is DimRef => typeof d === 'object' && d !== null && 'ref' in d;

/**
 * Content-sizing ("hug") flags. An element still declares its `[h,w]` percentage
 * tile — that tile is its MAX bound — but a hugged axis shrinks the bound
 * component to its content within the tile (instead of stretching to fill it),
 * clipping with an ellipsis if the content would overflow the tile.
 */
interface HugSpec {
  w: boolean;
  h: boolean;
}

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
  className?: string;
  /** Method ids referenced as `@x` tokens inside a class block — resolved per
   *  render (with the current row item) and appended to className. */
  classRefs?: string[];
  /** Conditional class blocks (`` `classes`?@ref ``) applied per render. */
  condClasses?: { classes: string; ref: string; negate: boolean }[];
  /** Optional content-sizing flags from a trailing `hug` / `hug-w` / `hug-h`
   *  token in the dimension bracket. */
  hug?: HugSpec;
  /** Optional visibility condition from a `?@ref` / `?!@ref` clause after the
   *  dims — the element renders only when the ref is truthy (negate flips it). */
  visibility?: VisibilityRef;
}

/** A reactive show/hide condition: render the element only when `ref` (a value
 *  path like `state.open` / `item.x` / a method) is truthy; `negate` flips it. */
interface VisibilityRef {
  ref: string;
  negate: boolean;
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
  /** Utility (Tailwind) classes baked into this styled variant. */
  className?: string;
}

// ==================== TOKENIZER ====================

type TokenType =
  | 'ROUTE'
  | 'IDENT'
  | 'NUMBER'
  | 'STRING'
  | 'COLOR'
  | 'COLON'
  | 'LPAREN'
  | 'RPAREN'
  | 'LBRACKET'
  | 'RBRACKET'
  | 'LBRACE'
  | 'RBRACE'
  | 'COMMA'
  | 'QUESTION'
  | 'BANG'
  | 'VALUE_REF'
  | 'MODEL_REF'
  | 'CLASS_BLOCK';

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
  '?': 'QUESTION',
  '!': 'BANG',
};

// Hard maximum line width. Lines longer than this are a parse error: long lines
// hide structure, so the DSL is kept legible at a glance.
const MAX_LINE_WIDTH = 80;

/**
 * Source-level rules enforced before tokenizing (so they apply to the main file
 * and every imported file uniformly):
 *  - no line may exceed MAX_LINE_WIDTH columns;
 *  - comments (`#` lines) are only allowed in the header — a single block at the
 *    top of the file, before the first line of code. A comment anywhere after
 *    code has started is an error.
 * Blank lines are allowed anywhere. Inline `#rrggbb` colours are not affected:
 * only a line whose first non-whitespace character is `#` counts as a comment.
 */
function validateSource(source: string): void {
  const lines = source.split('\n');
  let codeStarted = false;
  lines.forEach((line, idx) => {
    const lineNo = idx + 1;
    if (line.length > MAX_LINE_WIDTH) {
      throw new Error(
        `[isdw] line ${lineNo} is ${line.length} columns; the limit is ${MAX_LINE_WIDTH}`
      );
    }
    const trimmed = line.trim();
    if (trimmed === '') return;
    if (trimmed.startsWith('#')) {
      if (codeStarted) {
        throw new Error(
          `[isdw] line ${lineNo}: comments are only allowed in the header block ` +
            `at the very top of the file, before any code`
        );
      }
      return;
    }
    codeStarted = true;
  });
}

function tokenize(source: string): Token[] {
  validateSource(source);

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

    // Inline `<...>` style blocks are no longer supported — all styling lives in
    // named styled variants (Name:BaseType). Reject them explicitly.
    if (stripped[i] === '<') {
      throw new Error(
        '[isdw] inline `<...>` style blocks are no longer supported; ' +
          'declare a styled variant (Name:BaseType) and apply it instead'
      );
    }

    // CSS class block: `class names here` (backticks). Spaces allowed; flows to
    // the element's className (e.g. Tailwind utilities).
    if (stripped[i] === '`') {
      let j = i + 1;
      while (j < stripped.length && stripped[j] !== '`') j++;
      tokens.push({ type: 'CLASS_BLOCK', value: stripped.slice(i + 1, j).trim() });
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
  'Icon', 'Table', 'Children', 'Row', 'Col', 'Repeat', 'Form', 'Modal', 'Column',
  'Overlay', 'Input', 'Textarea', 'Select', 'Option', 'Checkbox', 'Radio', 'Label',
]);

class IsdwParser {
  private tokens: Token[];
  private pos = 0;
  styleRegistry: Map<string, StyleEntry> = new Map();
  // Reusable component definitions: name -> body template (item list). A `define`
  // block registers one; using the name as an item expands the body (macro-style),
  // substituting the call's children at the `Children` marker. See convertItem.
  defRegistry: Map<string, ParsedItem[]> = new Map();
  // Parameter names per definition (e.g. `define TopBar(title)` -> ['title']).
  // At expansion the call's positional args are bound to these names and any
  // matching references inside the body are substituted. See convertItem.
  defParamRegistry: Map<string, string[]> = new Map();

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
    sub.defParamRegistry = this.defParamRegistry;
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

    // Parameter list: bare identifiers, bound positionally to the call args at
    // expansion time (see convertItem's definition branch + substituteParams).
    this.consume('LPAREN');
    const params: string[] = [];
    if (this.peek()?.type !== 'RPAREN') {
      params.push(this.consume('IDENT').value as string);
      while (this.peek()?.type === 'COMMA') {
        this.pos++;
        params.push(this.consume('IDENT').value as string);
      }
    }
    this.consume('RPAREN');

    this.consume('LBRACE');
    const body: ParsedItem[] = [];
    while (this.peek()?.type !== 'RBRACE') {
      body.push(this.parseItem());
    }
    this.consume('RBRACE');

    this.defRegistry.set(name, body);
    this.defParamRegistry.set(name, params);
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

      // Optional baked-in utility classes: Name:Type `tailwind classes`
      let className: string | undefined;
      while (this.peek()?.type === 'CLASS_BLOCK') {
        const cls = this.consume('CLASS_BLOCK').value as string;
        className = className ? `${className} ${cls}` : cls;
      }

      // The `{ cssProp: val }` body is optional — a styled variant may carry only
      // classes (the common case) and/or pre-set args.
      const style = this.peek()?.type === 'LBRACE' ? this.parseStyleDefBody() : {};

      this.styleRegistry.set(name, { baseType, defaultArgs, style, className });
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

    // Dimensions: [height%, width%, anchor]. Required on every item, and always
    // explicit numbers — the `auto` keyword is gone (see parseDimension), because
    // every element must declare exactly how much space it occupies.
    if (this.peek()?.type !== 'LBRACKET') {
      throw new Error(
        `[isdw] "${rawName}" is missing its required [height,width,anchor] ` +
          `dimensions`
      );
    }
    this.consume('LBRACKET');
    const height = this.parseDimension();
    this.consume('COMMA');
    const width = this.parseDimension();
    this.consume('COMMA');
    const anchor = this.consume('IDENT').value as string;
    // Optional trailing sizing keyword: [h, w, anchor, hug|hug-w|hug-h]. It makes
    // the bound component hug its content within the declared tile (see HugSpec).
    let hug: HugSpec | undefined;
    if (this.peek()?.type === 'COMMA') {
      this.consume('COMMA');
      const kw = this.consume('IDENT').value as string;
      if (kw === 'hug') hug = { w: true, h: true };
      else if (kw === 'hug-w') hug = { w: true, h: false };
      else if (kw === 'hug-h') hug = { w: false, h: true };
      else
        throw new Error(
          `[isdw] unknown sizing keyword "${kw}" for "${rawName}"; ` +
            `expected hug, hug-w, or hug-h`
        );
    }
    this.consume('RBRACKET');

    // Optional visibility clause: `?@ref` (show when truthy) or `?!@ref` (show
    // when falsy). `ref` is a value path — `@state.x`, `@item.x`, or `@method`.
    let visibility: VisibilityRef | undefined;
    if (this.peek()?.type === 'QUESTION') {
      this.consume('QUESTION');
      let negate = false;
      if (this.peek()?.type === 'BANG') { this.consume('BANG'); negate = true; }
      const ref = this.consume('VALUE_REF').value as string;
      visibility = { ref, negate };
    }

    // Optional `` `class names` `` block before the children. A styled variant
    // (Name:BaseType) seeds its baked-in classes here. A use-site class block may
    // contain ONLY dynamic `@method` bindings (e.g. a per-row colour) — literal
    // utility classes are not allowed at a use site; they belong in a variant.
    let className: string | undefined = regEntry?.className;
    const condClasses: { classes: string; ref: string; negate: boolean }[] = [];
    while (this.peek()?.type === 'CLASS_BLOCK') {
      const cls = this.consume('CLASS_BLOCK').value as string;
      // Optional trailing condition `?@ref` / `?!@ref`: these classes apply only
      // when the ref is truthy / falsy. A CONDITIONAL block may use literal
      // classes — it expresses a state-driven visual (e.g. a pop-up's scale/
      // opacity), which belongs in the .isdw, not a method.
      if (this.peek()?.type === 'QUESTION') {
        this.consume('QUESTION');
        let negate = false;
        if (this.peek()?.type === 'BANG') { this.consume('BANG'); negate = true; }
        const ref = this.consume('VALUE_REF').value as string;
        condClasses.push({ classes: cls, ref, negate });
        continue;
      }
      // Unconditional use-site block: only `@method` bindings (no literals).
      for (const tok of cls.split(/\s+/).filter(Boolean)) {
        if (!tok.startsWith('@')) {
          throw new Error(
            `[isdw] literal class "${tok}" is not allowed at a use site; ` +
              `declare a styled variant (Name:BaseType) instead`
          );
        }
      }
      className = className ? `${className} ${cls}` : cls;
    }

    const style = { ...baseStyle };

    // Split the class string into static classes and `@method` references. The
    // refs are resolved per render (with the current row item) and appended to
    // className — so e.g. a role badge can colour itself from its row's role.
    const classRefs: string[] = [];
    if (className) {
      const statics: string[] = [];
      for (const tok of className.split(/\s+/).filter(Boolean)) {
        if (tok.startsWith('@')) classRefs.push(tok.slice(1));
        else statics.push(tok);
      }
      className = statics.length ? statics.join(' ') : undefined;
    }

    this.consume('LBRACE');
    const children: ParsedItem[] = [...inlineChildren];
    while (this.peek()?.type !== 'RBRACE') {
      children.push(this.parseItem());
    }
    this.consume('RBRACE');

    return { name, args, height, width, anchor, children, style, className, classRefs, condClasses, hug, visibility };
  }

  private parseDimension(): DimValue {
    if (this.peek()?.type === 'IDENT' && this.peek()?.value === 'auto') {
      throw new Error(
        '[isdw] the `auto` dimension is no longer supported; give an explicit ' +
          'percentage (use a Spacer for any intentional empty space)'
      );
    }
    // `@ref` dimension — resolved per render to a percentage (reactive sizing).
    // `@ref ? A : B` resolves to A when the ref is truthy, else B (the two sizes
    // declared inline, e.g. `@state.collapsed ? 3.4vw : 13.5vw`).
    if (this.peek()?.type === 'VALUE_REF') {
      const ref = this.consume('VALUE_REF').value as string;
      if (this.peek()?.type === 'QUESTION') {
        this.consume('QUESTION');
        const whenTrue = this.parseDimLiteral();
        this.consume('COLON');
        const whenFalse = this.parseDimLiteral();
        return { ref, whenTrue, whenFalse };
      }
      return { ref };
    }
    return this.consume('NUMBER').value as number;
  }

  /** A literal dimension value inside a `@ref ? A : B`: a number (→ `%`) or a
   *  number with a unit (`3.4vw`, `64px`). Returns the final CSS string. */
  private parseDimLiteral(): string {
    const n = this.consume('NUMBER').value as number;
    const next = this.peek();
    if (next?.type === 'IDENT' && ['vw', 'vh', 'px', 'rem', 'em'].includes(next.value as string)) {
      this.pos++;
      return `${n}${next.value}`;
    }
    return `${n}%`;
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

// ==================== CONVERTER ====================

const LAYOUT_ITEMS = new Set(['Row', 'Col']);

const ANCHOR_V: Record<string, string> = { top: 'flex-start', center: 'center', bottom: 'flex-end' };
const ANCHOR_H: Record<string, string> = { left: 'flex-start', center: 'center', right: 'flex-end' };

/**
 * Map an anchor to absolute-position insets, used to place a child inside an
 * `Overlay` layer. The child keeps its dims (width/height %), so e.g.
 * `[10,10,bottom-right]` is a 10%×10% box pinned to the bottom-right corner with
 * the rest of the screen left empty.
 */
function anchorToAbsoluteInsets(anchor: string): Record<string, string> {
  const parts = anchor.split('-');
  const v = parts.length === 1 ? parts[0] : (parts[0] ?? 'top');
  const h = parts.length === 1 ? parts[0] : (parts[1] ?? 'left');
  const css: Record<string, string> = {};
  if (v === 'bottom') css.bottom = '0';
  else if (v === 'center') css.top = '50%';
  else css.top = '0';
  if (h === 'right') css.right = '0';
  else if (h === 'center') css.left = '50%';
  else css.left = '0';
  if (v === 'center' || h === 'center') {
    css.transform = `translate(${h === 'center' ? '-50%' : '0'}, ${v === 'center' ? '-50%' : '0'})`;
  }
  return css;
}

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
  /** Parameter names per definition (bound positionally to call args at expansion). */
  defParams: Map<string, string[]>;
  /** Call-site children to inject at a `Children` marker (set while expanding a definition). */
  slotChildren?: ParsedItem[];
  /** Definition names currently being expanded — guards against infinite recursion. */
  expanding: Set<string>;
  /** True for out-of-flow node types (Overlay/Modal/out-of-flow defs) — their
   *  cells render with `display:contents` so they occupy no flow space. */
  isOutOfFlow: (name: string) => boolean;
}

/**
 * Deep-copy a definition body item, replacing any arg that references a bound
 * parameter with that parameter's value. Parameters appear in the body as bare
 * identifiers (handler refs) or `@`/`~` refs whose name matches a param; the
 * bound value is whatever the caller passed in that position (a literal, another
 * ref, etc.), so values also thread through nested definition calls.
 */
function substituteParams(item: ParsedItem, bindings: Map<string, IsdwArg>): ParsedItem {
  if (bindings.size === 0) return item;
  const subArg = (a: IsdwArg): IsdwArg => {
    if (typeof a === 'string') {
      for (const prefix of [FN_REF_PREFIX, VALUE_REF_PREFIX, MODEL_REF_PREFIX]) {
        if (a.startsWith(prefix)) {
          const name = a.slice(prefix.length);
          return bindings.has(name) ? (bindings.get(name) as IsdwArg) : a;
        }
      }
      return a;
    }
    if (a && typeof a === 'object' && Array.isArray((a as { __isdwChildren?: ParsedItem[] }).__isdwChildren)) {
      return {
        __isdwChildren: (a as { __isdwChildren: ParsedItem[] }).__isdwChildren.map(c => substituteParams(c, bindings)),
      } as IsdwArg;
    }
    return a;
  };
  return {
    ...item,
    args: item.args.map(subArg),
    children: item.children.map(c => substituteParams(c, bindings)),
  };
}

// ==================== LAYOUT (TILING) VALIDATION ====================

/**
 * Direction in which a node lays its children out, or `null` if the node is NOT
 * a space-tiling container. Only `Row`, `Col`, `Form` and definition calls tile
 * their children; everything else (`Overlay`, `Modal`, `Repeat`, `Table`, and
 * leaf components whose children are a slot) is exempt from the sum-to-100 rule.
 */
function containerDirection(
  name: string,
  defs: Map<string, ParsedItem[]>
): 'row' | 'column' | null {
  if (name === 'Row') return 'row';
  if (name === 'Col' || name === 'Form') return 'column';
  if (defs.has(name)) return 'column'; // a def call's slot children flow in a column
  return null;
}

/**
 * Enforce total tiling: a container's children must account for ALL of its space
 * with no implicit gaps. Along the main axis (height for a column, width for a
 * row) the children's percentages must sum to exactly 100; along the cross axis
 * each child must be exactly 100. Any intentional empty space must be an explicit
 * element (e.g. a Spacer) with a declared percentage.
 */
/** Out-of-flow node types: portals / fixed layers. They don't occupy flow space,
 *  so they neither count toward a parent's tiling sum nor must fill the cross axis. */
const OUT_OF_FLOW = new Set(['Overlay', 'Modal']);

/**
 * A definition is itself out-of-flow when its body renders only out-of-flow
 * content (Overlay/Modal, or other out-of-flow definitions). This lets a shared
 * "chrome" widget — e.g. a feedback launcher that is just an Overlay + a Modal —
 * be called as a sibling without consuming any tiling space.
 */
function defIsOutOfFlow(
  name: string,
  defs: Map<string, ParsedItem[]>,
  seen: Set<string> = new Set()
): boolean {
  const body = defs.get(name);
  if (!body || seen.has(name)) return false;
  seen.add(name);
  return body.every(
    (c) => OUT_OF_FLOW.has(c.name) || (defs.has(c.name) && defIsOutOfFlow(c.name, defs, seen))
  );
}

/** Build the predicate that decides whether a node takes part in flow tiling. */
function makeOutOfFlowPredicate(defs: Map<string, ParsedItem[]>): (name: string) => boolean {
  return (name: string) => OUT_OF_FLOW.has(name) || (defs.has(name) && defIsOutOfFlow(name, defs));
}

function validateTiling(
  children: ParsedItem[],
  direction: 'row' | 'column',
  where: string,
  isOutOfFlow: (name: string) => boolean,
  containerHug?: HugSpec
): void {
  // Out-of-flow children (Overlay/Modal/out-of-flow defs) are positioned, not tiled.
  children = children.filter((c) => !isOutOfFlow(c.name));
  if (children.length === 0) return;
  const main = direction === 'row' ? 'width' : 'height';
  const cross = direction === 'row' ? 'height' : 'width';
  const mainKey = direction === 'row' ? 'w' : 'h';
  const crossKey = direction === 'row' ? 'h' : 'w';
  // Content-flow: when the container hugs the main axis, OR any child hugs the
  // main axis (is content-sized), the children PACK instead of tiling — so the
  // sum-to-100 rule is lifted (the leftover is explicit empty padding, exactly
  // as a hug element's unused tile space is). Strict tiling still applies to
  // every ordinary container.
  // A `@ref` (reactive) dim is resolved at render time, so its value can't be
  // summed statically — its presence on the main axis lifts the sum-to-100 rule
  // (just like hug), and on the cross axis it's exempt from the fill check. The
  // author guarantees the runtime values tile (e.g. sidebar + content widths).
  const packsMain =
    !!containerHug?.[mainKey] ||
    children.some((c) => c.hug?.[mainKey] || isDimRef(c[main]));
  let sum = 0;
  for (const c of children) {
    if (typeof c[main] === 'number') sum += c[main] as number;
    // A child that hugs the CROSS axis is content-sized there (≤100), and a
    // `@ref` cross dim is dynamic — both opt out of the fill-the-cross-axis rule.
    if (!c.hug?.[crossKey] && !isDimRef(c[cross]) && (c[cross] as number) !== 100) {
      throw new Error(
        `[isdw] ${c.name} in ${where}: cross-axis ${cross} must be 100 ` +
          `(got ${c[cross]}); no vacant space is allowed`
      );
    }
  }
  if (!packsMain && sum !== 100) {
    throw new Error(
      `[isdw] children of ${where} must tile to 100% along ${main}; got ${sum}. ` +
        `Add an explicit Spacer for any gap.`
    );
  }
}

/** Recursively validate tiling for a node's children, descending into all nodes. */
function walkTiling(
  item: ParsedItem,
  defs: Map<string, ParsedItem[]>,
  isOutOfFlow: (name: string) => boolean
): void {
  const dir = containerDirection(item.name, defs);
  if (dir) validateTiling(item.children, dir, `<${item.name}>`, isOutOfFlow, item.hug);
  for (const child of item.children) walkTiling(child, defs, isOutOfFlow);
}

function sizeOf(item: ParsedItem): SizeDef {
  const size: SizeDef = {};
  // Only static numeric dims become a fixed `%`; `@ref` dims are resolved at
  // render time (see dynSizeOf / LayoutRenderer).
  if (typeof item.height === 'number') size.height = pct(item.height);
  if (typeof item.width === 'number')  size.width  = pct(item.width);
  return size;
}

/** Collect the `@ref` (reactive) dimensions — resolved per render, not baked.
 *  A conditional dim carries its two inline sizes (`whenTrue`/`whenFalse`). */
function dynSizeOf(item: ParsedItem): DynamicSize | undefined {
  const dyn: DynamicSize = {};
  if (isDimRef(item.height)) dyn.height = dimRefToDynamic(item.height);
  if (isDimRef(item.width))  dyn.width  = dimRefToDynamic(item.width);
  return dyn.width || dyn.height ? dyn : undefined;
}

function dimRefToDynamic(d: DimRef): DynamicDim {
  return d.whenTrue !== undefined
    ? { ref: d.ref, whenTrue: d.whenTrue, whenFalse: d.whenFalse }
    : { ref: d.ref };
}

/**
 * Inline styles that make a bound component hug its content on the requested
 * axes. `fit-content` shrinks the box to its content but never past the tile
 * (the tile is the available width/height); `nowrap` + `overflow:hidden` +
 * `text-overflow:ellipsis` truncate a too-long label with `…` instead of letting
 * it spill out of the tile. These are spread LAST into the component's style, so
 * they override the renderer's default `width/height:100%` fill.
 */
function hugStyles(hug: HugSpec): Record<string, string> {
  const s: Record<string, string> = {};
  if (hug.w) {
    s.width = 'fit-content';
    s.maxWidth = '100%';
    s.minWidth = '0';
    s.overflow = 'hidden';
    s.textOverflow = 'ellipsis';
    s.whiteSpace = 'nowrap';
  }
  if (hug.h) {
    s.height = 'fit-content';
    s.maxHeight = '100%';
  }
  return s;
}

/**
 * Cell-level hug styles for a CONTAINER (Row/Col/Form): the cell shrinks to its
 * packed children on the hugged axis, capped at its tile. No overflow/ellipsis
 * (that would clip the children) — truncation is a leaf-text concern only.
 */
function hugContainerStyles(hug: HugSpec): Record<string, string> {
  const s: Record<string, string> = {};
  // NB: no inline max-width/height cap. The cell shrinks to its content
  // (fit-content); a hard tile cap would override author `max-w-*` classes
  // (which the feedback launcher's hover text-reveal relies on), and the
  // surrounding flex layout already constrains the cell in practice.
  if (hug.w) s.width = 'fit-content';
  if (hug.h) s.height = 'fit-content';
  return s;
}

/** Node names that can't be hugged: they bind no component AND don't lay out
 *  flow children whose packing `hug` could control. (`Table` IS huggable — it
 *  expands to a Col of content-height rows, so `hug-h` gives a content-height
 *  card with no dead space below the last row; handled in `expandTable`.) */
const HUG_INVALID_ON = new Set(['Overlay', 'Modal', 'Children']);

/** Throw if `hug` is used where it has nothing to size (a portal/slot/table or
 *  a definition call). Containers (Row/Col/Form) and components are fine. */
function assertHuggable(item: ParsedItem, isDef: boolean): void {
  if (!item.hug) return;
  if (HUG_INVALID_ON.has(item.name) || isDef) {
    throw new Error(
      `[isdw] "${item.name}" cannot use hug — nothing to content-size here. ` +
        `hug applies to components (e.g. Button/Text) and layout containers ` +
        `(Row/Col/Form), not definitions, slots, tables, or out-of-flow layers.`
    );
  }
}

function mkItem(
  name: string,
  args: IsdwArg[],
  height: DimValue,
  width: DimValue,
  anchor: string,
  children: ParsedItem[],
  style: Record<string, string> = {}
): ParsedItem {
  return { name, args, height, width, anchor, children, style };
}

/**
 * Expand `Table(@data){ Column("H"){ cell } ... }` into existing primitives: a
 * header Row of column labels, then a Repeat over `@data` whose template is a Row
 * of one cell per column. Cell templates use `@item.field` and resolve per row via
 * the Repeat's item scope. Each Column's `[h,w,anchor]` provides the column width
 * and cell alignment (height is auto so rows size to content).
 */
function expandTable(item: ParsedItem, ctx: ConvertCtx): LayoutDef {
  const dataArg = item.args.find(
    (a): a is string => typeof a === 'string' && a.startsWith(VALUE_REF_PREFIX)
  );
  const columns = item.children.filter(c => c.name === 'Column');

  // Header: a tinted row of small, uppercase, muted column labels with generous
  // cell padding — the conventional data-table header look.
  const headerCells = columns.map(col => {
    // Font size is set in vw (not a px/rem `text-xs` class) so table headers
    // scale with the viewport like the rest of the text.
    const label = mkItem(
      'Text', [String(col.args[0] ?? '')], 'auto', 100, col.anchor, [], { fontSize: '0.63vw' }
    );
    label.className = 'font-medium text-gray-500 uppercase tracking-wider';
    // Cell padding is vw (not px-6/py-3) so the table is zoom-invariant.
    const cell = mkItem('Col', [], 'auto', col.width, col.anchor, [label], {
      paddingLeft: '1.6vw', paddingRight: '1.6vw', paddingTop: '0.8vw', paddingBottom: '0.8vw',
    });
    return cell;
  });
  const headerRow = mkItem('Row', [], 'auto', 100, 'top-left', headerCells, {
    borderBottom: '0.07vw solid #e5e7eb',
  });
  headerRow.className = 'bg-gray-50';

  // Body cells carry the same horizontal padding and a comfortable vertical
  // rhythm; rows are separated by a light divider.
  const bodyCells = columns.map(col => {
    const cell = mkItem('Col', [], 'auto', col.width, col.anchor, col.children, {
      paddingLeft: '1.6vw', paddingRight: '1.6vw', paddingTop: '1vw', paddingBottom: '1vw',
    });
    cell.className = 'whitespace-nowrap';
    return cell;
  });
  const bodyRowTemplate = mkItem('Row', [], 'auto', 100, 'top-left', bodyCells, {
    borderBottom: '0.07vw solid #e5e7eb',
  });

  const repeat = mkItem('Repeat', dataArg ? [dataArg] : [], 'auto', 100, 'top-left', [bodyRowTemplate]);

  // `hug` content-sizes the card on the requested axis: an `auto` dim emits no
  // fixed size, so the Col shrinks to its rows (no dead white space below the
  // last row) instead of stretching to the declared tile height.
  const tableStyle = { ...item.style };
  if (item.hug?.w) tableStyle.width = 'fit-content';
  const tableCol = mkItem(
    'Col', [],
    item.hug?.h ? 'auto' : item.height,
    item.hug?.w ? 'auto' : item.width,
    item.anchor, [headerRow, repeat], tableStyle
  );
  tableCol.className = item.className;
  return convertItem(tableCol, ctx);
}

/** Convert a parsed item, attaching its `?@ref` visibility condition (if any) to
 *  the resulting cell. The heavy lifting is in `convertNode`. */
function convertItem(item: ParsedItem, ctx: ConvertCtx): LayoutDef {
  const def = convertNode(item, ctx);
  if (item.visibility) def.visibility = item.visibility;
  const dyn = dynSizeOf(item);
  if (dyn) def.dynamicSize = dyn;
  // Dynamic `@class` refs / conditional class blocks on a CONTAINER (no bound
  // component) are resolved by the LayoutRenderer; a component's `@class` refs
  // are already wired as className value-bindings.
  if (item.classRefs?.length && !def.componentId) def.classRefs = item.classRefs;
  if (item.condClasses?.length) def.condClasses = item.condClasses;
  return def;
}

function convertNode(item: ParsedItem, ctx: ConvertCtx): LayoutDef {
  assertHuggable(item, ctx.defs.has(item.name));
  const size = sizeOf(item);
  const isdwStyle = Object.keys(item.style).length ? item.style : undefined;
  const colAnchor = anchorToFlexProps(item.anchor, 'column');
  // Out-of-flow nodes (Modal / out-of-flow defs) render with `display:contents`
  // so their wrapper cell occupies NO flow space (their real content is a portal
  // or fixed layer). This means authors don't have to fake a 0 height for them.
  // (Overlay has its own branch below; its layer is already position:fixed.)
  const outOfFlow = ctx.isOutOfFlow(item.name);
  const cellStyle = outOfFlow ? { ...(isdwStyle ?? {}), display: 'contents' } : isdwStyle;

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
    // Bind the definition's parameters to this call's positional args, then
    // substitute references in the body (missing args bind to '' so they render
    // empty rather than leaking the param name).
    const params = ctx.defParams.get(item.name) ?? [];
    const bindings = new Map<string, IsdwArg>();
    params.forEach((p, i) => bindings.set(p, item.args[i] ?? ''));
    const body = bindings.size ? defBody.map(t => substituteParams(t, bindings)) : defBody;

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
      children: body.map(t => convertItem(t, innerCtx)),
      isdwStyle: cellStyle,
    };
  }

  // Overlay — a full-viewport, click-through layer. Each child is absolutely
  // positioned by its own anchor + dims, so it occupies exactly that box at that
  // corner and the rest of the screen stays empty and interactive (the layer
  // itself is pointer-events:none; children opt back in). No fixed/pixel classes
  // needed — placement comes entirely from dims + anchor.
  if (item.name === 'Overlay') {
    const children = item.children.map(child => {
      const layout = convertItem(child, ctx);
      // An Overlay child is positioned (not tiled), so `hug` may shrink it to
      // content on the hugged axis — its declared dim becomes the MAX bound
      // (so a docked panel grows from its corner to fit content, no dead space).
      const hugStyle: Record<string, string> = {};
      if (child.hug?.w) {
        hugStyle.width = 'fit-content';
        if (layout.size?.width) hugStyle.maxWidth = layout.size.width;
      }
      if (child.hug?.h) {
        hugStyle.height = 'fit-content';
        if (layout.size?.height) hugStyle.maxHeight = layout.size.height;
      }
      return {
        ...layout,
        isdwStyle: {
          ...(layout.isdwStyle ?? {}),
          position: 'absolute',
          pointerEvents: 'auto',
          ...anchorToAbsoluteInsets(child.anchor),
          ...hugStyle,
        },
      } as LayoutDef;
    });
    return {
      type: 'flex',
      direction: 'column',
      size: { width: '100%', height: '100%' },
      children,
      isdwStyle: {
        position: 'fixed',
        top: '0',
        left: '0',
        right: '0',
        bottom: '0',
        pointerEvents: 'none',
        outline: 'none',
        zIndex: '50',
        ...(isdwStyle ?? {}),
      },
      ...(item.className ? { className: item.className } : {}),
    };
  }

  // Table sugar — expands to a header row + a Repeat of row templates.
  if (item.name === 'Table') {
    return expandTable(item, ctx);
  }

  // Layout primitives (Row/Col).
  if (LAYOUT_ITEMS.has(item.name)) {
    const direction = item.name === 'Row' ? 'row' : 'column';
    const { justifyContent, alignItems } = anchorToFlexProps(item.anchor, direction);
    const children = item.children.map(child => convertItem(child, ctx));
    // Content-flow: a container hugged on its MAIN axis lays its children out by
    // content (they pack) instead of tiling. The container keeps its own size;
    // each child's main-axis size is dropped so it shrinks to content, and the
    // anchor's justify-content packs them, leaving the rest as explicit empty
    // space. (Cross-axis hug, if any, just content-sizes the cell itself.)
    const mainHug = direction === 'column' ? item.hug?.h : item.hug?.w;
    if (mainHug) {
      for (const ch of children) {
        if (!ch.size) continue;
        if (direction === 'column') delete ch.size.height;
        else delete ch.size.width;
      }
    }
    const crossHug = direction === 'column' ? item.hug?.w : item.hug?.h;
    const containerStyle = crossHug
      ? { ...(isdwStyle ?? {}), ...hugContainerStyles({ w: direction === 'column', h: direction === 'row' }) }
      : isdwStyle;
    return {
      type: 'flex',
      direction,
      justifyContent,
      alignItems,
      size,
      children,
      isdwStyle: containerStyle,
      ...(item.className ? { className: item.className } : {}),
    };
  }

  // Select sugar — `Select(~role){ Option("Admin") … }`. The <option> elements
  // must be direct DOM children of <select>, but every layout child is wrapped in
  // a layout <div>, which is invalid inside a <select>. So lift Option children
  // into an `options: [{value,label}]` prop (the Select builtin renders that) and
  // emit no layout children.
  if (item.name === 'Select' && item.children.some(c => c.name === 'Option')) {
    const id = genId('select');
    const options = item.children
      .filter(c => c.name === 'Option')
      .map(c => ({ value: c.args[0] ?? '', label: c.args[1] ?? c.args[0] ?? '' }));
    const def = buildComponentDef(item, id);
    def.props = { ...def.props, options };
    ctx.components.push(def);
    return { type: 'flex', direction: 'column', ...colAnchor, size, children: [], componentId: id };
  }

  // Component (builtin / registered / custom). Children stay as layout nodes on
  // the bound cell; the LayoutRenderer threads them into the component as its
  // slot so containers (Card, Table, imported components) render their content.
  // slotChildren is passed through so a `Children` marker nested inside a
  // definition's component still resolves.
  const id = genId(item.name.toLowerCase());
  ctx.components.push(buildComponentDef(item, id));
  const children = item.children.map(child => convertItem(child, ctx));
  // A hugged component shrinks to its content; make its CELL content-width/height
  // too. Otherwise the cell keeps the dim's `width:100%`, which collapses to 0
  // inside a fit-content parent (e.g. the feedback launcher's hover label) and
  // is what makes a hug pill content-sized within a definite-width column.
  const hugCell: Record<string, string> = {};
  if (item.hug?.w) {
    hugCell.width = 'fit-content';
    if (typeof item.width === 'number') hugCell.maxWidth = `${item.width}%`;
  }
  if (item.hug?.h) {
    hugCell.height = 'fit-content';
    if (typeof item.height === 'number') hugCell.maxHeight = `${item.height}%`;
  }
  const cellIsdw = outOfFlow
    ? { ...(cellStyle ?? {}), ...hugCell }
    : Object.keys(hugCell).length
      ? hugCell
      : undefined;
  return {
    type: 'flex', direction: 'column', ...colAnchor, size, children, componentId: id,
    ...(cellIsdw ? { isdwStyle: cellIsdw } : {}),
  };
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
  // hug styles win over anchor defaults and variant styles so the component
  // actually shrinks to content (overriding the renderer's default fill).
  const hug = item.hug ? hugStyles(item.hug) : {};
  const merged = { ...anchorStyle, ...item.style, ...hug };
  const isdwStyle = Object.keys(merged).length ? merged : undefined;

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
    // Dynamic classes (`@method` tokens in a class block) resolve to strings that
    // are appended to className per render.
    ...(item.classRefs ?? []).map(methodId => ({ prop: 'className', methodId, kind: 'value' as const })),
  ];
  const withBindings = (def: ComponentDef): ComponentDef => {
    const withB = bindings.length ? { ...def, bindings } : def;
    return item.className ? { ...withB, className: item.className } : withB;
  };

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

    case 'Label':
      return withBindings({ id, type: 'Label', props: { text: String(first ?? '') }, isdwStyle });

    case 'Icon': {
      // `Icon("House")` → name only; `Icon("House", 24)` → name + size;
      // `Icon("ChatCenteredDots", 24, "white")` → + colour (a numeric arg is the
      // size, a string arg the colour). Name may also be bound dynamically via
      // `@method` (PRIMARY_PROP.Icon = 'name'), e.g. a dark-mode toggle swapping
      // MoonStars/SunDim.
      const props: Record<string, unknown> = { name: String(first ?? '') };
      for (const rest of literals.slice(1)) {
        if (typeof rest === 'number') props.size = rest;
        else if (typeof rest === 'string') props.color = rest;
      }
      return withBindings({ id, type: 'Icon', props, isdwStyle });
    }

    case 'Option': {
      // `Option("Admin")` → value & label both "Admin"; `Option("admin", "Administrator")`
      // → value "admin", label "Administrator".
      const value = first ?? '';
      const label = second ?? first ?? '';
      return withBindings({ id, type: 'Option', props: { value, label }, isdwStyle });
    }

    case 'Input':
    case 'Textarea':
      // `Input(~model, "Placeholder text")` — the `~model` binds the value; the
      // first string literal is the placeholder (its text is content → .isdw).
      return withBindings({
        id,
        type: item.name,
        props: first != null ? { placeholder: String(first) } : {},
        isdwStyle,
      });

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
  Modal: 'open',
  Icon: 'name',
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

  // Total-tiling validation: every page (a column root) and every definition
  // body (also a column) must tile to 100%, as must every nested Row/Col/Form.
  const isOutOfFlow = makeOutOfFlowPredicate(parser.defRegistry);
  for (const { route, items } of parsedPages) {
    validateTiling(items, 'column', `page ${route}`, isOutOfFlow);
    items.forEach((it) => walkTiling(it, parser.defRegistry, isOutOfFlow));
  }
  for (const [name, body] of parser.defRegistry) {
    validateTiling(body, 'column', `define ${name}`, isOutOfFlow);
    body.forEach((it) => walkTiling(it, parser.defRegistry, isOutOfFlow));
  }

  const pages = parsedPages.map(({ route, scroll, items }) => {
    const components: ComponentDef[] = [];
    const ctx: ConvertCtx = {
      components,
      defs: parser.defRegistry,
      defParams: parser.defParamRegistry,
      expanding: new Set(),
      isOutOfFlow,
    };
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
