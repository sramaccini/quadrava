// Genera docs/riferimento-schema.md dalle descrizioni degli schemi JSON (projects/schema/src/lib/schemas): per ogni
// componente e per ogni passo le proprietà, con tipo, obbligatorietà e descrizione. Gli schemi restano l'unica fonte;
// questo file è solo una vista leggibile.
//
//   node tools/schema-docs.mjs [--check]   (con --check non scrive: fallisce se il documento non è allineato)
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const schemas = join(here, '../projects/schema/src/lib/schemas');
const target = join(here, '../../docs/riferimento-schema.md');
const read = (name) => JSON.parse(readFileSync(join(schemas, `${name}.schema.json`), 'utf8'));
const screen = read('screen');
const defs = screen.$defs;

/** Testo su una riga, con le barre verticali protette (siamo in una tabella Markdown). */
const cell = (text) => String(text ?? '').replace(/\s+/g, ' ').replaceAll('|', '\\|').trim();

/** Tipo leggibile di una proprietà. */
function typeOf(schema) {
  if (!schema) return '';
  if (schema.$ref) {
    const name = schema.$ref.split('/').pop();
    if (name === 'node') return 'componente';
    if (name === 'expression') return 'espressione';
    if (name === 'statePath') return 'percorso nello stato';
    if (name === 'step') return 'passo';
    return name;
  }
  if (schema.enum) return schema.enum.map((v) => `\`${v}\``).join(', ');
  if (schema.const !== undefined) return `\`${JSON.stringify(schema.const)}\``;
  if (schema.anyOf) return schema.anyOf.map(typeOf).join(' o ');
  if (schema.type === 'array') return `elenco di ${typeOf(schema.items) || 'valori'}`;
  if (schema.type === 'object') return 'oggetto';
  if (schema.type === 'string') return 'testo';
  if (schema.type === 'integer') return `intero${schema.minimum !== undefined ? ` ${schema.minimum}–${schema.maximum ?? '…'}` : ''}`;
  if (schema.type === 'number') return 'numero';
  if (schema.type === 'boolean') return 'sì/no';
  return '';
}

/** Descrizione: quella della proprietà o, se manca, quella della definizione a cui rimanda. */
function describe(schema) {
  if (schema?.description) return schema.description;
  if (schema?.$ref) return defs[schema.$ref.split('/').pop()]?.description ?? '';
  return '';
}

function table(properties, required = []) {
  const rows = Object.entries(properties).map(([name, schema]) => `| \`${name}\`${required.includes(name) ? ' *' : ''} | ${cell(typeOf(schema))} | ${cell(describe(schema))} |`);
  return ['| Proprietà | Tipo | Descrizione |', '| --- | --- | --- |', ...rows].join('\n');
}

const out = [];
out.push('# Riferimento dello schema delle schermate');
out.push('');
out.push(
  '> Generato da `frontend/tools/schema-docs.mjs` a partire da `screen.schema.json`: non modificare a mano. Dopo una modifica allo schema: `npm run schema:docs`. Le proprietà con * sono obbligatorie. Le spiegazioni con esempi sono nel [catalogo dei componenti](catalogo-componenti.md).',
);
out.push('');
out.push('## Proprietà comuni a tutti i componenti');
out.push('');
const common = { ...defs.node.properties };
delete common.type;
out.push(table(common));
out.push('');
out.push('## Componenti');
for (const branch of defs.node.allOf) {
  const type = branch.if.properties.type.const;
  const then = branch.then;
  out.push('');
  out.push(`### \`${type}\``);
  out.push('');
  out.push(table(then.properties ?? {}, then.required ?? []));
}
out.push('');
out.push('## Passi delle azioni');
for (const ref of defs.step.oneOf) {
  const name = ref.$ref.split('/').pop();
  const step = defs[name];
  const key = (step.required ?? [])[0];
  out.push('');
  out.push(`### \`${key}\``);
  out.push('');
  out.push(table(step.properties ?? {}, step.required ?? []));
}
out.push('');
out.push('## Campi (form, filtri, campi a sé)');
out.push('');
out.push(table(defs.field.properties, defs.field.required));
out.push('');
out.push('## Data source');
out.push('');
const ds = defs.dataSource;
out.push(table(ds.properties ?? {}, ds.required ?? []));
out.push('');
const content = out.join('\n');

if (process.argv.includes('--check')) {
  const current = existsSync(target) ? readFileSync(target, 'utf8') : '';
  if (current !== content) {
    console.error('docs/riferimento-schema.md non è allineato allo schema: eseguire npm run schema:docs');
    process.exit(1);
  }
  console.log('Riferimento dello schema allineato.');
} else {
  writeFileSync(target, content);
  console.log('Generato docs/riferimento-schema.md');
}
