import { zodToJsonSchema } from 'zod-to-json-schema';
import { UIConfigSchema } from '../src/schema/config.schema';
import fs from 'node:fs';
import path from 'node:path';

const jsonSchema = zodToJsonSchema(UIConfigSchema, {
  name: 'UIConfig',
  target: 'jsonSchema7',
});

fs.writeFileSync(
  path.resolve(process.cwd(), 'ui.config.schema.json'),
  JSON.stringify(jsonSchema, null, 2),
  'utf-8'
);

console.log('Generated ui.config.schema.json');
