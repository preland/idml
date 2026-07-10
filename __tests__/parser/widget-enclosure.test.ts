import { describe, it, expect } from 'vitest';
import { parseIdml } from '../../src/parser/idml-parser';

// Rule 2: a react-only registered widget (a component name that is neither an
// idml builtin nor an authored define) must be sandboxed in an `Embed` so idml
// — not the widget's own markup — owns its bounds.
describe('idml parser — react widgets must be sandboxed in Embed', () => {
  it('rejects a bare registered widget in a page body', () => {
    expect(() => parseIdml(`\n./p\nMyWidget(@data)[100,100,top-left]{}\n`))
      .toThrow(/React widget[\s\S]*Embed/);
  });

  it('rejects a bare widget nested inside a define', () => {
    expect(() => parseIdml(
      `\ndefine Card() {\nMyWidget(@data)[100,100,top-left]{}\n}\n./p\nCard()[100,100,top-left]{}\n`
    )).toThrow(/React widget[\s\S]*Embed/);
  });

  it('accepts a widget wrapped in Embed', () => {
    expect(() => parseIdml(
      `\n./p\nEmbed()[100,100,top-left]{\nMyWidget(@data)[100,100,top-left]{}\n}\n`
    )).not.toThrow();
  });

  it('accepts a widget nested deeper under an Embed ancestor', () => {
    expect(() => parseIdml(
      `\n./p\nEmbed()[100,100,top-left]{\nCol()[100,100,top-left]{\nMyWidget(@d)[100,100,top-left]{}\n}\n}\n`
    )).not.toThrow();
  });

  it('does not require Embed for builtins or Icon', () => {
    expect(() => parseIdml(
      `\n./p\nCol()[100,100,top-left]{\nIcon("Star", 1, "red")[100,100,top-left]{}\n}\n`
    )).not.toThrow();
  });

  it('rejects hug on an Embed (a sandbox needs definite dims)', () => {
    expect(() => parseIdml(
      `\n./p\nEmbed()[100,100,top-left,hug-h]{\nMyWidget(@d)[100,100,top-left]{}\n}\n`
    )).toThrow(/Embed[\s\S]*hug/);
  });

  it('accepts an Embed variant (base type Embed) hosting a widget', () => {
    expect(() => parseIdml(
      `\nBox:Embed { height: 2rem }\n./p\nBox()[100,100,top-left]{\nMyWidget(@d)[100,100,top-left]{}\n}\n`
    )).not.toThrow();
  });
});
