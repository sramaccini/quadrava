// Copia gli esempi (../examples) nella cartella pubblica dell'app runtime, così la demo li carica via HTTP.
import { cpSync, rmSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const target = join(here, '../projects/runtime/public/examples');
rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
cpSync(join(here, '../../examples'), target, { recursive: true, dereference: true });
console.log('Esempi copiati in projects/runtime/public/examples');
