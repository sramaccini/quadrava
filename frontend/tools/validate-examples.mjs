// Valida le applicazioni di esempio (../examples/*.json) contro lo schema del nucleo.
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

const here = dirname(fileURLToPath(import.meta.url));
const schema = JSON.parse(readFileSync(join(here, '../projects/schema/src/lib/schemas/screen.schema.json'), 'utf8'));
const themeSchema = JSON.parse(readFileSync(join(here, '../projects/schema/src/lib/schemas/theme.schema.json'), 'utf8'));
const navigationSchema = JSON.parse(readFileSync(join(here, '../projects/schema/src/lib/schemas/navigation.schema.json'), 'utf8'));
const examplesDir = join(here, '../../examples');

const ajv = new Ajv2020({ allErrors: true, strict: true });
const validateScreen = ajv.compile(schema);
const validateTheme = ajv.compile(themeSchema);
const validateNavigation = ajv.compile(navigationSchema);

const files = [
  ...readdirSync(examplesDir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => ({ file: f, validate: f === 'navigation.json' ? validateNavigation : validateScreen })),
  ...readdirSync(join(examplesDir, 'themes')).filter((f) => f.endsWith('.json')).map((f) => ({ file: `themes/${f}`, validate: validateTheme })),
];

let failed = 0;
for (const { file, validate } of files) {
  const doc = JSON.parse(readFileSync(join(examplesDir, file), 'utf8'));
  if (validate(doc)) {
    console.log(`OK    ${file}`);
  } else {
    failed++;
    console.error(`ERRORE ${file}`);
    for (const e of validate.errors ?? []) console.error(`  ${e.instancePath || '/'} ${e.message}`);
  }
}

// Cataloghi di traduzione: stesse chiavi in tutte le lingue, solo testi, e ogni chiave usata da t('…') esiste nella lingua predefinita.
const i18nDir = join(examplesDir, 'i18n');
const catalogs = Object.fromEntries(readdirSync(i18nDir).filter((f) => f.endsWith('.json')).map((f) => [f.replace('.json', ''), JSON.parse(readFileSync(join(i18nDir, f), 'utf8'))]));
const base = new Set(Object.keys(catalogs.it ?? {}));
for (const [locale, messages] of Object.entries(catalogs)) {
  const keys = new Set(Object.keys(messages));
  const missing = [...base].filter((k) => !keys.has(k));
  const extra = [...keys].filter((k) => !base.has(k));
  const notText = Object.entries(messages).filter(([, v]) => typeof v !== 'string').map(([k]) => k);
  if (missing.length || extra.length || notText.length) {
    failed++;
    console.error(`ERRORE i18n/${locale}.json`);
    missing.forEach((k) => console.error(`  manca la chiave ${k}`));
    extra.forEach((k) => console.error(`  chiave in più rispetto a it: ${k}`));
    notText.forEach((k) => console.error(`  il valore di ${k} non è un testo`));
  } else {
    console.log(`OK    i18n/${locale}.json (${keys.size} chiavi)`);
  }
}
const used = new Set();
for (const { file } of files) {
  const text = readFileSync(join(examplesDir, file), 'utf8');
  for (const m of text.matchAll(/\bt\(\s*'([^']+)'/g)) used.add(m[1]);
}
const unknown = [...used].filter((k) => !base.has(k));
if (unknown.length) {
  failed++;
  console.error('ERRORE chiavi usate con t() ma assenti da i18n/it.json:');
  unknown.forEach((k) => console.error(`  ${k}`));
}
process.exit(failed ? 1 : 0);
