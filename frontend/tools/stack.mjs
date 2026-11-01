// Starts the whole development stack, with the real login, in one command:
//   Keycloak (Docker) → authorization, telemetry, BFF (Java jars) → demo back end → runtime (4200) behind the BFF,
//   with the example project from its files.
//
//   npm run stack [-- --services-only] [-- --rebuild]
//
// --services-only  does not start the runtime (to start it separately, for example from the IDE)
// --rebuild        rebuilds the jars even if they already exist
//
// Quadrava CE has no registry: the BFF forwards /registry to LOWCODE_REGISTRY_URL (http://localhost:8081 if absent), so a
// registry that follows contracts/registry.yaml can be started next to the stack. The logs of every process are in
// ../.stack/logs. Ctrl+C stops everything except Keycloak, which stays up to restart quickly
// (to stop it: cd idp && docker compose down). For local development only.
import { spawn, spawnSync } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const frontend = join(here, '..');
const root = join(frontend, '..');
const reference = join(root, 'reference');
const logs = join(root, '.stack', 'logs');
const flags = new Set(process.argv.slice(2));
const windows = process.platform === 'win32';
const children = [];

const say = (text) => console.log(`[stack] ${text}`);
const fail = (text) => {
  console.error(`[stack] ${text}`);
  stop(1);
};

function stop(code = 0) {
  for (const child of children) if (child.exitCode === null) child.kill();
  process.exit(code);
}
process.on('SIGINT', () => {
  say('stopping the processes (Keycloak stays up: cd idp && docker compose down to stop it)');
  stop(0);
});

/** Starts a process with its log in .stack/logs/<name>.log; if it ends by itself, says so. */
function start(name, command, args, cwd) {
  const log = createWriteStream(join(logs, `${name}.log`), { flags: 'w' });
  const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  child.stdout.pipe(log);
  child.stderr.pipe(log);
  child.on('exit', (code) => {
    if (code !== null && code !== 0) say(`${name} ended (code ${code}): see .stack/logs/${name}.log`);
  });
  children.push(child);
  return child;
}

/** Waits until an address answers (any HTTP response, 401 included: the service is up). */
async function ready(name, url, seconds = 120) {
  const until = Date.now() + seconds * 1000;
  while (Date.now() < until) {
    try {
      await fetch(url, { signal: AbortSignal.timeout(2000) });
      say(`${name} ready`);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  fail(`${name} does not answer on ${url} after ${seconds} seconds: see .stack/logs`);
}

function run(command, args, cwd) {
  // On Windows npm, mvn and docker are .cmd files and need the shell; an executable with an absolute path (node) does
  // not: through the shell a path with spaces («C:\Program Files\…») would be split.
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', shell: windows && !isAbsolute(command) });
  if (result.status !== 0) fail(`command failed: ${command} ${args.join(' ')}`);
}

const jar = (module) => {
  const dir = join(reference, module, 'target');
  const file = existsSync(dir) ? readdirSync(dir).find((f) => f.endsWith('-SNAPSHOT.jar')) : undefined;
  return file ? join(dir, file) : null;
};

mkdirSync(logs, { recursive: true });

// 1. Keycloak
say('starting Keycloak (Docker)…');
if (spawnSync('docker', ['version'], { stdio: 'ignore', shell: windows }).status !== 0) fail('Docker is not available: start Docker Desktop');
run('docker', ['compose', 'up', '-d'], join(root, 'idp'));
await ready('Keycloak', 'http://localhost:8180/realms/quadrava/.well-known/openid-configuration', 180);

// 2. Java services
const modules = ['authz', 'telemetry', 'bff'];
if (flags.has('--rebuild') || modules.some((m) => !jar(m))) {
  say('building the Java services (mvn package)…');
  run('mvn', ['-q', 'package', '-DskipTests'], reference);
}
start('authz', 'java', ['-jar', jar('authz')], reference);
start('telemetry', 'java', ['-jar', jar('telemetry')], reference);
start('bff', 'java', ['-jar', jar('bff')], reference);
start('demo-api', process.execPath, [join(here, 'demo-api.mjs')], frontend);
await Promise.all([
  ready('authorization', 'http://localhost:8082/actuator/health'),
  ready('telemetry', 'http://localhost:8083/actuator/health'),
  ready('BFF', 'http://localhost:8080/actuator/health'),
  ready('demo back end', 'http://localhost:8084/'),
]);

// 3. Runtime behind the BFF
if (!flags.has('--services-only')) {
  if (!existsSync(join(frontend, 'dist', 'components'))) {
    say('building the libraries (build:libs)…');
    run('npm', ['run', 'build:libs'], frontend);
  }
  run(process.execPath, [join(here, 'copy-examples.mjs')], frontend);
  const ng = join(frontend, 'node_modules', '@angular', 'cli', 'bin', 'ng.js');
  start('runtime', process.execPath, [ng, 'serve', 'runtime', '--port', '4200', '-c', 'bff'], frontend);
  await ready('runtime', 'http://localhost:4200/', 300);
}

say('all ready:');
console.log(`
  Runtime   http://localhost:4200   (login: operator, manager or administrator; password = user name)
  Keycloak  http://localhost:8180   (console: admin / admin)
  Logs      .stack/logs/

  Ctrl+C to stop.
`);
