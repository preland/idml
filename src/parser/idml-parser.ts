import type { UIConfig, LayoutDef, ComponentDef, FlexDef, SizeDef, DataBindingDef } from '../types';
import type { DarkRule } from '../types/config.types';
import type { PercentageString, DynamicSize, DynamicDim } from '../types/layout.types';

// ==================== PARSED INTERMEDIATE TYPES ====================

// A dimension is a static percentage number, or a `@ref` value-binding (resolved
// per render to a dimension) so a cell can resize on state — e.g. a sidebar that
// narrows when collapsed. A `@ref ? A : B` form picks A/B from the ref's
// truthiness so the two sizes (the visual values) live in the .idml, not in a
// method. (`'auto'` is gone; see parseDimension.)
type DimRef = { ref: string; whenTrue?: string; whenFalse?: string };
// `'auto'` is internal-only (table expansion uses it for content-height); the
// parser rejects it as user input. `@ref` dims come from `parseDimension`.
type DimValue = number | 'auto' | DimRef;
const isDimRef = (d: DimValue): d is DimRef => typeof d === 'object' && d !== null && 'ref' in d;

/**
 * Content-sizing ("fit") flags. An element still declares its `[h,w]` percentage
 * tile — that tile is its MAX bound and IS COUNTED in the parent's tiling sum, so
 * the space is fully accounted for — but a fit axis draws the element at its
 * natural (content) size within that reserved box, clipping with an ellipsis if
 * the content would overflow the max. (Formerly `hug`; the name `hug` now means
 * fill-remaining — see ParsedItem.fit.)
 */
interface FitSpec {
  w: boolean;
  h: boolean;
}

/**
 * Fill flags — the opposite of hug. A filled axis makes the element STRETCH to
 * its flex line's cross size (i.e. the tallest/widest sibling) instead of
 * sizing to its own `[h,w]` tile, via `align-self: stretch` + an `auto` size on
 * that axis. Use it so paired cards in a Row become equal height (the shorter
 * grows to match the taller) without the tile forcing a fixed height. `fill-h`
 * stretches height (the cross axis in a Row); `fill-w` stretches width (the
 * cross axis in a Col).
 */
interface FillSpec {
  w: boolean;
  h: boolean;
}

// An argument value in a component call. Bare identifiers become tagged strings
// (FN_REF_PREFIX = handler, VALUE_REF_PREFIX = reactive value binding); `null`,
// booleans, numbers and strings are literals; a `{ }` block is a children marker.
type IdmlArg = string | number | boolean | null | Record<string, unknown>;

interface ParsedItem {
  name: string;
  args: IdmlArg[];
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
  /** Optional content-sizing flags from a trailing `fit` / `fit-w` / `fit-h`
   *  token — natural size, capped at the declared `%` (which still counts toward
   *  the parent's tiling sum). */
  fit?: FitSpec;
  /** Optional stretch-to-fill flags from a trailing `fill` / `fill-w` /
   *  `fill-h` token — cross-axis stretch (align-self: stretch). */
  fill?: FillSpec;
  /** Optional `hug` token — the element fills the REMAINING main-axis space of
   *  its parent (flex: 1 1 0), splitting it equally with any sibling `hug`s, so
   *  all space is accounted for. Its declared main-axis % is ignored (flex owns
   *  it). Formerly named `grow`. */
  hug?: boolean;
  /** Optional visibility condition from a `?@ref` / `?!@ref` clause after the
   *  dims — the element renders only when the ref is truthy (negate flips it). */
  visibility?: VisibilityRef;
  /** Source spans for the editable sub-parts of this item — populated ONLY when
   *  the parser runs in source-tracking mode (parseIdmlWithSource). Undefined on
   *  the normal parse path, so it adds no cost there. */
  src?: ItemSrc;
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
  defaultArgs: IdmlArg[];
  style: Record<string, string>;
  /** Utility (Tailwind) classes baked into this styled variant. */
  className?: string;
  /** Source-tracking only: the file the variant was declared in and the span of
   *  its `` `class` `` block content — the write-back target for its styling. */
  classFile?: string;
  classSpan?: SourceSpan;
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
  | 'MODEL_DYN_REF'
  | 'CLASS_BLOCK';

interface Token {
  type: TokenType;
  value?: string | number;
  /** Char offset of the token's first character in the ORIGINAL source string.
   *  Present on every token (the tokenizer records it); used by the source-aware
   *  parse path to map a parsed item back to the exact bytes that produced it. */
  start?: number;
  /** Char offset one past the token's last character in the original source. */
  end?: number;
}

/** A half-open `[start, end)` char range into a specific source file. */
export interface SourceSpan {
  start: number;
  end: number;
}

/** Source spans captured for one parsed item, all indexing into `file`. Only
 *  the editable sub-parts are tracked (the visual-editor writes these back). */
export interface ItemSrc {
  /** The file these spans index into — the entry file name (ParseOptions.fileName)
   *  or the import path the item was authored in. */
  file: string;
  /** The component/variant name token. */
  name?: SourceSpan;
  /** First literal string argument (an editable label / text), content only. */
  text?: SourceSpan;
  /** `[height,width,anchor]` sub-spans. */
  height?: SourceSpan;
  width?: SourceSpan;
  anchor?: SourceSpan;
  /** A use-site `` `class` `` block's content (present only when the item carries
   *  literal/`@`-ref classes at the call site rather than via a variant). */
  className?: SourceSpan;
  /** If the item was authored through a styled variant (`Name:BaseType`), the
   *  variant it used — its class text lives at [[styleClassOrigin]] in the file
   *  where the variant is declared. */
  variant?: string;
}

/**
 * Where a rendered component's editable bytes live in source. Keyed by the
 * component id in the produced UIConfig, so the editor can map a selection (or a
 * PropertyPanel edit) straight to a file + span. Returned by parseIdmlWithSource.
 */
export interface ComponentOrigin {
  id: string;
  /** File the item's own spans index into. */
  file: string;
  /**
   * - `direct`   — a page-level item; its spans are its own and unique.
   * - `define`   — produced inside an expanded `define` body; the spans point at
   *                the definition (shared by every call site → editing affects all).
   * - `synthetic`— generated by desugaring (Table/Repeat/Select-options); no
   *                single authored span to edit.
   */
  kind: 'direct' | 'define' | 'synthetic';
  /** Editable spans for this component (see ItemSrc). */
  spans: Omit<ItemSrc, 'file' | 'variant'>;
  /** When the component's classes come from a styled variant, the variant's own
   *  class-text span (in `classFile`) — the place to edit its styling. Shared by
   *  every component that uses the variant. */
  variant?: string;
  classFile?: string;
  classSpan?: SourceSpan;
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
        `[idml] line ${lineNo} is ${line.length} columns; the limit is ${MAX_LINE_WIDTH}`
      );
    }
    const trimmed = line.trim();
    if (trimmed === '') return;
    if (trimmed.startsWith('#')) {
      if (codeStarted) {
        throw new Error(
          `[idml] line ${lineNo}: comments are only allowed in the header block ` +
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
  // Replace them with spaces of EQUAL LENGTH (not ''), so every remaining char
  // keeps its original offset — token start/end then index straight into `source`,
  // which the source-aware parse path relies on for write-back. Whitespace is
  // skipped by the scanner below, so the spaces are inert. Inline # (hex colours
  // inside style blocks) are on code lines and untouched.
  const stripped = source
    .split('\n')
    .map(line => (line.trimStart().startsWith('#') ? ' '.repeat(line.length) : line))
    .join('\n');

  const tokens: Token[] = [];
  let i = 0;

  while (i < stripped.length) {
    if (/\s/.test(stripped[i])) { i++; continue; }

    // Route: ./segment or ./segment/segment (multi-segment routes supported)
    if (stripped[i] === '.' && stripped[i + 1] === '/') {
      let j = i + 2;
      while (j < stripped.length && /[\w/-]/.test(stripped[j])) j++;
      tokens.push({ type: 'ROUTE', value: '/' + stripped.slice(i + 2, j), start: i, end: j });
      i = j;
      continue;
    }

    // Hex color: #rrggbb or #rgb
    if (stripped[i] === '#' && /[0-9a-fA-F]/.test(stripped[i + 1] ?? '')) {
      let j = i + 1;
      while (j < stripped.length && /[0-9a-fA-F]/.test(stripped[j])) j++;
      tokens.push({ type: 'COLOR', value: stripped.slice(i, j), start: i, end: j });
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
      tokens.push({ type: 'VALUE_REF', value: stripped.slice(i + 1, j), start: i, end: j });
      i = j;
      continue;
    }

    // Dynamic two-way model reference: ~@path — binds an input's value to a
    // form-state cell whose KEY is resolved at render from the value-ref `path`
    // (e.g. `~@item.key` inside a Repeat writes `values[item.key]`). Must precede
    // the static `~name` rule below since both start with `~`.
    if (stripped[i] === '~' && stripped[i + 1] === '@' && /[a-zA-Z_]/.test(stripped[i + 2] ?? '')) {
      let j = i + 2;
      while (j < stripped.length && /[\w.-]/.test(stripped[j])) j++;
      tokens.push({ type: 'MODEL_DYN_REF', value: stripped.slice(i + 2, j), start: i, end: j });
      i = j;
      continue;
    }

    // Two-way model reference: ~stateName — binds an input's value to a form-state
    // cell (read + write). Used on form inputs, e.g. Input(~email).
    if (stripped[i] === '~' && /[a-zA-Z_]/.test(stripped[i + 1] ?? '')) {
      let j = i + 1;
      while (j < stripped.length && /[\w-]/.test(stripped[j])) j++;
      tokens.push({ type: 'MODEL_REF', value: stripped.slice(i + 1, j), start: i, end: j });
      i = j;
      continue;
    }

    // Inline `<...>` style blocks are no longer supported — all styling lives in
    // named styled variants (Name:BaseType). Reject them explicitly.
    if (stripped[i] === '<') {
      throw new Error(
        '[idml] inline `<...>` style blocks are no longer supported; ' +
          'declare a styled variant (Name:BaseType) and apply it instead'
      );
    }

    // CSS class block: `class names here` (backticks). Spaces allowed; flows to
    // the element's className (e.g. Tailwind utilities).
    if (stripped[i] === '`') {
      let j = i + 1;
      while (j < stripped.length && stripped[j] !== '`') j++;
      // Span covers the content BETWEEN the backticks (excludes the delimiters),
      // so a write-back replaces the class text and leaves the backticks intact.
      tokens.push({ type: 'CLASS_BLOCK', value: stripped.slice(i + 1, j).trim(), start: i + 1, end: j });
      i = j + 1;
      continue;
    }

    // Single-char tokens
    if (stripped[i] in SINGLE_CHAR_TOKENS) {
      tokens.push({ type: SINGLE_CHAR_TOKENS[stripped[i]], start: i, end: i + 1 });
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
      // Span covers the content BETWEEN the quotes (excludes them), so a
      // write-back edits the literal's text without disturbing the quoting.
      tokens.push({ type: 'STRING', value: stripped.slice(i + 1, j), start: i + 1, end: j });
      i = j + 1;
      continue;
    }

    // Number (may include decimal point)
    if (/\d/.test(stripped[i])) {
      let j = i;
      while (j < stripped.length && /[\d.]/.test(stripped[j])) j++;
      tokens.push({ type: 'NUMBER', value: parseFloat(stripped.slice(i, j)), start: i, end: j });
      i = j;
      continue;
    }

    // Identifier (includes hyphenated keywords like top-left)
    if (/[a-zA-Z_]/.test(stripped[i])) {
      let j = i;
      while (j < stripped.length && /[\w-]/.test(stripped[j])) j++;
      tokens.push({ type: 'IDENT', value: stripped.slice(i, j), start: i, end: j });
      i = j;
      continue;
    }

    throw new Error(`[idml] Unexpected character '${stripped[i]}' at position ${i}`);
  }

  return tokens;
}

// ==================== CLASS-BLOCK GUARD ====================

// Tailwind utility classes that control an element's SIZING or LAYOUT in any
// way. These are forbidden inside idml class blocks: idml owns geometry — size
// comes from the `[h,w]` dims + hug/fill/grow, and spacing/flow from style-block
// props (pad, gap, align, overflow, or any raw CSS prop like flexShrink). A
// class block may carry ONLY visual styling (colour, border, radius, shadow,
// font weight/family/style, opacity, transform, transition, hover/focus states).
// Each entry is matched against the *base* class (after stripping `!`, any
// `variant:` prefixes, and a leading `-`). See assertNoLayoutClasses.
const LAYOUT_CLASS_PATTERNS: RegExp[] = [
  // Spacing: padding / margin / gap / space-between
  /^(p|m)[trblxyse]?-/,
  /^gap(-[xy])?-/,
  /^space-[xy]-/,
  /^scroll-(p|m)[trblxyse]?-/,
  // Sizing: width / height / min / max / size / flex-basis / aspect / columns
  /^(w|h|size|min-w|max-w|min-h|max-h|min|max)-/,
  /^basis-/,
  /^aspect-/,
  /^columns-/,
  // Flexbox / grid layout
  /^flex(-|$)/,
  /^(grow|shrink)(-|$)/,
  /^order-/,
  /^(justify|items|self|content|place)-/,
  /^grid(-|$)/,
  /^(col|row)-/,
  /^(auto-cols|auto-rows|grid-cols|grid-rows|grid-flow)-/,
  // Display
  /^(block|inline-block|inline-flex|inline-grid|inline|flow-root|contents|hidden|inline-table|table|table-.+|list-item)$/,
  // Position
  /^(static|fixed|absolute|relative|sticky)$/,
  /^(inset|top|right|bottom|left|start|end)-/,
  /^inset$/,
  /^z-/,
  // Overflow
  /^overflow(-|$)/,
  /^overscroll(-|$)/,
  // Float / clear
  /^(float|clear)-/,
  // Text alignment (idml: `align`) + font size (idml: `size`) + line-height
  /^text-(left|center|right|justify|start|end)$/,
  /^text-(xs|sm|base|lg|xl|[0-9]+xl)$/,
  /^leading-/,
  /^truncate$/,
  /^box-(border|content)$/,
];

// Throw if a class string contains any layout/sizing Tailwind utility. `where`
// names the offending element for the error. `@method` tokens are skipped (they
// resolve to dynamic classes at render time and can't be checked statically).
function assertNoLayoutClasses(classStr: string, where: string): void {
  for (const raw of classStr.split(/\s+/).filter(Boolean)) {
    if (raw.startsWith('@')) continue;
    // Normalise: drop leading `!` (important) and any `variant:` prefixes, then a
    // leading `-` (negative utilities), before matching the base utility.
    let base = raw.replace(/^!/, '');
    const colon = base.lastIndexOf(':');
    if (colon !== -1) base = base.slice(colon + 1);
    base = base.replace(/^-/, '');
    if (LAYOUT_CLASS_PATTERNS.some((re) => re.test(base))) {
      throw new Error(
        `[idml] class "${raw}" on ${where} controls sizing/layout, which is not ` +
          `allowed in a class block — idml owns geometry. Use the [h,w] dims + ` +
          `hug/fill/grow, or a style-block prop (pad/gap/align/overflow, or a raw ` +
          `CSS prop like flexShrink), instead. Only visual styling (colour, ` +
          `border, radius, shadow, font, opacity, transform) may live in a class.`
      );
    }
  }
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
// Prefix for `~@path` DYNAMIC model references — a two-way binding whose form-state
// key is resolved at render from a value-ref path (usually the current Repeat row,
// e.g. `~@item.key`). Lets a data-driven field grid two-way-bind each generated
// input to `values[item.key]` — impossible with the static `~name` sugar.
const MODEL_DYN_REF_PREFIX = '\x00modeldyn:';

// Names that resolve to builtins (renderer-provided) or layout primitives, so an
// `import` of them needn't be defined in the target file. Kept here (rather than
// importing from the renderer) to preserve the parser/renderer separation.
const BUILTIN_NAMES = new Set([
  'Text', 'Heading', 'Button', 'Link', 'Image', 'List', 'Card', 'Divider', 'Spacer',
  'Icon', 'Table', 'Children', 'Row', 'Col', 'Repeat', 'Form', 'Modal', 'Column',
  'Overlay', 'Input', 'Textarea', 'Select', 'Option', 'Checkbox', 'Radio', 'Label',
  'Embed',
]);

class IdmlParser {
  private tokens: Token[];
  private pos = 0;
  /** Name of the file these tokens came from — recorded on each item's `src`
   *  so write-back knows which file to patch. Set for the entry + every import. */
  fileName: string;
  /** When true, parseItem records source spans into each ParsedItem.src and
   *  parseStyleDefs records variant class spans. Off on the normal parse path. */
  trackSource: boolean;
  styleRegistry: Map<string, StyleEntry> = new Map();
  // Reusable component definitions: name -> body template (item list). A `define`
  // block registers one; using the name as an item expands the body (macro-style),
  // substituting the call's children at the `Children` marker. See convertItem.
  defRegistry: Map<string, ParsedItem[]> = new Map();
  // Parameter names per definition (e.g. `define TopBar(title)` -> ['title']).
  // At expansion the call's positional args are bound to these names and any
  // matching references inside the body are substituted. See convertItem.
  defParamRegistry: Map<string, string[]> = new Map();
  // Dark-mode overrides from `dark { ... }` blocks (shared across imports, so a
  // block in styles.idml reaches every page that imports it). See parseDarkBlock.
  darkStyles: DarkRule[] = [];

  constructor(tokens: Token[], fileName = '<entry>', trackSource = false) {
    this.tokens = tokens;
    this.fileName = fileName;
    this.trackSource = trackSource;
  }

  private peek(offset = 0): Token | undefined { return this.tokens[this.pos + offset]; }

  /** A span from a single token (source-tracking helper). */
  private spanOf(tok: Token | undefined): SourceSpan | undefined {
    return tok?.start != null && tok.end != null ? { start: tok.start, end: tok.end } : undefined;
  }

  /** The span covering everything from the current token through the token just
   *  consumed by `fn` — used for multi-token dims like `@ref ? A : B`. */
  private spanAround<T>(fn: () => T): { value: T; span: SourceSpan | undefined } {
    const start = this.peek()?.start;
    const value = fn();
    const end = this.tokens[this.pos - 1]?.end;
    const span = start != null && end != null ? { start, end } : undefined;
    return { value, span };
  }

  private consume(type?: TokenType): Token {
    const t = this.tokens[this.pos++];
    if (!t) throw new Error('[idml] Unexpected end of input');
    if (type && t.type !== type) {
      throw new Error(`[idml] Expected ${type}, got ${t.type} ("${t.value}")`);
    }
    return t;
  }

  // Entry point. resolve() is called to load imported .idml files.
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
        if (t?.type === 'IDENT' && t.value === 'dark' && this.peek(1)?.type === 'LBRACE') {
          this.parseDarkBlock();
          continue;
        }
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
  // In both cases the referenced .idml file is parsed and its definitions +
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
          throw new Error(`[idml] Expected 'from' in import, got "${fromTok.value}"`);
        }
        const importPath = this.consume('STRING').value as string;
        this.resolveImport(importPath, names, resolve);
        continue;
      }

      break;
    }
  }

  // Resolve and parse an imported .idml file into the shared registries.
  // `names`, when non-empty, are validated against what the file actually defines.
  private resolveImport(
    importPath: string,
    names: string[],
    resolve?: (path: string) => string
  ): void {
    // Only .idml (or extension-less) imports are resolvable here. Other imports
    // (e.g. .ts/.tsx) are documentation-only at parse time.
    const afterLastSlash = importPath.slice(importPath.lastIndexOf('/') + 1);
    const dotIdx = afterLastSlash.lastIndexOf('.');
    const ext = dotIdx >= 0 ? afterLastSlash.slice(dotIdx) : '';
    if (ext !== '.idml' && ext !== '') return;
    if (!resolve) return;

    const src = resolve(importPath);
    const sub = new IdmlParser(tokenize(src), importPath, this.trackSource);
    sub.styleRegistry = this.styleRegistry; // share registries
    sub.defRegistry = this.defRegistry;
    sub.defParamRegistry = this.defParamRegistry;
    sub.darkStyles = this.darkStyles; // dark {} blocks propagate to importers
    sub.parseImports(resolve); // transitive imports
    sub.parseTopDecls();

    for (const name of names) {
      if (
        !this.defRegistry.has(name) &&
        !this.styleRegistry.has(name) &&
        !BUILTIN_NAMES.has(name)
      ) {
        console.warn(`[idml] import: "${name}" is not defined in ${importPath}`);
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
      if (t?.type === 'IDENT' && t.value === 'dark' && this.peek(1)?.type === 'LBRACE') {
        this.parseDarkBlock();
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

  // Parse a `dark { key { cssProp: val ... } ... }` block: the DSL-native
  // dark-mode overrides (replaces a hand-written CSS file). Each entry keys a
  // selector — `root` (the `.idml-root` itself), `controls` (form inputs), or a
  // bare Tailwind utility name like `bg-white`/`text-gray-900` → `.bg-white` —
  // and its `{ }` body reuses the style-def body grammar (bg/fg/borderColor…).
  // The renderer scopes each rule under `.dark .idml-root`. Blocks accumulate
  // (shared across imports) so styles.idml can define them once for every page.
  private parseDarkBlock(): void {
    this.pos++; // consume 'dark'
    this.consume('LBRACE');
    const SPECIAL: Record<string, string> = { root: '', controls: 'input, select, textarea' };
    while (this.peek()?.type !== 'RBRACE') {
      const key = this.consume('IDENT').value as string;
      const style = this.parseStyleDefBody();
      const selector = key in SPECIAL ? SPECIAL[key] : `.${key}`;
      this.darkStyles.push({ selector, style });
    }
    this.consume('RBRACE');
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
      const defaultArgs: IdmlArg[] = [];
      if (this.peek()?.type === 'LPAREN') {
        this.consume('LPAREN');
        if (this.peek()?.type !== 'RPAREN') defaultArgs.push(...this.parseArgList());
        this.consume('RPAREN');
      }

      // Optional baked-in utility classes: Name:Type `tailwind classes`
      let className: string | undefined;
      let classSpan: SourceSpan | undefined;
      while (this.peek()?.type === 'CLASS_BLOCK') {
        const tok = this.consume('CLASS_BLOCK');
        const cls = tok.value as string;
        assertNoLayoutClasses(cls, `variant ${name}`);
        className = className ? `${className} ${cls}` : cls;
        // Track the FIRST class block's span as the variant's edit target.
        if (this.trackSource && !classSpan && tok.start != null && tok.end != null) {
          classSpan = { start: tok.start, end: tok.end };
        }
      }

      // The `{ cssProp: val }` body is optional — a styled variant may carry only
      // classes (the common case) and/or pre-set args.
      const style = this.peek()?.type === 'LBRACE' ? this.parseStyleDefBody() : {};

      this.styleRegistry.set(name, {
        baseType, defaultArgs, style, className,
        ...(this.trackSource ? { classFile: this.fileName, classSpan } : {}),
      });
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
    if (!t) throw new Error('[idml] Expected style value');

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

    throw new Error(`[idml] Unexpected token type ${t.type} as style value`);
  }

  parseItem(): ParsedItem {
    const nameTok = this.consume('IDENT');
    const rawName = nameTok.value as string;
    const nameSpan = this.spanOf(nameTok);

    const regEntry = this.styleRegistry.get(rawName);
    const name = regEntry ? regEntry.baseType : rawName;
    const baseStyle: Record<string, string> = regEntry ? { ...regEntry.style } : {};

    // Args are always required: Name(arg, ...) or Name()
    this.consume('LPAREN');
    const parsedArgs: IdmlArg[] = [];
    const argSpans: (SourceSpan | undefined)[] = [];
    if (this.peek()?.type !== 'RPAREN') parsedArgs.push(...this.parseArgList(this.trackSource ? argSpans : undefined));
    this.consume('RPAREN');

    // Lift any `{ ... }` children-block args out of the arg list; they become
    // part of this item's children (merged with the trailing `{ }` block below).
    const inlineChildren: ParsedItem[] = [];
    const valueArgs: IdmlArg[] = [];
    for (const a of parsedArgs) {
      if (a && typeof a === 'object' && Array.isArray((a as Record<string, unknown>).__idmlChildren)) {
        inlineChildren.push(...((a as { __idmlChildren: ParsedItem[] }).__idmlChildren));
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
        `[idml] "${rawName}" is missing its required [height,width,anchor] ` +
          `dimensions`
      );
    }
    this.consume('LBRACKET');
    const { value: height, span: heightSpan } = this.spanAround(() => this.parseDimension());
    this.consume('COMMA');
    const { value: width, span: widthSpan } = this.spanAround(() => this.parseDimension());
    this.consume('COMMA');
    const anchorTok = this.consume('IDENT');
    const anchor = anchorTok.value as string;
    const anchorSpan = this.spanOf(anchorTok);
    // Optional trailing sizing keyword:
    //   fit | fit-w | fit-h    -> natural size, capped at the declared % (which
    //                             still counts toward the parent's tiling sum)
    //   fill | fill-w | fill-h -> cross-axis stretch (align-self: stretch)
    //   hug                    -> fill the remaining MAIN-axis space, split
    //                             equally with sibling `hug`s (was `grow`)
    let fit: FitSpec | undefined;
    let fill: FillSpec | undefined;
    let hug: boolean | undefined;
    if (this.peek()?.type === 'COMMA') {
      this.consume('COMMA');
      const kw = this.consume('IDENT').value as string;
      if (kw === 'fit') fit = { w: true, h: true };
      else if (kw === 'fit-w') fit = { w: true, h: false };
      else if (kw === 'fit-h') fit = { w: false, h: true };
      else if (kw === 'fill') fill = { w: true, h: true };
      else if (kw === 'fill-w') fill = { w: true, h: false };
      else if (kw === 'fill-h') fill = { w: false, h: true };
      else if (kw === 'hug') hug = true;
      else
        throw new Error(
          `[idml] unknown sizing keyword "${kw}" for "${rawName}"; ` +
            `expected fit, fit-w, fit-h, fill, fill-w, fill-h, or hug`
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
    let classNameSpan: SourceSpan | undefined;
    const condClasses: { classes: string; ref: string; negate: boolean }[] = [];
    while (this.peek()?.type === 'CLASS_BLOCK') {
      const clsTok = this.peek();
      const cls = this.consume('CLASS_BLOCK').value as string;
      // Optional trailing condition `?@ref` / `?!@ref`: these classes apply only
      // when the ref is truthy / falsy. A CONDITIONAL block may use literal
      // classes — it expresses a state-driven visual (e.g. a pop-up's scale/
      // opacity), which belongs in the .idml, not a method.
      if (this.peek()?.type === 'QUESTION') {
        this.consume('QUESTION');
        let negate = false;
        if (this.peek()?.type === 'BANG') { this.consume('BANG'); negate = true; }
        const ref = this.consume('VALUE_REF').value as string;
        assertNoLayoutClasses(cls, 'a conditional class block');
        condClasses.push({ classes: cls, ref, negate });
        continue;
      }
      // Unconditional use-site block: only `@method` bindings (no literals).
      for (const tok of cls.split(/\s+/).filter(Boolean)) {
        if (!tok.startsWith('@')) {
          throw new Error(
            `[idml] literal class "${tok}" is not allowed at a use site; ` +
              `declare a styled variant (Name:BaseType) instead`
          );
        }
      }
      if (this.trackSource && !classNameSpan) classNameSpan = this.spanOf(clsTok);
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

    let src: ItemSrc | undefined;
    if (this.trackSource) {
      // The editable text span is the first *literal string* arg (not a @ref /
      // ~model / handler). argSpans aligns index-for-index with parsedArgs.
      let textSpan: SourceSpan | undefined;
      for (let k = 0; k < parsedArgs.length; k++) {
        const a = parsedArgs[k];
        if (typeof a === 'string' && !a.startsWith('\x00')) { textSpan = argSpans[k]; break; }
      }
      src = {
        file: this.fileName,
        name: nameSpan,
        text: textSpan,
        height: heightSpan,
        width: widthSpan,
        anchor: anchorSpan,
        className: classNameSpan,
        variant: regEntry ? rawName : undefined,
      };
    }

    return { name, args, height, width, anchor, children, style, className, classRefs, condClasses, fit, fill, hug, visibility, src };
  }

  private parseDimension(): DimValue {
    if (this.peek()?.type === 'IDENT' && this.peek()?.value === 'auto') {
      throw new Error(
        '[idml] the `auto` dimension is no longer supported; give an explicit ' +
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

  /** A literal dimension value inside a `@ref ? A : B`: a bare number → `%`.
   *  Dimensions are percentages of the parent — units (esp. `vw`) are rejected:
   *  vw is only for text sizing, never for placement or container sizing. */
  private parseDimLiteral(): string {
    const n = this.consume('NUMBER').value as number;
    const next = this.peek();
    if (next?.type === 'IDENT' && ['vw', 'vh', 'px', 'rem', 'em'].includes(next.value as string)) {
      throw new Error(
        `[idml] dimensions are percentages of the parent — the unit ` +
          `'${next.value}' is not allowed in a [height,width] field (write ` +
          `'${n}' for ${n}%). vw is only for text sizing, never for placement ` +
          `or container sizing.`
      );
    }
    return `${n}%`;
  }

  // `spansOut`, when given, receives the leading-token span of each arg (aligned
  // by index with the returned args) — used by source tracking to locate literal
  // text args. Children-block args recurse through parseArg with their own list,
  // so this never clobbers a nested item's spans.
  private parseArgList(spansOut?: (SourceSpan | undefined)[]): IdmlArg[] {
    const args: IdmlArg[] = [];
    const capture = () => {
      if (!spansOut) return;
      const lead = this.peek();
      spansOut.push(lead?.start != null && lead.end != null ? { start: lead.start, end: lead.end } : undefined);
    };
    capture();
    args.push(this.parseArg());
    while (this.peek()?.type === 'COMMA') {
      this.pos++;
      if (this.peek()?.type === 'RPAREN') break;
      capture();
      args.push(this.parseArg());
    }
    return args;
  }

  private parseArg(): IdmlArg {
    const t = this.peek();
    if (!t) throw new Error('[idml] Expected argument');
    if (t.type === 'STRING') { this.pos++; return t.value as string; }
    if (t.type === 'NUMBER') { this.pos++; return t.value as number; }
    // @method — reactive value binding (prop bound to the method's return value).
    if (t.type === 'VALUE_REF') { this.pos++; return `${VALUE_REF_PREFIX}${t.value}`; }
    // ~name — two-way model binding to a form-state cell.
    if (t.type === 'MODEL_REF') { this.pos++; return `${MODEL_REF_PREFIX}${t.value}`; }
    // ~@path — dynamic two-way model binding (key resolved at render from a ref).
    if (t.type === 'MODEL_DYN_REF') { this.pos++; return `${MODEL_DYN_REF_PREFIX}${t.value}`; }
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
      return { __idmlChildren: childItems };
    }
    throw new Error(`[idml] Unexpected token type ${t.type} as argument`);
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
  /** Direction of the enclosing Row/Col — a `Repeat` uses it to equal-fill its
   *  N items along that axis (each 1/N). Absent at the page root. */
  parentDirection?: 'row' | 'column';
  /** True when the enclosing container is content-flow (fits or scrolls its main
   *  axis) — a `Repeat` then content-sizes its items (they stack + scroll) rather
   *  than equal-filling. */
  parentContentFlow?: boolean;
  /** Source-tracking only: collects componentId → origin as components are built.
   *  Present iff the parse ran under parseIdmlWithSource. */
  origins?: Map<string, ComponentOrigin>;
  /** Source-tracking only: variant name → its class-text span (from the style
   *  registry), so a component's className origin can point at its variant. */
  variantClassSpans?: Map<string, { file: string; span: SourceSpan }>;
}

/** Build and record a ComponentOrigin for a freshly-built component. `synthetic`
 *  overrides kind for desugared components (Table/Select-options) that have no
 *  single authored span. Skips silently when not source-tracking. */
function recordOrigin(ctx: ConvertCtx, id: string, item: ParsedItem, synthetic = false): void {
  if (!ctx.origins) return;
  const s = item.src;
  const kind: ComponentOrigin['kind'] = synthetic ? 'synthetic' : ctx.expanding.size > 0 ? 'define' : 'direct';
  const origin: ComponentOrigin = {
    id,
    file: s?.file ?? '<entry>',
    kind,
    spans: {
      name: s?.name,
      text: s?.text,
      height: s?.height,
      width: s?.width,
      anchor: s?.anchor,
      className: s?.className,
    },
  };
  // If the component was styled through a variant, expose the variant's own
  // class span (the real edit target for its styling) — shared by all its uses.
  if (s?.variant) {
    const v = ctx.variantClassSpans?.get(s.variant);
    origin.variant = s.variant;
    if (v) { origin.classFile = v.file; origin.classSpan = v.span; }
  }
  ctx.origins.set(id, origin);
}

/**
 * Deep-copy a definition body item, replacing any arg that references a bound
 * parameter with that parameter's value. Parameters appear in the body as bare
 * identifiers (handler refs) or `@`/`~` refs whose name matches a param; the
 * bound value is whatever the caller passed in that position (a literal, another
 * ref, etc.), so values also thread through nested definition calls.
 */
function substituteParams(item: ParsedItem, bindings: Map<string, IdmlArg>): ParsedItem {
  if (bindings.size === 0) return item;
  const subArg = (a: IdmlArg): IdmlArg => {
    if (typeof a === 'string') {
      for (const prefix of [FN_REF_PREFIX, VALUE_REF_PREFIX, MODEL_REF_PREFIX, MODEL_DYN_REF_PREFIX]) {
        if (a.startsWith(prefix)) {
          const name = a.slice(prefix.length);
          return bindings.has(name) ? (bindings.get(name) as IdmlArg) : a;
        }
      }
      return a;
    }
    if (a && typeof a === 'object' && Array.isArray((a as { __idmlChildren?: ParsedItem[] }).__idmlChildren)) {
      return {
        __idmlChildren: (a as { __idmlChildren: ParsedItem[] }).__idmlChildren.map(c => substituteParams(c, bindings)),
      } as IdmlArg;
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

/** True when a node is taken out of the flex flow by an explicit
 *  `position: absolute|fixed` style prop (from an inline block or a variant),
 *  so it is neither tiled nor cross-axis-checked. */
function isAbsolute(style?: Record<string, string>): boolean {
  const p = style?.position;
  return p === 'absolute' || p === 'fixed';
}

function validateTiling(
  children: ParsedItem[],
  direction: 'row' | 'column',
  where: string,
  isOutOfFlow: (name: string) => boolean,
  containerFit?: FitSpec,
  containerGap?: boolean,
  containerScroll?: boolean
): void {
  // Out-of-flow children are positioned, not tiled: Overlay/Modal/out-of-flow
  // defs, plus anything explicitly `position: absolute|fixed` in its style (an
  // absolutely-positioned element leaves the flex flow, so it neither counts
  // toward the tiling sum nor must fill the cross axis — this is what lets an
  // anchored hover-flyout live inside a normal container).
  children = children.filter((c) => !isOutOfFlow(c.name) && !isAbsolute(c.style));
  if (children.length === 0) return;
  const main = direction === 'row' ? 'width' : 'height';
  const cross = direction === 'row' ? 'height' : 'width';
  const mainKey = direction === 'row' ? 'w' : 'h';
  const crossKey = direction === 'row' ? 'h' : 'w';

  // Cross axis: every child fills it (100%), unless it `fill`s (stretch to the
  // line), `fit`s the cross axis (natural size within its declared max), or the
  // dim is a runtime `@ref` (author-guaranteed).
  for (const c of children) {
    if (!c.fill?.[crossKey] && !c.fit?.[crossKey] && !isDimRef(c[cross]) && (c[cross] as number) !== 100) {
      throw new Error(
        `[idml] ${c.name} in ${where}: cross-axis ${cross} must be 100 ` +
          `(got ${c[cross]}); no vacant space is allowed`
      );
    }
  }

  // A runtime `@ref` main dim can't be summed statically — trust the author to
  // tile at runtime (e.g. sidebar + content widths that swap on collapse).
  if (children.some((c) => isDimRef(c[main]))) return;

  // Main axis — the exact-fill invariant. Every child either RESERVES a fixed
  // main-% (a plain dim, or a `fit` whose % is its capped max — it draws smaller
  // but the box is still reserved) or is a `hug` that claims the LEFTOVER, split
  // equally with sibling `hug`s. All declared space must add up to exactly 100%.
  // A `?@ref` visibility-gated child may or may not render, so it can't be
  // required to tile, and mutually-exclusive gated siblings (e.g. an Input XOR a
  // Textarea in one slot) must not double-count — exclude gated children from the
  // reserved sum. The author owns the runtime fill of a conditional slot.
  const tiled = children.filter((c) => !c.visibility);
  // All children conditional → the container is a conditional-content region;
  // whichever child shows fills it, so there's nothing to require statically.
  if (tiled.length === 0) return;
  const hugCount = tiled.filter((c) => c.hug).length;
  let reserved = 0;
  for (const c of tiled) if (!c.hug) reserved += c[main] as number;

  // Over-claiming the axis is ALWAYS a contradiction — e.g. two [100,100]
  // children can't each own 100% of the stacking axis.
  if (reserved > 100) {
    throw new Error(
      `[idml] children of ${where} over-claim ${main}: the fixed/fit dims ` +
        `reserve ${reserved}% (> 100%). Their declared ${main}s can't exceed 100%.`
    );
  }
  const leftover = 100 - reserved;

  if (hugCount > 0) {
    // `hug` fills the remaining space; there must BE remaining space to fill.
    if (leftover <= 0) {
      throw new Error(
        `[idml] ${where}: a \`hug\` child needs remaining space, but the ` +
          `fixed/fit ${main}s already fill 100%. Drop the hug or free up space.`
      );
    }
    return; // hug(s) absorb the leftover (and any gap) — exact fill guaranteed.
  }

  // No `hug` filler. A content-flow container — one that `fit`s the main axis
  // (content-sized) or SCROLLS it (overflow auto/scroll) — has no fixed main
  // size to fill: its children define/scroll its size, so under-fill and gaps
  // are absorbed. Only the over-claim check above applies to these.
  if (containerFit?.[mainKey] || containerScroll) return;

  // A definite-size container must be filled exactly.
  if (containerGap) {
    throw new Error(
      `[idml] ${where}: has a ${main}-axis gap but no \`hug\` child to absorb ` +
        `it — the children would overflow by the gap. Add a \`hug\` child/Spacer.`
    );
  }
  if (leftover !== 0) {
    throw new Error(
      `[idml] children of ${where} must fill ${main} exactly: the dims reserve ` +
        `${reserved}% (need 100%). Add a \`hug\` child/Spacer, or adjust the %s.`
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
  if (dir) {
    // A gap on the MAIN axis consumes space between children, so it must be
    // absorbed by a `hug` child. (Variant `{ gap }` is merged into item.style.)
    const s = item.style ?? {};
    const mainGap = !!s.gap || !!(dir === 'column' ? s.rowGap : s.columnGap);
    // A container that scrolls the MAIN axis is content-flow: children stack at
    // their natural size and it scrolls, so tiling-to-100 isn't required.
    const ov = (k: string) => s[k] === 'auto' || s[k] === 'scroll';
    const mainScroll = ov('overflow') || (dir === 'column' ? ov('overflowY') : ov('overflowX'));
    validateTiling(item.children, dir, `<${item.name}>`, isOutOfFlow, item.fit, mainGap, mainScroll);
  }
  for (const child of item.children) walkTiling(child, defs, isOutOfFlow);
}

// ==================== MODULARITY VALIDATION ====================

// Structural caps that keep authored trees shallow and narrow, forcing deep or
// wide UI to be broken into `define`s. Counted independently per page body and
// per define body (a define resets the budget); a define CALL is a leaf in the
// caller, but content passed to it as slot children still nests under the call.
const MAX_CHILDREN = 3;
const MAX_DEPTH = 4;

// Opaque leaves: their children are declarative config (a macro), not
// hand-authored layout, so each counts as a single child and its internals add
// no depth. `Table` (its `Column` list) and `Select` (its `Option` list) both
// qualify. (The registered widgets — Map/Timeline/etc. — are already used
// childless, so they're leaves without special-casing.)
const STRUCTURE_LEAF = new Set(['Table', 'Select']);

/**
 * Enforce the two modularity caps on one authored body (a page's items or a
 * definition's body): every container holds at most MAX_CHILDREN *flow* children
 * (out-of-flow Modal/Overlay layers don't count), and no item nests deeper than
 * MAX_DEPTH levels (top-level items are depth 1). Recursion stops at leaves
 * (Table) and does NOT expand definition calls — a call's slot children continue
 * the caller's depth, but a definition's own body is validated on its own.
 */
function validateModularity(
  items: ParsedItem[],
  where: string,
  isOutOfFlow: (name: string) => boolean,
  depth: number
): void {
  if (depth > MAX_DEPTH) {
    throw new Error(
      `[idml] ${where}: nesting exceeds the max depth of ${MAX_DEPTH} ` +
        `(items here are ${depth} levels deep). Extract a define to flatten it.`
    );
  }
  const flow = items.filter((i) => !isOutOfFlow(i.name));
  if (flow.length > MAX_CHILDREN) {
    throw new Error(
      `[idml] ${where}: ${flow.length} children exceeds the max of ` +
        `${MAX_CHILDREN} per container. Group some into a sub-container or ` +
        `extract a define.`
    );
  }
  for (const item of items) {
    if (STRUCTURE_LEAF.has(item.name)) continue; // leaf widget — don't recurse
    if (item.children.length > 0) {
      validateModularity(item.children, `${item.name} in ${where}`, isOutOfFlow, depth + 1);
    }
  }
}

/**
 * Enforce the "no extraneous HTML" rule: a react-only registered widget (any
 * component name that is neither an idml builtin nor an authored `define`) must
 * be sandboxed inside an `Embed` so idml — not the widget's own markup — owns
 * its bounds. `Embed` itself must carry definite dims (no `hug`) so the sandbox
 * has a fixed box to clip into. `known` is the set of builtin + define names;
 * styled-variant names never reach here (parseItem already rewrote them to their
 * base type). `underEmbed` tracks whether an Embed ancestor is in scope.
 */
function validateWidgetEnclosure(
  items: ParsedItem[],
  where: string,
  known: Set<string>,
  underEmbed: boolean
): void {
  for (const item of items) {
    const isEmbed = item.name === 'Embed';
    if (isEmbed && item.fit && (item.fit.w || item.fit.h)) {
      throw new Error(
        `[idml] Embed in ${where} cannot use hug — a sandbox needs definite ` +
          `[h,w] dims to bound its widget. Give it explicit height/width %.`
      );
    }
    if (!isEmbed && !known.has(item.name) && !underEmbed) {
      throw new Error(
        `[idml] "${item.name}" in ${where} is a React widget, not an idml ` +
          `builtin or define. Extraneous HTML/React can drive visual changes ` +
          `idml doesn't define, so it must be sandboxed: wrap it in ` +
          `Embed()[h,w,anchor] { ${item.name}(...) } so idml owns its bounds.`
      );
    }
    validateWidgetEnclosure(
      item.children ?? [],
      isEmbed ? `Embed in ${where}` : where,
      known,
      underEmbed || isEmbed
    );
  }
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
function fitStyles(hug: FitSpec): Record<string, string> {
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
 * Inline styles that make an element STRETCH to its flex line's cross size (the
 * inverse of hug): `align-self: stretch` overrides the container's anchor-derived
 * `align-items`, and `auto` on the filled axis lets the flex layout stretch the
 * box to the tallest/widest sibling (a fixed `fit-content`/`100%` would block
 * the stretch). Spread LAST so they override the renderer's `size` fill.
 */
function fillStyles(fill: FillSpec): Record<string, string> {
  const s: Record<string, string> = { alignSelf: 'stretch' };
  if (fill.h) s.height = 'auto';
  if (fill.w) s.width = 'auto';
  return s;
}

/**
 * Make a converted child FLEX-GROW to fill the remaining MAIN-axis space of its
 * (flex) parent: `flex: 1 1 0` grows it from a 0 basis, and dropping its
 * main-axis size lets flex own that dimension; `min-*: 0` lets an inner scroll
 * area shrink below its content. Called by the parent (which knows its
 * direction), so `grow` means "fill leftover height in a Col / width in a Row".
 */
function applyHug(node: LayoutDef, direction: 'row' | 'column'): void {
  node.idmlStyle = {
    ...(node.idmlStyle ?? {}),
    flexGrow: '1', flexShrink: '1', flexBasis: '0',
    ...(direction === 'column' ? { minHeight: '0' } : { minWidth: '0' }),
  };
  if (node.size) {
    if (direction === 'column') delete node.size.height;
    else delete node.size.width;
  }
}

/**
 * Cell-level hug styles for a CONTAINER (Row/Col/Form): the cell shrinks to its
 * packed children on the hugged axis, capped at its tile. No overflow/ellipsis
 * (that would clip the children) — truncation is a leaf-text concern only.
 */
function fitContainerStyles(hug: FitSpec): Record<string, string> {
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
const FIT_INVALID_ON = new Set(['Overlay', 'Modal', 'Children']);

/** Throw if `hug` is used where it has nothing to size (a portal/slot/table or
 *  a definition call). Containers (Row/Col/Form) and components are fine. */
function assertFittable(item: ParsedItem, _isDef: boolean): void {
  if (!item.fit) return;
  if (FIT_INVALID_ON.has(item.name)) {
    throw new Error(
      `[idml] "${item.name}" cannot use hug — nothing to content-size here. ` +
        `hug applies to components (e.g. Button/Text), layout containers ` +
        `(Row/Col/Form), and definition calls, not slots, tables, or ` +
        `out-of-flow layers.`
    );
  }
}

function mkItem(
  name: string,
  args: IdmlArg[],
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
  if (item.fit?.w) tableStyle.width = 'fit-content';
  const tableCol = mkItem(
    'Col', [],
    item.fit?.h ? 'auto' : item.height,
    item.fit?.w ? 'auto' : item.width,
    item.anchor, [headerRow, repeat], tableStyle
  );
  tableCol.className = item.className;
  // Propagate the table's fit spec to the synthetic Col so a content-height
  // (`fit-h`) or content-width (`fit-w`) table is detected as content-flow: its
  // body `Repeat` then STACKS its rows (natural height) instead of equal-filling
  // (`flex:1 1 0`), which would collapse to 0 inside the auto-height table and
  // spill the rows past the card. A definite-height table (no fit-h) still
  // equal-fills its rows to tile the reserved height.
  if (item.fit) tableCol.fit = item.fit;
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
  assertFittable(item, ctx.defs.has(item.name));
  const size = sizeOf(item);
  const idmlStyle = Object.keys(item.style).length ? item.style : undefined;
  const colAnchor = anchorToFlexProps(item.anchor, 'column');
  // Out-of-flow nodes (Modal / out-of-flow defs) render with `display:contents`
  // so their wrapper cell occupies NO flow space (their real content is a portal
  // or fixed layer). This means authors don't have to fake a 0 height for them.
  // (Overlay has its own branch below; its layer is already position:fixed.)
  const outOfFlow = ctx.isOutOfFlow(item.name);
  const cellStyle = outOfFlow ? { ...(idmlStyle ?? {}), display: 'contents' } : idmlStyle;

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
      // The slot flows in a column; a `grow` slot child fills its leftover height.
      children: slot.map(child => {
        const n = convertItem(child, childCtx);
        if (child.hug) applyHug(n, 'column');
        return n;
      }),
      idmlStyle,
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
    const bindings = new Map<string, IdmlArg>();
    params.forEach((p, i) => bindings.set(p, item.args[i] ?? ''));
    const body = bindings.size ? defBody.map(t => substituteParams(t, bindings)) : defBody;

    const innerCtx: ConvertCtx = {
      ...ctx,
      slotChildren: item.children,
      expanding: new Set(ctx.expanding).add(item.name),
    };
    // `hug` on a def CALL content-sizes the expansion wrapper (a def call can't
    // otherwise shrink — its [h,w] tile would fill the cell). Only `fit-content`
    // is applied (NOT the component `maxHeight/maxWidth:100%` cap + ellipsis) so
    // a section grows to its full content and the parent scrolls if needed —
    // capping to the tile would clip/spill a taller section. Wins over `size` in
    // the renderer, so e.g. a hug-h nav row / sidebar section is content-height.
    // `fill-h/-w` on a def CALL stretches the expansion wrapper to its flex
    // line's cross size (align-self: stretch + auto), so paired card sections in
    // a Row become equal height. It's the inverse of hug — mutually exclusive.
    const defHug: Record<string, string> = {};
    if (item.fit?.h) defHug.height = 'fit-content';
    if (item.fit?.w) defHug.width = 'fit-content';
    if (item.fill) Object.assign(defHug, fillStyles(item.fill));
    const defStyle = item.fit || item.fill ? { ...(cellStyle ?? {}), ...defHug } : cellStyle;
    const bodyChildren = body.map(t => convertItem(t, innerCtx));
    // A hug-h def call content-sizes its wrapper (column main axis), so — like a
    // hug-h container — its body children must PACK by content: drop their
    // main-axis height, or two full-height sections (e.g. a nav block + footer)
    // would each fill the wrapper and overlap instead of stacking.
    if (item.fit?.h) {
      for (const ch of bodyChildren) if (ch.size) delete ch.size.height;
    }
    return {
      type: 'flex',
      direction: 'column',
      ...colAnchor,
      size,
      children: bodyChildren,
      idmlStyle: defStyle,
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
      if (child.fit?.w) {
        hugStyle.width = 'fit-content';
        if (layout.size?.width) hugStyle.maxWidth = layout.size.width;
      }
      if (child.fit?.h) {
        hugStyle.height = 'fit-content';
        if (layout.size?.height) hugStyle.maxHeight = layout.size.height;
      }
      return {
        ...layout,
        idmlStyle: {
          ...(layout.idmlStyle ?? {}),
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
      idmlStyle: {
        position: 'fixed',
        top: '0',
        left: '0',
        right: '0',
        bottom: '0',
        pointerEvents: 'none',
        outline: 'none',
        zIndex: '50',
        ...(idmlStyle ?? {}),
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
    // Content-flow if this container fits or scrolls its MAIN axis — a nested
    // Repeat then content-sizes (stacks + scrolls) instead of equal-filling.
    const st = item.style ?? {};
    const isScroll =
      st.overflow === 'auto' || st.overflow === 'scroll' ||
      (direction === 'column' ? (st.overflowY === 'auto' || st.overflowY === 'scroll')
                              : (st.overflowX === 'auto' || st.overflowX === 'scroll'));
    const contentFlow = !!(direction === 'column' ? item.fit?.h : item.fit?.w) || isScroll;
    const childCtx: ConvertCtx = { ...ctx, parentDirection: direction, parentContentFlow: contentFlow };
    const children = item.children.map(child => convertItem(child, childCtx));
    // Content-flow: a container hugged on its MAIN axis lays its children out by
    // content (they pack) instead of tiling. The container keeps its own size;
    // each child's main-axis size is dropped so it shrinks to content, and the
    // anchor's justify-content packs them, leaving the rest as explicit empty
    // space. (Cross-axis hug, if any, just content-sizes the cell itself.)
    // A container hugged OR filled on its MAIN axis packs its children by
    // content (drop each child's main-axis size so it shrinks to content and the
    // anchor's justify-content packs them). Hug then content-sizes the container
    // itself; fill instead keeps the container's tile size (so it FILLS the
    // parent) and stretches it to the flex line (align-self: stretch) — use fill
    // to make a card fill a stretched wrapper while its fields still pack at top.
    const mainFit = direction === 'column' ? item.fit?.h : item.fit?.w;
    const mainFill = direction === 'column' ? item.fill?.h : item.fill?.w;
    if (mainFit || mainFill) {
      for (const ch of children) {
        if (!ch.size) continue;
        if (direction === 'column') delete ch.size.height;
        else delete ch.size.width;
      }
    }
    // A `grow` child flex-grows to fill the leftover main-axis space.
    item.children.forEach((pc, i) => { if (pc.hug) applyHug(children[i], direction); });
    const crossFit = direction === 'column' ? item.fit?.w : item.fit?.h;
    let containerStyle = crossFit
      ? { ...(idmlStyle ?? {}), ...fitContainerStyles({ w: direction === 'column', h: direction === 'row' }) }
      : idmlStyle;
    if (item.fill) containerStyle = { ...(containerStyle ?? {}), alignSelf: 'stretch' };
    return {
      type: 'flex',
      direction,
      justifyContent,
      alignItems,
      size,
      children,
      idmlStyle: containerStyle,
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
    recordOrigin(ctx, id, item);
    return { type: 'flex', direction: 'column', ...colAnchor, size, children: [], componentId: id };
  }

  // Component (builtin / registered / custom). Children stay as layout nodes on
  // the bound cell; the LayoutRenderer threads them into the component as its
  // slot so containers (Card, Table, imported components) render their content.
  // slotChildren is passed through so a `Children` marker nested inside a
  // definition's component still resolves.
  const id = genId(item.name.toLowerCase());
  const def = buildComponentDef(item, id);
  // A `Repeat` in a definite (non-content-flow) container equal-fills its N items
  // along the parent's main axis — pass the direction so the builtin lays the
  // items out flex:1 each. In a content-flow (fit/scroll) container it's left to
  // content-size (items stack + scroll).
  if (item.name === 'Repeat' && ctx.parentDirection && !ctx.parentContentFlow) {
    def.props = { ...def.props, fillDirection: ctx.parentDirection };
  }
  ctx.components.push(def);
  recordOrigin(ctx, id, item);
  const children = item.children.map(child => convertItem(child, ctx));
  // A hugged component shrinks to its content; make its CELL content-width/height
  // too. Otherwise the cell keeps the dim's `width:100%`, which collapses to 0
  // inside a fit-content parent (e.g. the feedback launcher's hover label) and
  // is what makes a hug pill content-sized within a definite-width column.
  const hugCell: Record<string, string> = {};
  if (item.fit?.w) {
    hugCell.width = 'fit-content';
    if (typeof item.width === 'number') hugCell.maxWidth = `${item.width}%`;
  }
  if (item.fit?.h) {
    hugCell.height = 'fit-content';
    if (typeof item.height === 'number') hugCell.maxHeight = `${item.height}%`;
  }
  const cellIdml = outOfFlow
    ? { ...(cellStyle ?? {}), ...hugCell }
    : Object.keys(hugCell).length
      ? hugCell
      : undefined;
  return {
    type: 'flex', direction: 'column', ...colAnchor, size, children, componentId: id,
    ...(cellIdml ? { idmlStyle: cellIdml } : {}),
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
  // fit styles win over anchor defaults and variant styles so the component
  // actually shrinks to content (overriding the renderer's default fill).
  const fit = item.fit ? fitStyles(item.fit) : {};
  const merged = { ...anchorStyle, ...item.style, ...fit };
  const idmlStyle = Object.keys(merged).length ? merged : undefined;

  // Classify call args. `@x` -> reactive value binding; a bare identifier -> a
  // handler (onClick); a "/..." string -> a route href; everything else (strings,
  // numbers, booleans, null) is a positional literal.
  const valueRefs: string[] = [];
  const modelRefs: string[] = [];
  const dynModelRefs: string[] = [];
  const handlerRefs: string[] = [];
  const literals: IdmlArg[] = [];
  for (const a of item.args) {
    if (typeof a === 'string' && a.startsWith(VALUE_REF_PREFIX)) valueRefs.push(a.slice(VALUE_REF_PREFIX.length));
    // Check the dynamic-model prefix before the plain-model one — both are model
    // refs but the dynamic one carries a distinct (longer) prefix.
    else if (typeof a === 'string' && a.startsWith(MODEL_DYN_REF_PREFIX)) dynModelRefs.push(a.slice(MODEL_DYN_REF_PREFIX.length));
    else if (typeof a === 'string' && a.startsWith(MODEL_REF_PREFIX)) modelRefs.push(a.slice(MODEL_REF_PREFIX.length));
    else if (typeof a === 'string' && a.startsWith(FN_REF_PREFIX)) handlerRefs.push(a.slice(FN_REF_PREFIX.length));
    else literals.push(a);
  }

  // The prop a leading `@value` / `~model` binds to, per component. Bound props are
  // applied after literal props in the renderer, so they win when both are present.
  const primaryProp = PRIMARY_PROP[item.name] ?? 'value';
  // A Select's selected value is the two-way `~model`; a `@value` ref on a Select
  // instead binds its `options` (a method returning `[{value,label}]`), so option
  // lists can be data-driven — `Select(~model, @optionsMethod){}`. The Select
  // builtin already renders an `options` array, so this needs no renderer change.
  const valueProp = item.name === 'Select' ? 'options' : primaryProp;
  // A bare-ident handler on a form control fires on CHANGE (not click); the
  // renderer composes it with the `~model` write so both run. Lets a select do
  // `Select(~model, @optionsMethod, onPick)` — onPick(values,{event}) sees the
  // new value via `event.target.value`. A single-line `Input` instead fires the
  // handler on ENTER (submit-on-enter, e.g. a chat box), via the builtin's
  // onEnter→keydown wiring. Everything else gets `onClick`.
  const CHANGE_INPUTS = new Set(['Textarea', 'Select', 'Checkbox', 'Radio']);
  const handlerProp = item.name === 'Input' ? 'onEnter' : CHANGE_INPUTS.has(item.name) ? 'onChange' : 'onClick';
  const bindings: DataBindingDef[] = [
    ...valueRefs.map(methodId => ({ prop: valueProp, methodId, kind: 'value' as const })),
    ...modelRefs.map(methodId => ({ prop: primaryProp, methodId, kind: 'model' as const })),
    // `~@path` — same two-way model wiring, but `methodId` is a value-ref path whose
    // resolved value is the form-state KEY (see useBoundProps' dynamicKey branch).
    ...dynModelRefs.map(methodId => ({ prop: primaryProp, methodId, kind: 'model' as const, dynamicKey: true })),
    ...handlerRefs.map(methodId => ({ prop: handlerProp, methodId })),
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
      return withBindings({ id, type: 'Text', props: { text: String(first ?? '') }, idmlStyle });

    case 'Heading':
      return withBindings({
        id,
        type: 'Heading',
        props: { text: String(first ?? ''), level: typeof second === 'number' ? second : 1 },
        idmlStyle,
      });

    case 'Button': {
      // For a Button, a "/..." literal is a route href; the first non-route
      // literal is the label.
      const route = literals.find(a => typeof a === 'string' && a.startsWith('/')) as string | undefined;
      const label = literals.find(a => typeof a === 'string' && !a.startsWith('/'));
      const props: Record<string, unknown> = { text: String(label ?? '') };
      if (route) props.href = route;
      return withBindings({ id, type: 'Button', props, idmlStyle });
    }

    // A navigable link: arg0 is the href — a literal OR a `@value` ref (so a
    // data-driven list can `Link(@item.route)`, which a plain Button can't do
    // since its route must be a literal). Renders as a Button with `href` set
    // (the Button builtin renders next/link when href is present); the label /
    // icon are children. PRIMARY_PROP.Link = 'href' routes the value ref.
    case 'Link': {
      const props: Record<string, unknown> = {};
      if (typeof first === 'string') props.href = first;
      return withBindings({ id, type: 'Button', props, idmlStyle });
    }

    case 'Image':
      return withBindings({ id, type: 'Image', props: { src: String(first ?? ''), alt: String(second ?? '') }, idmlStyle });

    case 'Label':
      return withBindings({ id, type: 'Label', props: { text: String(first ?? '') }, idmlStyle });

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
      return withBindings({ id, type: 'Icon', props, idmlStyle });
    }

    case 'Option': {
      // `Option("Admin")` → value & label both "Admin"; `Option("admin", "Administrator")`
      // → value "admin", label "Administrator".
      const value = first ?? '';
      const label = second ?? first ?? '';
      return withBindings({ id, type: 'Option', props: { value, label }, idmlStyle });
    }

    case 'Input':
    case 'Textarea':
      // `Input(~model, "Placeholder text")` — the `~model` binds the value; the
      // first string literal is the placeholder (its text is content → .idml).
      return withBindings({
        id,
        type: item.name,
        props: first != null ? { placeholder: String(first) } : {},
        idmlStyle,
      });

    default:
      return withBindings({
        id,
        type: item.name,
        props: Object.fromEntries(literals.map((v, i) => [`arg${i}`, v])),
        idmlStyle,
      });
  }
}

// The prop that a leading `@value` reference binds to, per component type.
const PRIMARY_PROP: Record<string, string> = {
  Text: 'text',
  Heading: 'text',
  Button: 'text',
  Link: 'href',
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
   * Called when an `import "./file.idml"` line is encountered.
   * Should return the raw source of the imported file.
   */
  resolve?: (path: string) => string;
  /**
   * Name of the entry source file (e.g. `"users-page.idml"`). Recorded on the
   * origin map (source-tracking path only) so write-back knows which file a
   * component's spans belong to. Imported files carry their own import path.
   */
  fileName?: string;
}

/** Result of a source-tracking parse: the config plus, keyed by component id, the
 *  file + spans that produced each component (for a visual editor's write-back). */
export interface ParseWithSourceResult {
  config: UIConfig;
  origins: Map<string, ComponentOrigin>;
}

/**
 * Like {@link parseIdml}, but also returns an origin map linking each produced
 * component id back to the exact source file + character spans it came from.
 * Used by the visual editor to map a selection/edit to a surgical file patch.
 * Slightly more work than parseIdml (span capture); use parseIdml when you only
 * need the config.
 */
export function parseIdmlWithSource(source: string, options?: ParseOptions): ParseWithSourceResult {
  return parseIdmlCore(source, options, true) as ParseWithSourceResult;
}

export function parseIdml(source: string, options?: ParseOptions): UIConfig {
  return (parseIdmlCore(source, options, false) as { config: UIConfig }).config;
}

function parseIdmlCore(
  source: string,
  options: ParseOptions | undefined,
  trackSource: boolean
): { config: UIConfig; origins?: Map<string, ComponentOrigin> } {
  _idCounter = 0;
  const parser = new IdmlParser(tokenize(source), options?.fileName ?? '<entry>', trackSource);
  const parsedPages = parser.parseFile(options?.resolve);

  // Total-tiling validation: every page (a column root) and every definition
  // body (also a column) must tile to 100%, as must every nested Row/Col/Form.
  const isOutOfFlow = makeOutOfFlowPredicate(parser.defRegistry);
  // A widget is "known" (allowed unsandboxed) if it's an idml builtin or an
  // authored define; anything else is a react-only component needing an Embed.
  const knownNames = new Set([...BUILTIN_NAMES, ...parser.defRegistry.keys()]);
  for (const { route, items } of parsedPages) {
    validateTiling(items, 'column', `page ${route}`, isOutOfFlow);
    items.forEach((it) => walkTiling(it, parser.defRegistry, isOutOfFlow));
    validateModularity(items, `page ${route}`, isOutOfFlow, 1);
    validateWidgetEnclosure(items, `page ${route}`, knownNames, false);
  }
  for (const [name, body] of parser.defRegistry) {
    validateTiling(body, 'column', `define ${name}`, isOutOfFlow);
    body.forEach((it) => walkTiling(it, parser.defRegistry, isOutOfFlow));
    validateModularity(body, `define ${name}`, isOutOfFlow, 1);
    validateWidgetEnclosure(body, `define ${name}`, knownNames, false);
  }

  // Source-tracking: a single origin map across all pages, plus a lookup of each
  // styled variant's class-text span (so a component's className origin can point
  // at its variant's declaration — the real edit target for shared styling).
  const origins = trackSource ? new Map<string, ComponentOrigin>() : undefined;
  let variantClassSpans: Map<string, { file: string; span: SourceSpan }> | undefined;
  if (trackSource) {
    variantClassSpans = new Map();
    for (const [name, entry] of parser.styleRegistry) {
      if (entry.classFile && entry.classSpan) {
        variantClassSpans.set(name, { file: entry.classFile, span: entry.classSpan });
      }
    }
  }

  const pages = parsedPages.map(({ route, scroll, items }) => {
    const components: ComponentDef[] = [];
    const ctx: ConvertCtx = {
      components,
      defs: parser.defRegistry,
      defParams: parser.defParamRegistry,
      expanding: new Set(),
      isOutOfFlow,
      origins,
      variantClassSpans,
    };
    const layoutChildren = items.map(item => convertItem(item, ctx));
    const rootLayout: FlexDef = {
      type: 'flex',
      direction: 'column',
      size: { width: '100%', height: '100%' },
      children: layoutChildren,
      ...(scroll ? { idmlStyle: { overflowY: 'auto' } } : {}),
    };
    return { route, layout: rootLayout, components };
  });

  const config: UIConfig = { version: '1', tokens: DEFAULT_TOKENS, pages };
  if (parser.darkStyles.length > 0) config.darkStyles = parser.darkStyles;
  return { config, origins };
}
