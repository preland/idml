#!/usr/bin/env node

import { Command } from 'commander';

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
    console.log('Init command coming soon. For now, manually:');
    console.log('1. Create ui.config.json in your project root');
    console.log('2. Import { withUIConfig } from "isd-ui/server" in next.config.ts');
    console.log('3. Wrap your config: export default withUIConfig()(nextConfig)');
  });

program.parse(process.argv);
