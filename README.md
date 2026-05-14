# isd-ui

A configuration-driven UI framework for Next.js 15 + TypeScript + Tailwind CSS.

Define your entire UI (layout, theming, data bindings) in a single JSON config file. Changes are reflected instantly in development without full page reloads.

## Features

- **Config-first**: Declare pages, layouts, components, and design tokens in `ui.config.json`
- **Percentage-based scaling**: Enforced no-pixel rule — all layout dimensions use percentages of parent container
- **Design tokens**: Centralized colors, typography, and spacing scales
- **Data binding**: Reference named methods to wire data and event handlers
- **Live editor**: Browser-based visual editor with click-to-select and property panel
- **Hot reload**: File changes trigger instant UI updates in development
- **Type-safe**: Full TypeScript support with Zod runtime validation

## Quick start

### 1. Install

```bash
npm install isd-ui
```

### 2. Initialize

```bash
npx isd-ui init
```

This scaffolds `ui.config.json` and wires up the Next.js plugin.

### 3. Define your UI

Edit `ui.config.json`:

```json
{
  "version": "1",
  "tokens": {
    "colors": [
      { "name": "primary", "value": "#1a56db" }
    ],
    "typography": [
      { "name": "heading-xl", "fontSize": "2.25rem", "fontWeight": 700 }
    ],
    "spacing": [
      { "name": "gap-md", "value": "1rem" }
    ]
  },
  "pages": [{
    "route": "/",
    "layout": {
      "type": "flex",
      "direction": "column",
      "size": { "width": "100%", "height": "100%" },
      "children": []
    },
    "components": []
  }]
}
```

### 4. Render in your app

```tsx
import { ConfigProvider, ConfigRenderer } from 'isd-ui';
import config from './ui.config.json';

export default function Home() {
  return (
    <ConfigProvider config={config} methods={[]} components={[]}>
      <ConfigRenderer page="/" />
    </ConfigProvider>
  );
}
```

### 5. Open the editor

```bash
npm run dev
```

Visit `http://localhost:3000/_isd-editor` to edit your UI visually.

## Architecture

- **3 entry points**:
  - `isd-ui` (client/browser) — React components for rendering
  - `isd-ui/server` (Node.js) — Next.js plugin, file watcher, SSE routes
  - `isd-ui/cli` (binary) — `npx isd-ui init` scaffolding tool

- **No-pixel rule**: All `width`, `height`, `min-*`, `max-*` values must be percentages. This prevents CSS stacking issues and makes layouts predictable.

- **Design tokens**: Define once, use everywhere. Token values are injected as CSS custom properties.

- **Data binding**: Connect components to methods registered via `ConfigProvider.methods`.

## License

MIT
