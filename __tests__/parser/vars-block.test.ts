import { describe, it, expect } from 'vitest';
import { parseIdml } from '../../src/parser/idml-parser';

const page = `
./p
Col()[100,100,top-left] {
Text("x")[100,100,top-left]{}
}
`;

describe('vars { } — the DSL-declared :root tokens', () => {
  it('collects custom properties from a vars block', () => {
    const cfg = parseIdml(`
vars {
  --idml-radius: 0px
  --idml-border: 1px
  --idml-control: 13px
}
${page}`);
    expect(cfg.rootVars).toEqual({
      '--idml-radius': '0px',
      '--idml-border': '1px',
      '--idml-control': '13px',
    });
  });

  it('omits rootVars entirely when no vars block is declared', () => {
    expect(parseIdml(page).rootVars).toBeUndefined();
  });

  it('rejects a plain CSS property in a vars block', () => {
    expect(() =>
      parseIdml(`
vars {
  borderWidth: 1px
}
${page}`)
    ).toThrow(/not a CSS custom property/);
  });

  it('reads a custom property declared in an imported file', () => {
    const cfg = parseIdml(`
import Thing from "./tokens.idml"
${page}`, {
      resolve: () => `
vars {
  --idml-radius: 4px
}
Thing:Col
`,
    });
    expect(cfg.rootVars).toEqual({ '--idml-radius': '4px' });
  });
});
