// Writes the settings of a published Studio and runtime that know each other («Run project», ADR-16), from environment
// variables, before `ng build`. Meant for static hosting (for example Render): each site sets its own variable.
//
//   STUDIO_RUNTIME_ADDRESS=https://runtime.example/        → projects/editor/public/studio-config.json
//                                                           (the runtime Studio opens, for every visitor)
//   STUDIO_REGISTRY=off                                    → registry: false in studio-config.json (on: true)
//                                                           (saving to and opening from the registry in Studio)
//   RUNTIME_STUDIO_ORIGINS=https://studio.example[,…]      → studio.origins in projects/runtime/public/runtime-config.json
//                                                           (the Studios allowed to open this runtime; they replace the
//                                                           development ones)
//
// Usage: node tools/deploy-config.mjs   Without either variable it changes nothing.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** An http(s) URL, or the process stops with a message: a wrong deployment must not build quietly. */
function httpUrl(value, name) {
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    url = null;
  }
  if (!url || (url.protocol !== 'http:' && url.protocol !== 'https:')) {
    console.error(`${name}: not an http(s) address: ${value}`);
    process.exit(1);
  }
  return url;
}

const studio = {};
const runtimeAddress = process.env.STUDIO_RUNTIME_ADDRESS?.trim();
if (runtimeAddress) {
  studio.runtimeAddress = httpUrl(runtimeAddress, 'STUDIO_RUNTIME_ADDRESS').toString();
  console.log(`Studio opens the runtime at ${studio.runtimeAddress}`);
}
const registry = process.env.STUDIO_REGISTRY?.trim().toLowerCase();
if (registry) {
  if (!['on', 'off', 'true', 'false'].includes(registry)) {
    console.error(`STUDIO_REGISTRY: on or off, not ${registry}`);
    process.exit(1);
  }
  studio.registry = registry === 'on' || registry === 'true';
  console.log(`Studio: registry ${studio.registry ? 'on' : 'off'}`);
}
if (Object.keys(studio).length) {
  writeFileSync(join(here, '../projects/editor/public/studio-config.json'), JSON.stringify(studio, null, 2) + '\n');
}

const studioOrigins = process.env.RUNTIME_STUDIO_ORIGINS?.trim();
if (studioOrigins) {
  // Only the origin counts (scheme, host, port): a path or a trailing slash would never match.
  const origins = studioOrigins.split(',').filter((o) => o.trim()).map((o) => httpUrl(o, 'RUNTIME_STUDIO_ORIGINS').origin);
  const file = join(here, '../projects/runtime/public/runtime-config.json');
  const config = JSON.parse(readFileSync(file, 'utf8'));
  config.studio = { origins };
  writeFileSync(file, JSON.stringify(config, null, 2) + '\n');
  console.log(`The runtime accepts the project from ${origins.join(', ')}`);
}
