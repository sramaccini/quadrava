// Validates the example project (../examples) against the schemas: the manifest (project.json), the screens (screens/),
// the data sources (datasources/), the navigation, the themes (themes/) and the translation catalogues (i18n/). It also
// checks that the references of the screens to the data sources of the project resolve.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

const here = dirname(fileURLToPath(import.meta.url));
const schemas = join(here, '../projects/schema/src/lib/schemas');
const readSchema = (name) => JSON.parse(readFileSync(join(schemas, `${name}.schema.json`), 'utf8'));
const examplesDir = join(here, '../../examples');

const ajv = new Ajv2020({ allErrors: true, strict: true });
for (const name of ['screen', 'theme', 'navigation', 'datasources', 'project']) ajv.addSchema(readSchema(name), name);
const validator = (name) => ajv.getSchema(name);

const jsonFiles = (dir) => (existsSync(join(examplesDir, dir)) ? readdirSync(join(examplesDir, dir)).filter((f) => f.endsWith('.json')).map((f) => `${dir}/${f}`) : []);
const files = [
  { file: 'project.json', validate: validator('project') },
  { file: 'navigation.json', validate: validator('navigation') },
  ...jsonFiles('screens').map((file) => ({ file, validate: validator('screen') })),
  ...jsonFiles('datasources').map((file) => ({ file, validate: validator('datasources') })),
  ...jsonFiles('themes').map((file) => ({ file, validate: validator('theme') })),
];

let failed = 0;
const documents = {};
for (const { file, validate } of files) {
  const doc = JSON.parse(readFileSync(join(examplesDir, file), 'utf8'));
  documents[file] = doc;
  if (validate(doc)) {
    console.log(`OK    ${file}`);
  } else {
    failed++;
    console.error(`ERROR ${file}`);
    for (const e of validate.errors ?? []) console.error(`  ${e.instancePath || '/'} ${e.message}`);
  }
}

// Every resource file is named after its identifier, and the references of the screens resolve.
const identifier = { screens: 'screen', datasources: 'datasources', themes: 'theme' };
for (const [file, doc] of Object.entries(documents)) {
  const [folder, name] = file.split('/');
  const key = identifier[folder];
  if (key && doc[key] !== name.replace(/\.json$/, '')) {
    failed++;
    console.error(`ERROR ${file}: the identifier «${doc[key]}» is not the name of the file`);
  }
}
const sources = Object.fromEntries(Object.values(documents).filter((d) => typeof d.datasources === 'string').map((d) => [d.datasources, d.sources ?? {}]));
for (const [file, doc] of Object.entries(documents).filter(([f]) => f.startsWith('screens/'))) {
  for (const [name, entry] of Object.entries(doc.dataSources ?? {})) {
    if (typeof entry?.ref !== 'string') continue;
    const [document, source] = entry.ref.split('/');
    if (!sources[document]?.[source]) {
      failed++;
      console.error(`ERROR ${file}: the data source ${name} refers to ${entry.ref}, which is not in datasources/`);
    }
  }
}
// The patterns of fields and validation rules compile as the runtime compiles them (Unicode, whole value, at most 500
// characters): a broken one would make its field always invalid.
for (const [file, doc] of Object.entries(documents).filter(([f]) => f.startsWith('screens/'))) {
  const walk = (value, path) => {
    if (Array.isArray(value)) value.forEach((v, i) => walk(v, `${path}/${i}`));
    else if (value && typeof value === 'object') {
      for (const [key, v] of Object.entries(value)) {
        // messages.pattern is the text of the message, not an expression.
        if (key === 'messages') continue;
        if (key !== 'pattern' || typeof v !== 'string') walk(v, `${path}/${key}`);
        else {
          try {
            if (v.length > 500) throw new Error('longer than 500 characters');
            new RegExp(`^(?:${v})$`, 'u');
          } catch (e) {
            failed++;
            console.error(`ERROR ${file}: ${path}/pattern is not a valid regular expression (${e.message})`);
          }
        }
      }
    }
  };
  walk(doc, '');
}
const project = documents['project.json'];
for (const theme of project?.themes ?? []) {
  if (!documents[`themes/${theme}.json`]) {
    failed++;
    console.error(`ERROR project.json: the theme ${theme} is not in themes/`);
  }
}

// Translation catalogues: one per language of the project, the same keys in every language, text values only, and every
// key used by t('…') exists in the default language.
const i18nDir = join(examplesDir, 'i18n');
const catalogs = Object.fromEntries(readdirSync(i18nDir).filter((f) => f.endsWith('.json')).map((f) => [f.replace('.json', ''), JSON.parse(readFileSync(join(i18nDir, f), 'utf8'))]));
for (const language of project?.languages ?? []) {
  if (!catalogs[language]) {
    failed++;
    console.error(`ERROR project.json: the language ${language} has no catalogue in i18n/`);
  }
}
const base = new Set(Object.keys(catalogs[project?.defaultLanguage ?? 'en'] ?? {}));
for (const [locale, messages] of Object.entries(catalogs)) {
  const keys = new Set(Object.keys(messages));
  const missing = [...base].filter((k) => !keys.has(k));
  const extra = [...keys].filter((k) => !base.has(k));
  const notText = Object.entries(messages).filter(([, v]) => typeof v !== 'string').map(([k]) => k);
  if (missing.length || extra.length || notText.length) {
    failed++;
    console.error(`ERROR i18n/${locale}.json`);
    missing.forEach((k) => console.error(`  missing key ${k}`));
    extra.forEach((k) => console.error(`  key not in the default language: ${k}`));
    notText.forEach((k) => console.error(`  the value of ${k} is not a string`));
  } else {
    console.log(`OK    i18n/${locale}.json (${keys.size} keys)`);
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
  console.error('ERROR keys used with t() but missing from the catalogue of the default language:');
  unknown.forEach((k) => console.error(`  ${k}`));
}
process.exit(failed ? 1 : 0);
