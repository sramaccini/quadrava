// Publishes the example project (../examples) into a registry with the Quadrava CLI (`quadrava publish`, built by
// this script first): every screen, data sources document, navigation, theme and translation catalogue as separate
// documents (contracts/registry.yaml 0.6), after checking the project. Used to try the runtime that loads from the registry.
//
//   node tools/publish-examples.mjs [--registry http://localhost:8081] [--app demo] [--env development]
//                                   [--token <JWT> | --user <user> --password <password> [--issuer <realm>]]
//
// With the reference registry started with the no-auth profile no token is needed. With --user and --password the script
// asks Keycloak for the token with the development client quadrava-tools (local realm only), and gives it to the CLI in
// QUADRAVA_TOKEN.
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .reduce((pairs, value, i, all) => (value.startsWith('--') ? [...pairs, [value.slice(2), all[i + 1]]] : pairs), []),
);
let token = args.token;
if (!token && args.user) {
  const issuer = (args.issuer ?? 'http://localhost:8180/realms/quadrava').replace(/\/+$/, '');
  const response = await fetch(`${issuer}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'password', client_id: 'quadrava-tools', username: args.user, password: args.password ?? '' }),
  });
  if (!response.ok) {
    console.error(`No token from ${issuer}: HTTP ${response.status}`);
    process.exit(1);
  }
  token = (await response.json()).access_token;
}

const here = dirname(fileURLToPath(import.meta.url));
// The CLI is built first: the examples are published with the checks of the current sources.
const built = spawnSync(process.execPath, [join(here, '../projects/cli/build.mjs')], { stdio: 'inherit' });
if (built.status !== 0) process.exit(built.status ?? 1);
const cli = join(here, '../dist/cli/bin/quadrava.mjs');
const command = ['publish', join(here, '../../examples'), '--registry', args.registry ?? 'http://localhost:8081', '--app', args.app ?? 'demo', '--env', args.env ?? 'development'];
const result = spawnSync(process.execPath, [cli, ...command], { stdio: 'inherit', env: { ...process.env, QUADRAVA_TOKEN: token ?? '' } });
process.exit(result.status ?? 1);
