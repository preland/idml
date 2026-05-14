import fs from 'node:fs';
import path from 'node:path';
import { STARTER_CONFIG } from '../templates/starter-config';
import { EDITOR_PAGE_TEMPLATE } from '../templates/editor-page-template';
import { EVENTS_ROUTE_TEMPLATE } from '../templates/events-route-template';
import { CONFIG_ROUTE_TEMPLATE } from '../templates/config-route-template';

export async function initCommand(options: { config: string; editor: boolean }) {
  const cwd = process.cwd();
  const configPath = path.resolve(cwd, options.config);

  console.log('[isd-ui] Initializing...\n');

  // 1. Write starter ui.config.json
  if (fs.existsSync(configPath)) {
    console.log(`✓ Config already exists at ${options.config}`);
  } else {
    fs.writeFileSync(configPath, JSON.stringify(STARTER_CONFIG, null, 2), 'utf-8');
    console.log(`✓ Created ${options.config}`);
  }

  // 2. Scaffold API routes
  if (options.editor) {
    const eventsDir = path.join(cwd, 'app', 'api', 'isd', 'events');
    const configDir = path.join(cwd, 'app', 'api', 'isd', 'config');

    fs.mkdirSync(eventsDir, { recursive: true });
    fs.mkdirSync(configDir, { recursive: true });

    const eventsRoutePath = path.join(eventsDir, 'route.ts');
    const configRoutePath = path.join(configDir, 'route.ts');

    if (!fs.existsSync(eventsRoutePath)) {
      fs.writeFileSync(eventsRoutePath, EVENTS_ROUTE_TEMPLATE, 'utf-8');
      console.log(`✓ Created app/api/isd/events/route.ts`);
    }

    if (!fs.existsSync(configRoutePath)) {
      fs.writeFileSync(configRoutePath, CONFIG_ROUTE_TEMPLATE, 'utf-8');
      console.log(`✓ Created app/api/isd/config/route.ts`);
    }

    // 3. Scaffold editor page
    const editorDir = path.join(cwd, 'app', 'isd', 'editor');
    fs.mkdirSync(editorDir, { recursive: true });

    const editorPagePath = path.join(editorDir, 'page.tsx');
    if (!fs.existsSync(editorPagePath)) {
      fs.writeFileSync(editorPagePath, EDITOR_PAGE_TEMPLATE, 'utf-8');
      console.log(`✓ Created app/isd/editor/page.tsx`);
    }
  }

  // 4. Patch next.config.ts
  const nextConfigPath = path.resolve(cwd, 'next.config.ts');
  const nextConfigJsPath = path.resolve(cwd, 'next.config.js');
  const targetPath = fs.existsSync(nextConfigPath)
    ? nextConfigPath
    : fs.existsSync(nextConfigJsPath)
      ? nextConfigJsPath
      : null;

  if (!targetPath) {
    console.warn(
      '\n⚠ No next.config.ts/js found. Create one and manually add:\n' +
        '  import { withUIConfig } from "isd-ui/server";\n' +
        '  export default withUIConfig()({});\n'
    );
  } else {
    const existing = fs.readFileSync(targetPath, 'utf-8');
    if (!existing.includes('withUIConfig')) {
      const importLine = `import { withUIConfig } from 'isd-ui/server';\n`;
      const isJs = targetPath.endsWith('.js');

      // Simple regex patch: wrap export default
      let patched = existing;
      if (patched.includes('export default')) {
        patched = patched.replace(
          /export default\s+({|nextConfig)/,
          `export default withUIConfig({ configPath: '${options.config}' })($1`
        );

        // If it wraps a variable (nextConfig), close with );
        if (patched.includes('export default withUIConfig') && patched.includes('nextConfig;')) {
          patched = patched.replace(/nextConfig;/, 'nextConfig);');
        }
        // If it wraps an object literal, close the object and paren
        else if (patched.includes('export default withUIConfig') && patched.includes('{')) {
          const lines = patched.split('\n');
          const lastNonEmptyLine = lines[lines.length - 2]; // before any trailing newline
          if (lastNonEmptyLine?.trim() === '}') {
            patched = patched.replace(/^(\s*})(\s*)$/, '$1);$2', 'm');
          }
        }
      } else {
        // No export default found, add a stub
        patched = patched + '\nexport default withUIConfig()({});\n';
      }

      fs.writeFileSync(targetPath, importLine + patched, 'utf-8');
      console.log(`✓ Patched next.config.${isJs ? 'js' : 'ts'} with withUIConfig`);
    } else {
      console.log(`✓ next.config already contains withUIConfig`);
    }
  }

  // 5. Patch tailwind.config.ts if needed
  const tailwindPath = path.resolve(cwd, 'tailwind.config.ts');
  const tailwindJsPath = path.resolve(cwd, 'tailwind.config.js');
  const tailwindTarget = fs.existsSync(tailwindPath)
    ? tailwindPath
    : fs.existsSync(tailwindJsPath)
      ? tailwindJsPath
      : null;

  if (tailwindTarget) {
    const tailwindContent = fs.readFileSync(tailwindTarget, 'utf-8');
    const isdPath = './node_modules/isd-ui/dist/**/*.{js,mjs}';
    if (!tailwindContent.includes('isd-ui')) {
      // Simple text patch to add to content array
      const patched = tailwindContent.replace(
        /content:\s*\[/,
        `content: [\n    '${isdPath}',`
      );
      fs.writeFileSync(tailwindTarget, patched, 'utf-8');
      console.log(`✓ Updated tailwind.config.ts content array`);
    }
  }

  console.log('\n✅ isd-ui initialized!\n');
  console.log('Next steps:');
  console.log('  1. npm run dev');
  console.log('  2. Visit http://localhost:3000/_isd-editor');
  console.log('  3. Click on components in the preview to edit them');
  console.log('\nDocumentation: https://github.com/...\n');
}
