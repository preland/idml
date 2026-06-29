import { describe, it, expect } from 'vitest';
import { parseIsdw } from '../../src/parser/isdw-parser';
import type { LayoutDef, ComponentDef } from '../../src/types';

// NOTE: snippets are written flush-left (no indentation) so the strict
// 80-column rule isn't tripped by the leading whitespace of a template literal.

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
Text("Hello")[100,100,top-left]{}
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
Button("Save", { Image("/icon.png")[100,100,center]{} })[100,100,top-left]{}
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
Button("Create User", {})[100,100,top-right]{}
`);

    const page = config.pages[0];
    const button = findComponent(page.components, 'Button');
    expect(button!.props?.text).toBe('Create User');

    const buttonNode = findNodeByComponentId(page.layout, button!.id);
    expect(buttonNode!.children).toHaveLength(0);
  });

  it('expands Table(@data){ Column… } into headers + a Repeat of cell templates', () => {
    const config = parseIsdw(`
./admin/users
Table(@users)[100,100,center] {
Column("Name")[10,50,top-left]{ Text(@item.name)[100,100,top-left]{} }
Column("Actions")[10,50,top-left]{
Button("Edit", editUser)[100,100,top-left]{}
}
}
`);

    const page = config.pages[0];
    // Header labels are plain Text components.
    expect(page.components.some((c) => c.type === 'Text' && c.props?.text === 'Name')).toBe(true);
    expect(page.components.some((c) => c.type === 'Text' && c.props?.text === 'Actions')).toBe(true);

    // The data drives a Repeat bound to @users.
    const repeat = findComponent(page.components, 'Repeat')!;
    expect(repeat.bindings).toEqual([{ prop: 'data', methodId: 'users', kind: 'value' }]);

    // Cell templates carry the per-row item bindings / handlers.
    expect(
      page.components.some((c) => c.type === 'Text' && c.bindings?.[0]?.methodId === 'item.name')
    ).toBe(true);
    const editBtn = page.components.find((c) => c.type === 'Button' && c.props?.text === 'Edit')!;
    expect(editBtn.bindings).toEqual([{ prop: 'onClick', methodId: 'editUser' }]);
  });
});

describe('isdw parser — args: literals, handlers, value bindings', () => {
  it('treats null as a literal (no handler), keeping the text', () => {
    const config = parseIsdw(`
./home
Button("Create User", null)[100,100,top-right]{}
`);
    const btn = findComponent(config.pages[0].components, 'Button')!;
    expect(btn.props?.text).toBe('Create User');
    expect(btn.bindings ?? []).toHaveLength(0);
  });

  it('binds a bare identifier as an onClick handler', () => {
    const config = parseIsdw(`
./home
Button("Save", saveUser)[100,100,top-right]{}
`);
    const btn = findComponent(config.pages[0].components, 'Button')!;
    expect(btn.bindings).toEqual([{ prop: 'onClick', methodId: 'saveUser' }]);
  });

  it('binds @method as a reactive value binding on the component primary prop', () => {
    const config = parseIsdw(`
./home
Text(@currentUserName)[100,100,top-left]{}
`);
    const text = findComponent(config.pages[0].components, 'Text')!;
    expect(text.bindings).toEqual([{ prop: 'text', methodId: 'currentUserName', kind: 'value' }]);
  });
});

describe('isdw parser — Icon', () => {
  it('maps Icon("House") to a name prop (not arg0)', () => {
    const config = parseIsdw(`
./home
Icon("House")[100,100,top-left]{}
`);
    const icon = findComponent(config.pages[0].components, 'Icon')!;
    expect(icon.props).toEqual({ name: 'House' });
  });

  it('maps a second numeric arg to size', () => {
    const config = parseIsdw(`
./home
Icon("Gear", 24)[100,100,top-left]{}
`);
    const icon = findComponent(config.pages[0].components, 'Icon')!;
    expect(icon.props).toEqual({ name: 'Gear', size: 24 });
  });

  it('maps a string arg after the size to color', () => {
    const config = parseIsdw(`
./home
Icon("ChatCenteredDots", 24, "white")[100,100,top-left]{}
`);
    const icon = findComponent(config.pages[0].components, 'Icon')!;
    expect(icon.props).toEqual({ name: 'ChatCenteredDots', size: 24, color: 'white' });
  });

  it('binds @method to the name prop (dynamic icon)', () => {
    const config = parseIsdw(`
./home
Icon(@darkIcon)[100,100,top-left]{}
`);
    const icon = findComponent(config.pages[0].components, 'Icon')!;
    expect(icon.bindings).toEqual([{ prop: 'name', methodId: 'darkIcon', kind: 'value' }]);
  });
});

describe('isdw parser — styled variants are the only home for classes', () => {
  it('bakes a class block into a Name:BaseType variant and applies it on use', () => {
    const config = parseIsdw(`
SidebarLink:Button \`text-left py-2 px-2 rounded hover:bg-gray-800\`
./home
SidebarLink("Logout", logout)[100,100,top-left]{}
`);
    const btn = findComponent(config.pages[0].components, 'Button')!;
    expect(btn.props?.text).toBe('Logout');
    expect(btn.className).toBe('text-left py-2 px-2 rounded hover:bg-gray-800');
    expect(btn.bindings).toEqual([{ prop: 'onClick', methodId: 'logout' }]);
  });

  it('applies a variant on a Row layout node', () => {
    const config = parseIsdw(`
Bar:Row \`flex items-center gap-4\`
./home
Bar()[100,100,top-left] {
Text("hi")[100,100,top-left]{}
}
`);
    const row = config.pages[0].layout.children[0];
    expect(row.className).toBe('flex items-center gap-4');
  });

  it('supports a variant with default args and no css body', () => {
    const config = parseIsdw(`
Brand:Text("Project 2031") \`text-xl font-bold\`
./home
Brand()[100,100,top-left]{}
`);
    const text = findComponent(config.pages[0].components, 'Text')!;
    expect(text.props?.text).toBe('Project 2031');
    expect(text.className).toBe('text-xl font-bold');
  });

  it('allows a use-site class block of ONLY dynamic @ bindings (no literals)', () => {
    const config = parseIsdw(`
RoleBadge:Text \`inline-flex px-2 rounded-full\`
./home
RoleBadge(@item.role)[100,100,top-left]\`@roleClass\`{}
`);
    const badge = findComponent(config.pages[0].components, 'Text')!;
    // Static classes come from the variant; the dynamic class is a binding.
    expect(badge.className).toBe('inline-flex px-2 rounded-full');
    expect(badge.bindings).toContainEqual({ prop: 'className', methodId: 'roleClass', kind: 'value' });
  });
});

describe('isdw parser — definition parameters', () => {
  it('substitutes a positional param into the body', () => {
    const config = parseIsdw(`
Title:Text \`text-2xl\`
define TopBar(title) {
Title(title)[100,100,top-left]{}
}
./home
TopBar("User Management")[100,100,top-left]{}
`);
    const text = findComponent(config.pages[0].components, 'Text')!;
    expect(text.props?.text).toBe('User Management');
    expect(text.className).toBe('text-2xl');
  });

  it('threads a param through a nested definition call', () => {
    const config = parseIsdw(`
define Inner(x) {
Text(x)[100,100,top-left]{}
}
define Outer(y) {
Inner(y)[100,100,top-left]{}
}
./home
Outer("Hello")[100,100,top-left]{}
`);
    const text = findComponent(config.pages[0].components, 'Text')!;
    expect(text.props?.text).toBe('Hello');
  });

  it('renders an empty value when a param is not supplied', () => {
    const config = parseIsdw(`
define TopBar(title) {
Text(title)[100,100,top-left]{}
}
./home
TopBar()[100,100,top-left]{}
`);
    const text = findComponent(config.pages[0].components, 'Text')!;
    expect(text.props?.text).toBe('');
    expect(text.bindings ?? []).toHaveLength(0);
  });
});

describe('isdw parser — two-way model bindings', () => {
  it('binds ~name on an Input to the value prop (kind model)', () => {
    const config = parseIsdw(`
./home
Input(~email)[100,100,top-left]{}
`);
    const input = findComponent(config.pages[0].components, 'Input')!;
    expect(input.bindings).toEqual([{ prop: 'value', methodId: 'email', kind: 'model' }]);
  });

  it('binds ~active on a Checkbox to the checked prop', () => {
    const config = parseIsdw(`
./home
Checkbox(~active)[100,100,top-left]{}
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
Text(@item.name)[100,100,top-left]{}
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

describe('isdw parser — Overlay layer', () => {
  it('positions an overlay child absolutely by its anchor + dims (rest empty)', () => {
    const config = parseIsdw(`
RoundBtn:Button \`rounded-full\`
./home
Overlay()[100,100,top-left] {
RoundBtn("Feedback", openFeedback)[10,10,bottom-right]{}
}
`);
    const overlay = config.pages[0].layout.children[0];
    // The layer fills the viewport but is click-through.
    expect(overlay.isdwStyle?.position).toBe('fixed');
    expect(overlay.isdwStyle?.pointerEvents).toBe('none');
    // Its child is an exact 10%×10% box pinned to the bottom-right, clickable.
    const cell = overlay.children[0];
    expect(cell.isdwStyle?.position).toBe('absolute');
    expect(cell.isdwStyle?.pointerEvents).toBe('auto');
    expect(cell.isdwStyle?.bottom).toBe('0');
    expect(cell.isdwStyle?.right).toBe('0');
    expect(cell.size).toEqual({ height: '10%', width: '10%' });
  });

  it('centers an overlay child with a translate transform', () => {
    const config = parseIsdw(`
./home
Overlay()[100,100,top-left] { Text("hi")[20,20,center]{} }
`);
    const cell = config.pages[0].layout.children[0].children[0];
    expect(cell.isdwStyle?.top).toBe('50%');
    expect(cell.isdwStyle?.left).toBe('50%');
    expect(cell.isdwStyle?.transform).toBe('translate(-50%, -50%)');
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
Col()[100,20,top-left] {
Button("Logout", logout)[50,100,top-left]{}
Button("Feedback", openFeedback)[50,100,top-left]{}
}
Col()[100,80,top-left] {
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
Text("User Management")[20,100,top-left]{}
Col()[80,100,center] {
Button("Create User", createUser)[20,100,top-right]{}
Table()[80,100,center]{}
}
}
`,
      { resolve: () => pageFormat }
    );

    const page = config.pages[0];
    expect(page.route).toBe('/admin/users');
    // Chrome from the imported definition + slot content from the page:
    expect(findComponent(page.components, 'Text')?.props?.text).toBe('User Management');
    // Bare Table() expands to an (empty) header row + Repeat.
    expect(findComponent(page.components, 'Repeat')).toBeDefined();
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

describe('isdw parser — strictness rules (hard errors)', () => {
  it('rejects a comment after code has started (header-only comments)', () => {
    expect(() =>
      parseIsdw(`
./home
Text("hi")[100,100,top-left]{}
# not allowed down here
`)
    ).toThrow(/comments are only allowed in the header/);
  });

  it('allows comments in the leading header block', () => {
    expect(() =>
      parseIsdw(`
# header line one
# header line two
./home
Text("hi")[100,100,top-left]{}
`)
    ).not.toThrow();
  });

  it('rejects a line longer than 80 columns', () => {
    const longClasses = 'a'.repeat(90);
    expect(() => parseIsdw(`./home\nText("${longClasses}")[100,100,top-left]{}`)).toThrow(
      /80/
    );
  });

  it('rejects the `auto` dimension', () => {
    expect(() => parseIsdw(`\n./home\nText("hi")[auto,100,top-left]{}\n`)).toThrow(/auto/);
  });

  it('rejects a missing dimension block', () => {
    expect(() => parseIsdw(`\n./home\nText("hi"){}\n`)).toThrow(/dimensions/);
  });

  it('rejects an inline `<...>` style block', () => {
    expect(() => parseIsdw(`\n./home\nText("hi")[100,100,top-left]<bold>{}\n`)).toThrow(
      /style blocks are no longer supported/
    );
  });

  it('rejects a literal class at a use site', () => {
    expect(() => parseIsdw(`\n./home\nText("hi")[100,100,top-left]\`text-sm\`{}\n`)).toThrow(
      /literal class/
    );
  });

  it('rejects siblings whose main-axis percentages do not total 100', () => {
    expect(() =>
      parseIsdw(`
./home
Col()[100,100,top-left] {
Text("a")[40,100,top-left]{}
Text("b")[40,100,top-left]{}
}
`)
    ).toThrow(/tile to 100%/);
  });

  it('rejects a child that does not fill the cross axis', () => {
    expect(() =>
      parseIsdw(`
./home
Col()[100,100,top-left] {
Text("a")[100,50,top-left]{}
}
`)
    ).toThrow(/cross-axis/);
  });

  it('treats a definition of only out-of-flow content as out-of-flow', () => {
    // A chrome widget that is just an Overlay + Modal takes no tiling space, so
    // it can sit beside a full-height sibling without breaking the sum.
    expect(() =>
      parseIsdw(`
define FeedbackWidget() {
Overlay()[100,100,top-left] {
Button("x", openFeedback)[10,10,bottom-right]{}
}
Modal(@state.open)[50,50,center] {
Text("hi")[100,100,top-left]{}
}
}
./home
Col()[100,100,top-left] {
Text("body")[100,100,top-left]{}
}
FeedbackWidget()[100,100,top-left]{}
`)
    ).not.toThrow();
  });

  it('accepts an explicit Spacer that fills the gap', () => {
    expect(() =>
      parseIsdw(`
./home
Col()[100,100,top-left] {
Text("a")[40,100,top-left]{}
Spacer()[20,100,top-left]{}
Text("b")[40,100,top-left]{}
}
`)
    ).not.toThrow();
  });
});
