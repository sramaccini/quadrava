// Copies the example project (../examples) into the public folder of the runtime, so the runtime loads it over HTTP. It
// also writes examples/index.json with the list of screens, examples/themes/index.json with the list of themes and
// examples/files.json with every JSON file of the project (Quadrava Studio opens the demo project from the runtime web
// build with it).
import { cpSync, rmSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = join(here, '../../examples');
const names = (dir) =>
  readdirSync(join(source, dir))
    .filter((file) => file.endsWith('.json'))
    .map((file) => file.replace(/\.json$/, ''))
    .sort();
const screens = names('screens');
const themes = names('themes');
/** The JSON files of the project, with their path from its folder (the images and the other assets are not resources). */
const files = (dir = '') =>
  readdirSync(join(source, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = dir ? `${dir}/${entry.name}` : entry.name;
    return entry.isDirectory() ? files(path) : entry.name.endsWith('.json') ? [path] : [];
  });
const projectFiles = files().sort();

const target = join(here, '../projects/runtime/public/examples');
// On Windows a dev server still running can hold the folder for a moment: a few retries before giving up.
rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
mkdirSync(target, { recursive: true });
cpSync(source, target, { recursive: true, dereference: true });
writeFileSync(join(target, 'index.json'), JSON.stringify(screens, null, 2) + '\n');
writeFileSync(join(target, 'themes', 'index.json'), JSON.stringify(themes, null, 2) + '\n');
writeFileSync(join(target, 'files.json'), JSON.stringify(projectFiles, null, 2) + '\n');
console.log('Examples copied to projects/runtime/public/examples');
