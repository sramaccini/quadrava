// Puts the runtime inside the web build of Studio for the desktop app (ADR-17): «Run project» opens it in a second window
// of the app, at /runtime/, on the same origin as Studio. Run after `ng build editor` and
// `ng build runtime --base-href /runtime/ --output-path dist/runtime-desktop`; then `tauri build`.
// The runtime accepts the project only from the origins of Studio in the app (studio.origins of its runtime-config.json):
// tauri://localhost on macOS and Linux, http(s)://tauri.localhost on Windows.
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = join(here, '../dist/runtime-desktop/browser');
const studio = join(here, '../dist/editor/browser');
const target = join(studio, 'runtime');
for (const [path, what] of [
  [source, 'the runtime for the app (ng build runtime --base-href /runtime/ --output-path dist/runtime-desktop)'],
  [studio, 'Studio (ng build editor)'],
]) {
  if (!existsSync(path)) {
    console.error(`Missing ${what}: ${path}`);
    process.exit(1);
  }
}
rmSync(target, { recursive: true, force: true });
cpSync(source, target, { recursive: true });
const configFile = join(target, 'runtime-config.json');
const config = JSON.parse(readFileSync(configFile, 'utf8'));
config.studio = { origins: ['tauri://localhost', 'http://tauri.localhost', 'https://tauri.localhost'] };
writeFileSync(configFile, JSON.stringify(config, null, 2) + '\n');
console.log(`Runtime for the desktop app in ${target}`);
