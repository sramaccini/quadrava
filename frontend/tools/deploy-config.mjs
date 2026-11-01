// Writes the settings of a published runtime from environment variables, before `ng build`. Meant for static hosting
// (for example Render).
//
//   RUNTIME_STUDIO_ORIGINS=https://studio.example[,…]      → studio.origins in projects/runtime/public/runtime-config.json
//                                                           (the Studios allowed to open this runtime with «Run
//                                                           project», ADR-16; they replace the development ones)
//
// Usage: node tools/deploy-config.mjs   Without the variable it changes nothing.
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
