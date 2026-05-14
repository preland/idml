import { defineConfig } from 'tsup';

export default defineConfig([
  // Client/browser bundle (renderer + editor)
  {
    entry: { index: 'src/index.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: true,
    external: ['react', 'react-dom', 'next'],
    esbuildOptions(opts) {
      opts.banner = { js: '"use client";' };
    },
    tsconfig: 'tsconfig.build.json',
  },
  // Server/Node.js bundle (Next.js plugin + watcher)
  {
    entry: { server: 'src/server.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    splitting: false,
    sourcemap: true,
    platform: 'node',
    external: ['next', 'react', 'react-dom', 'fs', 'path', 'chokidar'],
    tsconfig: 'tsconfig.build.json',
  },
  // CLI binary
  {
    entry: { cli: 'src/cli.ts' },
    format: ['cjs'],
    dts: false,
    splitting: false,
    sourcemap: false,
    platform: 'node',
    external: ['fs', 'path', 'commander'],
    tsconfig: 'tsconfig.build.json',
  },
]);
