// Copies the examples (../examples) into the public folders of the runtime and editor apps, so the apps load them over HTTP.
// It also writes examples/index.json with the list of screens and examples/themes/index.json with the list of themes,
// which the editor offers to open.
import { cpSync, rmSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = join(here, '../../examples');
const screens = readdirSync(source)
  .filter((file) => file.endsWith('.json'))
  .filter((file) => 'screen' in JSON.parse(readFileSync(join(source, file), 'utf8')))
  .map((file) => file.replace(/\.json$/, ''))
  .sort();
const themes = readdirSync(join(source, 'themes'))
  .filter((file) => file.endsWith('.json'))
  .map((file) => file.replace(/\.json$/, ''))
  .sort();

for (const app of ['runtime', 'editor']) {
  const target = join(here, `../projects/${app}/public/examples`);
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  cpSync(source, target, { recursive: true, dereference: true });
  writeFileSync(join(target, 'index.json'), JSON.stringify(screens, null, 2) + '\n');
  writeFileSync(join(target, 'themes', 'index.json'), JSON.stringify(themes, null, 2) + '\n');
  console.log(`Examples copied to projects/${app}/public/examples`);
}
