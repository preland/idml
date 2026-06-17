import { describe, it, expect } from 'vitest';
import { parseIsdw } from '../../src/parser/isdw-parser';
import type { LayoutDef, ComponentDef } from '../../src/types';

/** Find the first component of a given type in a page's components array. */
function findComponent(components: ComponentDef[], type: string): ComponentDef | undefined {
  return components.find((c) => c.type === type);
}

/** Find the layout node bound to a given componentId (depth-first). */
function findNodeByComponentId(layout: LayoutDef, componentId: string): LayoutDef | undefined {
  if (layout.componentId === componentId) return layout;
  for (const child of layout.children) {
    const found = findNodeByComponentId(child, componentId);
    if (found) return found;
  }
  return undefined;
}

describe('isdw parser — children threading', () => {
  it('preserves children of a custom container component (not just Row/Col)', () => {
    const config = parseIsdw(`
      ./home
      Card()[100,100,top-left] {
        Text("Hello")[50,100,top-left]{}
      }
    `);

    const page = config.pages[0];
    const card = findComponent(page.components, 'Card');
    const text = findComponent(page.components, 'Text');

    expect(card).toBeDefined();
    expect(text).toBeDefined();
    expect(text!.props?.text).toBe('Hello');

    // The Card's bound layout node should carry the Text as a layout child.
    const cardNode = findNodeByComponentId(page.layout, card!.id);
    expect(cardNode).toBeDefined();
    expect(cardNode!.children).toHaveLength(1);
    expect(cardNode!.children[0].componentId).toBe(text!.id);
  });

  it('lifts a `{ ... }` argument block into the component\'s children', () => {
    const config = parseIsdw(`
      ./home
      Button("Save", { Image("/icon.png")[100,100,center]{} })[20,10,top-left]{}
    `);

    const page = config.pages[0];
    const button = findComponent(page.components, 'Button');
    const image = findComponent(page.components, 'Image');

    expect(button).toBeDefined();
    expect(button!.props?.text).toBe('Save');
    expect(image).toBeDefined();
    expect(image!.props?.src).toBe('/icon.png');

    // The image (declared in the `{}` arg) becomes a child of the button.
    const buttonNode = findNodeByComponentId(page.layout, button!.id);
    expect(buttonNode!.children).toHaveLength(1);
    expect(buttonNode!.children[0].componentId).toBe(image!.id);
  });

  it('treats an empty `{}` argument as no children and keeps real args clean', () => {
    const config = parseIsdw(`
      ./home
      Button("Create User", {})[20,10,top-right]{}
    `);

    const page = config.pages[0];
    const button = findComponent(page.components, 'Button');
    expect(button!.props?.text).toBe('Create User');

    const buttonNode = findNodeByComponentId(page.layout, button!.id);
    expect(buttonNode!.children).toHaveLength(0);
  });

  it('parses Table as a component and preserves its place in the layout', () => {
    const config = parseIsdw(`
      ./admin/users
      Col()[80,90,center] {
        Button("Create User", {})[20,10,top-right]{}
        Table()[100,90,center]{}
      }
    `);

    const page = config.pages[0];
    expect(page.route).toBe('/admin/users');
    expect(findComponent(page.components, 'Table')).toBeDefined();
    expect(findComponent(page.components, 'Button')).toBeDefined();
  });
});

describe('isdw parser — args: literals, handlers, value bindings', () => {
  it('treats null as a literal (no handler), keeping the text', () => {
    const config = parseIsdw(`
      ./home
      Button("Create User", null)[20,10,top-right]{}
    `);
    const btn = findComponent(config.pages[0].components, 'Button')!;
    expect(btn.props?.text).toBe('Create User');
    expect(btn.bindings ?? []).toHaveLength(0);
  });

  it('binds a bare identifier as an onClick handler', () => {
    const config = parseIsdw(`
      ./home
      Button("Save", saveUser)[20,10,top-right]{}
    `);
    const btn = findComponent(config.pages[0].components, 'Button')!;
    expect(btn.bindings).toEqual([{ prop: 'onClick', methodId: 'saveUser' }]);
  });

  it('binds @method as a reactive value binding on the component primary prop', () => {
    const config = parseIsdw(`
      ./home
      Text(@currentUserName)[100,10,top-left]{}
    `);
    const text = findComponent(config.pages[0].components, 'Text')!;
    expect(text.bindings).toEqual([{ prop: 'text', methodId: 'currentUserName', kind: 'value' }]);
  });
});

describe('isdw parser — two-way model bindings', () => {
  it('binds ~name on an Input to the value prop (kind model)', () => {
    const config = parseIsdw(`
      ./home
      Input(~email)[100,10,top-left]{}
    `);
    const input = findComponent(config.pages[0].components, 'Input')!;
    expect(input.bindings).toEqual([{ prop: 'value', methodId: 'email', kind: 'model' }]);
  });

  it('binds ~active on a Checkbox to the checked prop', () => {
    const config = parseIsdw(`
      ./home
      Checkbox(~active)[10,10,top-left]{}
    `);
    const cb = findComponent(config.pages[0].components, 'Checkbox')!;
    expect(cb.bindings).toEqual([{ prop: 'checked', methodId: 'active', kind: 'model' }]);
  });
});

describe('isdw parser — repeater', () => {
  it('parses Repeat with a data value-binding and an item template', () => {
    const config = parseIsdw(`
      ./home
      Repeat(@users)[100,100,top-left] {
        Text(@item.name)[100,10,top-left]{}
      }
    `);

    const page = config.pages[0];
    const repeat = findComponent(page.components, 'Repeat')!;
    expect(repeat.bindings).toEqual([{ prop: 'data', methodId: 'users', kind: 'value' }]);

    const text = findComponent(page.components, 'Text')!;
    expect(text.bindings).toEqual([{ prop: 'text', methodId: 'item.name', kind: 'value' }]);

    // The template is a layout child of the Repeat's bound cell.
    const repeatNode = findNodeByComponentId(page.layout, repeat.id);
    expect(findNodeByComponentId(repeatNode!, text.id)).toBeDefined();
  });
});

describe('isdw parser — definitions & slots', () => {
  it('expands a `define` component and fills its Children slot', () => {
    const config = parseIsdw(`
      define Box() {
        Card()[100,100,top-left] {
          Children()[100,100,top-left]{}
        }
      }
      ./home
      Box()[100,100,top-left] {
        Text("inside")[100,100,top-left]{}
      }
    `);

    const page = config.pages[0];
    const card = findComponent(page.components, 'Card');
    const text = findComponent(page.components, 'Text');
    expect(card).toBeDefined();
    expect(text?.props?.text).toBe('inside');

    // The call's Text child should land inside the Card's slot (a descendant).
    const cardNode = findNodeByComponentId(page.layout, card!.id);
    expect(cardNode).toBeDefined();
    expect(findNodeByComponentId(cardNode!, text!.id)).toBeDefined();
  });

  it('end-to-end: user-page.isdw shape (imported DefaultPageFormat + slot + Table)', () => {
    const pageFormat = `
      define DefaultPageFormat() {
        Row()[100,100,top-left] {
          Col()[20,100,top-left] {
            Button("Logout", logout)[100,10,top-left]{}
            Button("Feedback", openFeedback)[100,10,top-left]{}
          }
          Col()[80,100,top-left] {
            Children()[100,100,top-left]{}
          }
        }
      }
    `;

    const config = parseIsdw(
      `
        import DefaultPageFormat, Table from "./page-format.isdw"
        ./admin/users
        DefaultPageFormat()[100,100,top-left] {
          Text("User Management")[20,10,top-left]{}
          Col()[80,90,center] {
            Button("Create User", createUser)[20,10,top-right]{}
            Table()[100,90,center]{}
          }
        }
      `,
      { resolve: () => pageFormat }
    );

    const page = config.pages[0];
    expect(page.route).toBe('/admin/users');
    // Chrome from the imported definition + slot content from the page:
    expect(findComponent(page.components, 'Text')?.props?.text).toBe('User Management');
    expect(findComponent(page.components, 'Table')).toBeDefined();
    // Logout + Feedback (from the definition) + Create User (from the page) = 3 buttons.
    expect(page.components.filter((c) => c.type === 'Button')).toHaveLength(3);
  });

  it('imports a definition from another .isdw file via resolve()', () => {
    const lib = `
      define Box() {
        Card()[100,100,top-left] {
          Children()[100,100,top-left]{}
        }
      }
    `;

    let resolvedPath: string | undefined;
    const config = parseIsdw(
      `
        import Box from "./lib.isdw"
        ./home
        Box()[100,100,top-left] {
          Text("hi")[100,100,top-left]{}
        }
      `,
      {
        resolve: (p) => {
          resolvedPath = p;
          return lib;
        },
      }
    );

    expect(resolvedPath).toBe('./lib.isdw');
    const page = config.pages[0];
    expect(findComponent(page.components, 'Card')).toBeDefined();
    expect(findComponent(page.components, 'Text')?.props?.text).toBe('hi');
  });
});
