// Tests of the Quadrava CLI as its users run it: the built command (npm run cli:build) on copies of the example project,
// and a fake registry for publishing. Run with: npm run cli:test
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, '../../../dist/cli/bin/quadrava.mjs');
const examples = join(here, '../../../../examples');
const temporary = [];
after(() => temporary.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

/** Runs the command; resolves with its exit code and output. */
function run(args, env = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cli, ...args], { env: { ...process.env, QUADRAVA_TOKEN: '', ...env } });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

/** A copy of the example project, changed by `edit(folder)`. */
function project(edit = () => undefined) {
  const dir = mkdtempSync(join(tmpdir(), 'quadrava-cli-'));
  temporary.push(dir);
  cpSync(examples, dir, { recursive: true });
  edit(dir);
  return dir;
}
const readJson = (dir, file) => JSON.parse(readFileSync(join(dir, file), 'utf8'));
const writeJson = (dir, file, doc) => writeFileSync(join(dir, file), JSON.stringify(doc, null, 2));
const change = (dir, file, edit) => writeJson(dir, file, edit(readJson(dir, file)));

/** A registry that accepts everything, or answers `status` to the publications; it remembers the calls. */
async function registry(status = 204) {
  const calls = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (d) => (body += d));
    req.on('end', () => {
      calls.push({ method: req.method, url: req.url, authorization: req.headers.authorization, body: body ? JSON.parse(body) : undefined });
      if (req.method === 'POST') {
        res.writeHead(201, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ hash: 'a'.repeat(64) }));
      }
      res.writeHead(status, status === 204 ? {} : { 'Content-Type': 'application/problem+json' });
      res.end(status === 204 ? '' : JSON.stringify({ title: 'Version not approved', status }));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  after(() => server.close());
  return { url: `http://127.0.0.1:${server.address().port}`, calls };
}

describe('quadrava validate', () => {
  it('accepts the example project', async () => {
    const { code, stdout } = await run(['validate', examples]);
    assert.equal(code, 0);
    assert.match(stdout, /no problems/);
  });

  it('reports every kind of problem, with file and position, and exits with 1', async () => {
    const dir = project((d) => {
      change(d, 'screens/order-list.json', (s) => ({ ...s, title: "{{ can('x' }}" }));
      change(d, 'screens/expense-list.json', (s) => ({ ...s, screen: 'expenses' }));
      change(d, 'screens/order-detail.json', (s) => ({ ...s, unknownProperty: true }));
      change(d, 'screens/invoice-list.json', (s) => ({ ...s, description: "{{ t('no.such.key') }}" }));
      change(d, 'i18n/it.json', (c) => ({ ...c, 'only.in.italian': 'Solo in italiano' }));
      change(d, 'project.json', (p) => ({ ...p, themes: [...p.themes, 'missing-theme'] }));
      writeFileSync(join(d, 'themes/broken.json'), '{ not json');
    });
    const { code, stderr } = await run(['validate', dir]);
    assert.equal(code, 1);
    assert.match(stderr, /screens\/order-list\.json \/title: expression/);
    assert.match(stderr, /screens\/expense-list\.json: the identifier «expenses» is not the name of the file/);
    assert.match(stderr, /screens\/order-detail\.json \//);
    assert.match(stderr, /screens\/invoice-list\.json: t\('no\.such\.key'\)/);
    assert.match(stderr, /i18n\/it\.json: key not in the default language/);
    assert.match(stderr, /project\.json \/themes: the theme missing-theme/);
    assert.match(stderr, /themes\/broken\.json: not valid JSON/);
  });

  it('reports a missing manifest and a data source reference that does not resolve', async () => {
    const dir = project((d) => {
      rmSync(join(d, 'project.json'));
      rmSync(join(d, 'datasources/orders.json'));
    });
    const { code, stderr } = await run(['validate', dir]);
    assert.equal(code, 1);
    assert.match(stderr, /project\.json: missing/);
    assert.match(stderr, /refers to orders\/\w+, which is not in datasources\//);
  });

  it('reports a data source named by a screen that the screen does not declare', async () => {
    const dir = project((d) => change(d, 'screens/order-list.json', (s) => ({ ...s, components: [...s.components, { type: 'table', source: 'nowhere', columns: [{ field: 'id', label: 'Id' }] }] })));
    const { code, stderr } = await run(['validate', dir]);
    assert.equal(code, 1);
    assert.match(stderr, /screens\/order-list\.json \/components\/\d+\/source: uses the data source «nowhere»/);
  });

  it('exits with 2 for a wrong command', async () => {
    assert.equal((await run(['frobnicate'])).code, 2);
    assert.equal((await run(['validate', '--nope'])).code, 2);
    assert.equal((await run(['validate', join(examples, 'no-such-folder')])).code, 2);
    assert.equal((await run(['publish', examples, '--app', 'demo'])).code, 2);
  });
});

describe('quadrava publish', () => {
  it('saves and publishes every document, data sources first, with the token of the environment', async () => {
    const fake = await registry();
    const { code, stdout } = await run(['publish', examples, '--registry', fake.url, '--app', 'tracker', '--env', 'testing'], { QUADRAVA_TOKEN: 'test-token' });
    assert.equal(code, 0, stdout);
    const saves = fake.calls.filter((c) => c.method === 'POST');
    const publications = fake.calls.filter((c) => c.method === 'PUT');
    assert.equal(saves.length, publications.length);
    assert.ok(fake.calls.every((c) => c.authorization === 'Bearer test-token'));
    assert.ok(publications.every((c) => c.url.endsWith('/published?env=testing') && c.body.hash === 'a'.repeat(64)));
    const kinds = saves.map((c) => c.url.split('/')[5]);
    assert.equal(kinds[0], 'datasources');
    assert.ok(kinds.lastIndexOf('datasources') < kinds.indexOf('screen'));
    assert.ok(saves.every((c) => c.url.startsWith('/registry/apps/tracker/documents/')));
    // The catalogues are published as messages documents; the manifest is not a registry document.
    const english = saves.find((c) => c.url.includes('/documents/messages/en/'));
    assert.equal(english.body.messages, 'en');
    assert.equal(typeof english.body.texts, 'object');
    assert.ok(!kinds.includes('project'));
  });

  it('reads the token from the variable named by --token-env', async () => {
    const fake = await registry();
    await run(['publish', examples, '--registry', fake.url, '--app', 'tracker', '--token-env', 'CI_REGISTRY_TOKEN'], { CI_REGISTRY_TOKEN: 'other-token' });
    assert.ok(fake.calls.length && fake.calls.every((c) => c.authorization === 'Bearer other-token'));
  });

  it('carries on after a refused publication, says why, and exits with 1', async () => {
    const fake = await registry(409);
    const { code, stdout } = await run(['publish', examples, '--registry', fake.url, '--app', 'tracker', '--env', 'production']);
    assert.equal(code, 1);
    assert.match(stdout, /FAILED .*HTTP 409 Version not approved/);
    assert.ok(fake.calls.filter((c) => c.method === 'PUT').length > 1);
  });

  it('publishes nothing when the project has problems', async () => {
    const fake = await registry();
    const dir = project((d) => change(d, 'screens/order-list.json', (s) => ({ ...s, title: "{{ can('x' }}" })));
    const { code } = await run(['publish', dir, '--registry', fake.url, '--app', 'tracker']);
    assert.equal(code, 1);
    assert.equal(fake.calls.length, 0);
  });
});
