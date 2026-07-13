import { describe, it, expect } from 'vitest';
import { parseIdml } from '../../src/parser/idml-parser';

const page = (body: string) => `./home\n${body}\n`;

describe('idml parser — modularity limits', () => {
  it('allows up to 3 children per container', () => {
    expect(() =>
      parseIdml(
        page(`Col()[100,100,top-left] {
  Text("a")[33,100,top-left]{}
  Text("b")[33,100,top-left]{}
  Text("c")[34,100,top-left]{}
}`)
      )
    ).not.toThrow();
  });

  it('rejects a 4th child in a container', () => {
    expect(() =>
      parseIdml(
        page(`Col()[100,100,top-left] {
  Text("a")[25,100,top-left]{}
  Text("b")[25,100,top-left]{}
  Text("c")[25,100,top-left]{}
  Text("d")[25,100,top-left]{}
}`)
      )
    ).toThrow(/exceeds the max of 3/);
  });

  it('rejects nesting deeper than 4 levels', () => {
    expect(() =>
      parseIdml(
        page(`Col()[100,100,top-left] {
  Col()[100,100,top-left] {
    Col()[100,100,top-left] {
      Col()[100,100,top-left] {
        Text("too deep")[100,100,top-left]{}
      }
    }
  }
}`)
      )
    ).toThrow(/max depth of 4/);
  });

  it('a define resets the depth budget (extracting flattens the tree)', () => {
    // The same 5-level tree passes once the inner two levels are a define.
    expect(() =>
      parseIdml(`define Inner() {
  Col()[100,100,top-left] {
    Text("ok")[100,100,top-left]{}
  }
}
./home
Col()[100,100,top-left] {
  Col()[100,100,top-left] {
    Inner()[100,100,top-left]{}
  }
}`)
    ).not.toThrow();
  });

  it('Table and Select are exempt leaves (columns/options do not count)', () => {
    expect(() =>
      parseIdml(
        page(`Table(@rows)[100,100,top-left,fit-h] {
  Column("A")[10,25,top-left]{ Text(@item.a)[100,100,top-left]{} }
  Column("B")[10,25,top-left]{ Text(@item.b)[100,100,top-left]{} }
  Column("C")[10,25,top-left]{ Text(@item.c)[100,100,top-left]{} }
  Column("D")[10,25,top-left]{ Text(@item.d)[100,100,top-left]{} }
}`)
      )
    ).not.toThrow();
  });
});

describe('idml parser — Link component', () => {
  it('a literal href renders as a Button with href set', () => {
    const config = parseIdml(page(`Link("/home")[100,100,top-left]{}`));
    const comp = config.pages[0].components[0];
    expect(comp.type).toBe('Button');
    expect((comp.props as { href?: string }).href).toBe('/home');
  });

  it('a @value href binds to the href prop (data-driven links)', () => {
    const config = parseIdml(page(`Link(@item.route)[100,100,top-left]{}`));
    const comp = config.pages[0].components[0];
    expect(comp.bindings).toEqual([{ prop: 'href', methodId: 'item.route', kind: 'value' }]);
  });
});
