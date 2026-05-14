#!/usr/bin/env node

import { Command } from 'commander';
import { initCommand } from './cli/commands/init';

const program = new Command();

program
  .name('isd-ui')
  .description('UI configuration framework for Next.js + Tailwind')
  .version('0.1.0');

program
  .command('init')
  .description('Scaffold ui.config.json and wire up withUIConfig in next.config.ts')
  .option('--config <path>', 'Path for the config file', './ui.config.json')
  .option('--no-editor', 'Disable the visual editor')
  .action(async (options) => {
    try {
      await initCommand(options);
    } catch (err) {
      console.error('[isd-ui] Error:', err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

program.parse(process.argv);
