// Genera i file TS degli schemi (projects/schema/src/lib/*.schema.ts) a partire dai file JSON, che restano l'unica fonte,
// e i validatori precompilati (projects/schema/src/lib/validators.generated.ts, Ajv "standalone"): nel browser non si
// compila nulla, quindi niente `new Function` (la Content-Security-Policy non richiede 'unsafe-eval') e niente
// compilatore di Ajv nel bundle.
// Uso: node tools/sync-schema.mjs [--check]   (con --check non scrive: fallisce se i file non sono allineati)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import standaloneCode from 'ajv/dist/standalone/index.js';

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
// Validatori precompilati: stesse opzioni di prima (tutti gli errori, modalità strict), un'unica sorgente con tre export.
{
  const ajv = new Ajv2020({ allErrors: true, strict: true, code: { source: true, esm: true, lines: false } });
  const exportsByName = {};
  for (const { name } of schemas) {
    const schema = JSON.parse(readFileSync(join(lib, `schemas/${name}.schema.json`), 'utf8'));
    ajv.addSchema(schema);
    exportsByName[`${name}Validator`] = schema.$id;
  }
  let code = standaloneCode(ajv, exportsByName);
  // L'unica dipendenza di runtime di Ajv usata (lunghezza in caratteri Unicode di una stringa) diventa una funzione
  // locale: il file non importa nulla.
  code = code.replace(/const (\w+) = require\("ajv\/dist\/runtime\/ucs2length"\)\.default;?/g, 'const $1 = (s) => [...s].length;');
  if (/require\(/.test(code)) throw new Error('validatori: dipendenza di runtime non prevista');
  const content =
    '// GENERATO da tools/sync-schema.mjs a partire da schemas/*.schema.json: non modificare a mano.\n' +
    '// Dopo ogni modifica agli schemi: npm run schema:sync\n' +
    '/* eslint-disable */\n// @ts-nocheck\n' +
    code +
    '\n';
  const target = join(lib, 'validators.generated.ts');
  if (check) {
    const current = existsSync(target) ? readFileSync(target, 'utf8') : '';
    if (current !== content) {
      console.error('validators.generated.ts non è allineato agli schemi: eseguire npm run schema:sync');
      misaligned++;
    }
  } else {
    writeFileSync(target, content);
    console.log('Generato validators.generated.ts');
  }
}
if (check) {
  if (misaligned) process.exit(1);
  console.log('Schemi allineati.');
}
