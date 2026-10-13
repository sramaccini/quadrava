// Avvia in un comando tutto lo stack di sviluppo con il login vero:
//   Keycloak (Docker) → registro, autorizzazioni, telemetria, BFF (jar Java) → backend della demo → esempi pubblicati
//   → runtime (4200) ed editor (4201) dietro il BFF.
//
//   npm run stack [-- --solo-servizi] [-- --ricompila]
//
// --solo-servizi  non avvia runtime ed editor (per avviarli a parte, per esempio dall'IDE)
// --ricompila     ricompila i jar anche se ci sono già
//
// Il registro tiene i dati in ../data/registry (sopravvivono al riavvio). I log di ogni processo sono in
// ../.stack/logs. Ctrl+C ferma tutto tranne Keycloak, che resta acceso per ripartire in fretta
// (per fermarlo: cd idp && docker compose down). Solo per lo sviluppo locale.
import { spawn, spawnSync } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
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
  say('fermo i processi (Keycloak resta acceso: cd idp && docker compose down per fermarlo)');
  stop(0);
});

/** Avvia un processo con il log in .stack/logs/<nome>.log; se termina da solo, lo dice. */
function start(name, command, args, cwd) {
  const log = createWriteStream(join(logs, `${name}.log`), { flags: 'w' });
  const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  child.stdout.pipe(log);
  child.stderr.pipe(log);
  child.on('exit', (code) => {
    if (code !== null && code !== 0) say(`${name} è terminato (codice ${code}): vedi .stack/logs/${name}.log`);
  });
  children.push(child);
  return child;
}

/** Aspetta che un indirizzo risponda (qualunque risposta HTTP, anche 401: il servizio è su). */
async function ready(name, url, seconds = 120) {
  const until = Date.now() + seconds * 1000;
  while (Date.now() < until) {
    try {
      await fetch(url, { signal: AbortSignal.timeout(2000) });
      say(`${name} pronto`);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  fail(`${name} non risponde su ${url} dopo ${seconds} secondi: vedi .stack/logs`);
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', shell: windows });
  if (result.status !== 0) fail(`comando non riuscito: ${command} ${args.join(' ')}`);
}

const jar = (module) => {
  const dir = join(reference, module, 'target');
  const file = existsSync(dir) ? readdirSync(dir).find((f) => f.endsWith('-SNAPSHOT.jar')) : undefined;
  return file ? join(dir, file) : null;
};

mkdirSync(logs, { recursive: true });
mkdirSync(join(root, 'data', 'registry'), { recursive: true });

// 1. Keycloak
say('avvio Keycloak (Docker)…');
if (spawnSync('docker', ['version'], { stdio: 'ignore', shell: windows }).status !== 0) fail('Docker non è disponibile: avvia Docker Desktop');
run('docker', ['compose', 'up', '-d'], join(root, 'idp'));
await ready('Keycloak', 'http://localhost:8180/realms/lowcode/.well-known/openid-configuration', 180);

// 2. Servizi Java
const modules = ['registry', 'authz', 'telemetry', 'bff'];
if (flags.has('--ricompila') || modules.some((m) => !jar(m))) {
  say('compilo i servizi Java (mvn package)…');
  run('mvn', ['-q', 'package', '-DskipTests'], reference);
}
start('registry', 'java', ['-jar', jar('registry'), `--lowcode.registry.storage-dir=${join(root, 'data', 'registry')}`], reference);
start('authz', 'java', ['-jar', jar('authz')], reference);
start('telemetry', 'java', ['-jar', jar('telemetry')], reference);
start('bff', 'java', ['-jar', jar('bff')], reference);
start('demo-api', process.execPath, [join(here, 'demo-api.mjs')], frontend);
await Promise.all([
  ready('registro', 'http://localhost:8081/actuator/health'),
  ready('autorizzazioni', 'http://localhost:8082/actuator/health'),
  ready('telemetria', 'http://localhost:8083/actuator/health'),
  ready('BFF', 'http://localhost:8080/actuator/health'),
  ready('backend della demo', 'http://localhost:8084/'),
]);

// 3. Esempi nel registro (stesso contenuto = stessa versione: ripubblicare non crea duplicati)
say('pubblico gli esempi nel registro…');
run(process.execPath, [join(here, 'publish-examples.mjs'), '--user', 'amministratore', '--password', 'amministratore'], frontend);

// 4. Runtime ed editor dietro il BFF
if (!flags.has('--solo-servizi')) {
  if (!existsSync(join(frontend, 'dist', 'components'))) {
    say('compilo le librerie (build:libs)…');
    run('npm', ['run', 'build:libs'], frontend);
  }
  run(process.execPath, [join(here, 'copy-examples.mjs')], frontend);
  const ng = join(frontend, 'node_modules', '@angular', 'cli', 'bin', 'ng.js');
  start('runtime', process.execPath, [ng, 'serve', 'runtime', '--port', '4200', '-c', 'bff'], frontend);
  start('editor', process.execPath, [ng, 'serve', 'editor', '--port', '4201', '-c', 'bff'], frontend);
  await Promise.all([ready('runtime', 'http://localhost:4200/', 300), ready('editor', 'http://localhost:4201/', 300)]);
}

say('tutto pronto:');
console.log(`
  Runtime   http://localhost:4200   (login: operatore, responsabile o amministratore; password = nome utente)
  Editor    http://localhost:4201   (pannello Registro, applicazione «demo»)
  Keycloak  http://localhost:8180   (console: admin / admin)
  Log       .stack/logs/

  Ctrl+C per fermare.
`);
