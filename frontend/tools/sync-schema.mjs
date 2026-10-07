// Genera i file TS degli schemi (projects/schema/src/lib/*.schema.ts) a partire dai file JSON, che restano l'unica fonte.
// Uso: node tools/sync-schema.mjs [--check]   (con --check non scrive: fallisce se i file non sono allineati)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const lib = join(here, '../projects/schema/src/lib');
const schemas = [
  { name: 'screen', constant: 'SCREEN_SCHEMA' },
  { name: 'theme', constant: 'THEME_SCHEMA' },
  { name: 'navigation', constant: 'NAVIGATION_SCHEMA' },
];
const check = process.argv.includes('--check');
let misaligned = 0;

for (const { name, constant } of schemas) {
  const schema = JSON.parse(readFileSync(join(lib, `schemas/${name}.schema.json`), 'utf8'));
  const target = join(lib, `${name}.schema.ts`);
  const content =
    `// GENERATO da tools/sync-schema.mjs a partire da schemas/${name}.schema.json: non modificare a mano.\n` +
    '// Dopo ogni modifica allo schema: npm run schema:sync\n' +
    `export const ${constant}: Record<string, unknown> = ${JSON.stringify(schema, null, 2)};\n`;
  if (check) {
    const current = existsSync(target) ? readFileSync(target, 'utf8') : '';
    if (current !== content) {
      console.error(`${name}.schema.ts non è allineato a ${name}.schema.json: eseguire npm run schema:sync`);
      misaligned++;
    }
  } else {
    writeFileSync(target, content);
    console.log(`Generato ${name}.schema.ts`);
  }
}
if (check) {
  if (misaligned) process.exit(1);
  console.log('Schemi allineati.');
}
