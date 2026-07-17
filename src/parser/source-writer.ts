// Surgical, source-preserving write-back for the visual editor. We NEVER
// regenerate a .idml file from the parsed config (that would flatten defines /
// variants / imports / comments). Instead every edit is a text-span replacement
// planned from the origin map (parseIdmlWithSource), applied right-to-left so
// earlier offsets stay valid. Two class-edit modes are supported:
//   - 'all'   : edit the styled variant in place → changes every component using it
//   - 'clone' : leave the variant untouched, synthesise a new variant with the
//               edited classes and repoint ONLY this component at it (idml forbids
//               literal classes at a use site, so "local" edits must clone).

import type { ParseWithSourceResult, ComponentOrigin, SourceSpan } from './idml-parser';

/** A single replacement of `[start,end)` in `file` with `text`. An insertion is
 *  a zero-width edit (start === end). */
export interface SpanEdit {
  file: string;
  start: number;
  end: number;
  text: string;
}

/** A property the editor can write back. */
export type EditableProp = 'text' | 'height' | 'width' | 'anchor' | 'className';

export interface EditRequest {
  componentId: string;
  prop: EditableProp;
  value: string;
  /** className only: 'all' edits the shared variant; 'clone' makes a local copy.
   *  Ignored for other props. Defaults to 'all'. */
  mode?: 'all' | 'clone';
}

export interface EditPlan {
  edits: SpanEdit[];
  /** What kind of target the edit lands on — drives the editor's confirm UI. */
  target: 'direct' | 'define' | 'variant' | 'variant-clone';
  /** How many rendered components this edit changes (1 for direct/clone, N for a
   *  shared variant/define edit). */
  affects: number;
  /** For a clone, the generated variant name now used by this component. */
  newVariantName?: string;
}

/** Apply span edits to a set of source files. `sources` maps file → text; returns
 *  a new map with the edits applied. Throws on overlapping edits within a file. */
export function applyEdits(sources: Record<string, string>, edits: SpanEdit[]): Record<string, string> {
  const byFile = new Map<string, SpanEdit[]>();
  for (const e of edits) {
    if (!(e.file in sources)) throw new Error(`[idml] applyEdits: unknown file "${e.file}"`);
    let list = byFile.get(e.file);
    if (!list) { list = []; byFile.set(e.file, list); }
    list.push(e);
  }
  const out: Record<string, string> = { ...sources };
  for (const [file, fileEdits] of byFile) {
    // Apply right-to-left so each splice leaves earlier offsets untouched.
    const sorted = [...fileEdits].sort((a, b) => b.start - a.start);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].end > sorted[i - 1].start) {
        throw new Error(`[idml] applyEdits: overlapping edits in "${file}"`);
      }
    }
    let text = out[file];
    for (const e of sorted) text = text.slice(0, e.start) + e.text + text.slice(e.end);
    out[file] = text;
  }
  return out;
}

const DIM_PROPS = new Set<EditableProp>(['height', 'width', 'anchor']);

/** Pick an unused variant name derived from `base` (e.g. Title → Title2, Title3). */
function freshVariantName(base: string, existing: Set<string>): string {
  for (let n = 2; ; n++) {
    const candidate = `${base}${n}`;
    if (!existing.has(candidate)) return candidate;
  }
}

function spanEdit(file: string, span: SourceSpan, text: string): SpanEdit {
  return { file, start: span.start, end: span.end, text };
}

/**
 * Plan the source edits for one editor change. Pure: it reads the parse result's
 * origin/variant maps and returns the SpanEdits to feed to applyEdits — it does
 * NOT read or mutate source text (except that a clone's inserted variant text is
 * synthesised here). Throws with a clear message if the edit can't be located.
 */
export function planEdit(parse: ParseWithSourceResult, req: EditRequest): EditPlan {
  const origin = parse.origins.get(req.componentId);
  if (!origin) throw new Error(`[idml] planEdit: no origin for component "${req.componentId}"`);

  if (req.prop === 'text' || DIM_PROPS.has(req.prop)) {
    const span = origin.spans[req.prop];
    if (!span) {
      throw new Error(
        `[idml] planEdit: component "${req.componentId}" has no editable ${req.prop} ` +
          `(it may be data-bound or generated rather than a literal)`
      );
    }
    // A direct item's span is unique; a define-body span is shared by every call.
    const target = origin.kind === 'define' ? 'define' : 'direct';
    const affects = origin.kind === 'define' ? countDefineSiblings(parse, origin) : 1;
    return { edits: [spanEdit(origin.file, span, req.value)], target, affects };
  }

  // className
  const variant = origin.variant ? parse.variants.get(origin.variant) : undefined;

  if (variant && variant.classSpan) {
    if (req.mode === 'clone') {
      if (variant.declEnd == null) {
        throw new Error(`[idml] planEdit: cannot locate variant "${variant.name}" to clone`);
      }
      if (!origin.spans.name) {
        throw new Error(`[idml] planEdit: cannot locate use site of "${req.componentId}" to repoint`);
      }
      const newName = freshVariantName(variant.name, new Set(parse.variants.keys()));
      const insert: SpanEdit = {
        file: variant.file,
        start: variant.declEnd,
        end: variant.declEnd,
        text: `\n${newName}:${variant.baseType} \`${req.value}\``,
      };
      const repoint = spanEdit(origin.file, origin.spans.name, newName);
      return { edits: [insert, repoint], target: 'variant-clone', affects: 1, newVariantName: newName };
    }
    // Edit the variant in place — affects every component that uses it.
    return {
      edits: [spanEdit(variant.file, variant.classSpan, req.value)],
      target: 'variant',
      affects: variant.usageCount,
    };
  }

  // No variant: a use-site class block (only exists for @-ref / conditional cases).
  if (origin.spans.className) {
    return { edits: [spanEdit(origin.file, origin.spans.className, req.value)], target: 'direct', affects: 1 };
  }

  throw new Error(
    `[idml] planEdit: component "${req.componentId}" has no editable className ` +
      `(no styled variant and no use-site class block)`
  );
}

/** How many components share a define-body origin's span (i.e. use the same
 *  authored bytes). Used to report the blast radius of a shared text/dim edit. */
function countDefineSiblings(parse: ParseWithSourceResult, origin: ComponentOrigin): number {
  const key = (o: ComponentOrigin) =>
    o.file + ':' + (o.spans.name ? `${o.spans.name.start}-${o.spans.name.end}` : '?');
  const target = key(origin);
  let n = 0;
  for (const o of parse.origins.values()) if (key(o) === target) n++;
  return n || 1;
}
