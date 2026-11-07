// Runs the conformance kits of the reference services against the local stack (npm run stack -- --services-only, or the
// CI job «conformance»): authorization, telemetry and BFF, with the users of the development realm (password = user
// name). Quadrava CE has no registry: its kit (conformance:registry) runs against a registry started separately.
//
//   npm run conformance
//
// Exits with code 1 if a kit fails. For local development and CI only.
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const kits = [
  ['authz', ['--authz', 'http://localhost:8082', '--app', 'demo', '--user', 'operator', '--password', 'operator', '--other-user', 'manager', '--other-password', 'manager']],
  ['telemetry', ['--telemetry', 'http://localhost:8083', '--user', 'operator', '--password', 'operator']],
  ['bff', ['--bff', 'http://localhost:8080', '--return', 'http://localhost:4200/', '--user', 'administrator', '--password', 'administrator']],
];

const failed = [];
for (const [name, args] of kits) {
  console.log(`\n=== ${name}`);
  const result = spawnSync(process.execPath, [join(here, `conformance-${name}.mjs`), ...args], { stdio: 'inherit' });
  if (result.status !== 0) failed.push(name);
}
console.log(failed.length ? `\nKits failed: ${failed.join(', ')}.` : '\nAll the kits passed.');
process.exit(failed.length ? 1 : 0);
