// Genera projects/schema/src/lib/screen.schema.ts a partire dal file JSON, che resta l'unica fonte.
// Uso: node tools/sync-schema.mjs [--check]   (con --check non scrive: fallisce se i file non sono allineati)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = join(here, '../projects/schema/src/lib/schemas/screen.schema.json');
const target = join(here, '../projects/schema/src/lib/screen.schema.ts');

const schema = JSON.parse(readFileSync(source, 'utf8'));
const content =
  '// GENERATO da tools/sync-schema.mjs a partire da schemas/screen.schema.json: non modificare a mano.\n' +
  '// Dopo ogni modifica allo schema: npm run schema:sync\n' +
  `export const SCREEN_SCHEMA: Record<string, unknown> = ${JSON.stringify(schema, null, 2)};\n`;

if (process.argv.includes('--check')) {
  const current = existsSync(target) ? readFileSync(target, 'utf8') : '';
  if (current !== content) {
    console.error('screen.schema.ts non è allineato a screen.schema.json: eseguire npm run schema:sync');
    process.exit(1);
  }
  console.log('Schema allineato.');
} else {
  writeFileSync(target, content);
  console.log('Generato screen.schema.ts');
}
