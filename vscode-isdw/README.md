# ISDW — VS Code language support

Syntax highlighting for `.isdw` files, the declarative UI DSL parsed by
`isd-ui` (`src/parser/isdw-parser.ts`).

## What it highlights

| Token | Example | Scope |
| --- | --- | --- |
| Header comment | `# section` | `comment.line.number-sign` |
| Route | `./admin/users` | `entity.name.section.route` |
| Styled-variant def | `NavLink:Button` | `entity.name.type` + `support.class.base-type` |
| Component / definition call | `Button(...)`, `DefaultPageFormat(...)` | `support.class.component` |
| Layout primitive | `Row`, `Col` | `keyword.other.layout` |
| Keyword | `import`, `from`, `define` | `keyword.control` |
| Literal | `true`, `false`, `null` | `constant.language` |
| Dimensions | `[20,10,top-right]` | numbers + `support.constant.anchor` |
| Value binding | `@users`, `@item.name`, `@state.x` | `variable.other.value-binding` |
| Model binding | `~email` | `variable.other.model-binding` |
| Handler / param ref | `saveUser`, `title` | `variable.other.handler` |
| Class block | `` `flex items-center` `` | `string.interpolated.class` |
| String | `"Save"` | `string.quoted.double` |
| Hex colour | `#1a56db` | `constant.other.color` |

The DSL has tightened, so two old constructs are now flagged as errors (rendered
with your theme's invalid/error colour):

| Flagged | Why | Scope |
| --- | --- | --- |
| `auto` dimension | dimensions must be explicit percentages | `invalid.deprecated.auto` |
| `<bg=#fff ...>` inline style block | styling lives only in named variants | `invalid.illegal.style-block` |

Colours come from your active VS Code theme via these standard TextMate
scopes — there is no hard-coded palette, so it adapts to light/dark themes.

## Install (local dev)

VS Code loads an extension from any folder under `~/.vscode/extensions`, or
you can run it from source:

```bash
# symlink into your extensions dir, then reload VS Code
ln -s "$(pwd)" ~/.vscode/extensions/vscode-isdw
```

To produce a `.vsix` for sharing: `npx @vscode/vsce package`.

## Verifying the grammar

`npm run check` tokenizes a sample and prints the scope assigned to each token,
so grammar changes can be eyeballed without launching VS Code:

```bash
npm install   # pulls vscode-textmate + vscode-oniguruma (dev only)
npm run check
```
