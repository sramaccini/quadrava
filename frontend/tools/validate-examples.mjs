// Valida le applicazioni di esempio (../examples/*.json) contro lo schema del nucleo.
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

const here = dirname(fileURLToPath(import.meta.url));
const schema = JSON.parse(readFileSync(join(here, '../projects/schema/src/lib/schemas/screen.schema.json'), 'utf8'));
const examplesDir = join(here, '../../examples');

const ajv = new Ajv2020({ allErrors: true, strict: true });
const validate = ajv.compile(schema);

let failed = 0;
for (const file of readdirSync(examplesDir).filter((f) => f.endsWith('.json'))) {
  const doc = JSON.parse(readFileSync(join(examplesDir, file), 'utf8'));
  if (validate(doc)) {
    console.log(`OK    ${file}`);
  } else {
    failed++;
    console.error(`ERRORE ${file}`);
    for (const e of validate.errors ?? []) console.error(`  ${e.instancePath || '/'} ${e.message}`);
  }
}
process.exit(failed ? 1 : 0);
