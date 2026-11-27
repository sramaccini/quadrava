// Tests of the Quadrava CLI as its users run it: the built command (npm run cli:build) on copies of the example project,
// and a fake registry for publishing. Run with: npm run cli:test
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { strToU8, zipSync } from 'fflate';

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

  it('reports a navigation the runtime would refuse: a default that is not an area, an unknown screen', async () => {
    const dir = project((d) =>
      change(d, 'navigation.json', (n) => ({ ...n, default: 'invoice-list', settings: [...(n.settings ?? []), { id: 'nowhere', label: 'Nowhere', screen: 'no-such-screen' }] })),
    );
    const { code, stderr } = await run(['validate', dir]);
    assert.equal(code, 1);
    assert.match(stderr, /navigation\.json \/default: unknown default area "invoice-list"/);
    assert.match(stderr, /navigation\.json \/settings\/\d+\/screen: unknown screen "no-such-screen"/);
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

  it('reports the screens opened by navigate (steps and breadcrumb) that are not in screens/', async () => {
    const dir = project((d) =>
      change(d, 'screens/order-list.json', (s) => ({
        ...s,
        breadcrumb: [{ label: 'Home', navigate: 'no-such-home' }, { label: 'Orders' }],
        components: [...s.components, { type: 'button', label: 'Go', onClick: [{ navigate: 'no-such-screen' }] }],
      })),
    );
    const { code, stderr } = await run(['validate', dir]);
    assert.equal(code, 1);
    assert.match(stderr, /order-list\.json \/breadcrumb\/0\/navigate: opens the screen «no-such-home», which is not in screens\//);
    assert.match(stderr, /order-list\.json \/components\/\d+\/onClick\/0\/navigate: opens the screen «no-such-screen», which is not in screens\//);
  });

  it('reports a data source named by a screen that the screen does not declare', async () => {
    const dir = project((d) => change(d, 'screens/order-list.json', (s) => ({ ...s, components: [...s.components, { type: 'table', source: 'nowhere', columns: [{ field: 'id', label: 'Id' }] }] })));
    const { code, stderr } = await run(['validate', dir]);
    assert.equal(code, 1);
    assert.match(stderr, /screens\/order-list\.json \/components\/\d+\/source: uses the data source «nowhere»/);
  });

  it('checks the asset packs of assets/: the schema and the name of the file', async () => {
    const dir = project((d) => {
      change(d, 'assets/logistics.json', (p) => ({ ...p, icons: { ...p.icons, bad: { viewBox: '0 0 24 24', paths: ['<path/>'] } } }));
      writeJson(d, 'assets/other.json', { ...readJson(d, 'assets/logistics.json'), icons: {} });
    });
    const { code, stderr } = await run(['validate', dir]);
    assert.equal(code, 1);
    assert.match(stderr, /assets\/logistics\.json \/icons\/bad\/paths\/0/);
    assert.match(stderr, /assets\/other\.json: the identifier «logistics» is not the name of the file/);
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
    // The asset packs before the screens that name their icons.
    assert.ok(kinds.includes('assets') && kinds.lastIndexOf('assets') < kinds.indexOf('screen'));
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

describe('quadrava assets', () => {
  const svg = (body, attributes = 'viewBox="0 0 24 24"') => `<svg xmlns="http://www.w3.org/2000/svg" ${attributes}>${body}</svg>`;
  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  /** A zip of a pack, pack.json and the files, in a folder of its own. */
  function zip(descriptor, files) {
    const dir = mkdtempSync(join(tmpdir(), 'quadrava-pack-'));
    temporary.push(dir);
    const entries = { 'pack.json': strToU8(JSON.stringify(descriptor)) };
    for (const [name, content] of Object.entries(files)) entries[name] = typeof content === 'string' ? strToU8(content) : content;
    const file = join(dir, 'acme.zip');
    writeFileSync(file, zipSync(entries));
    return file;
  }
  const acme = (icons, images = {}) => ({ name: 'acme', version: '1.2.0', license: 'MIT', icons, images });
  const broken = {
    'line.svg': svg('<path d="M2 12h20" fill="none" stroke="#000" stroke-width="2"/>'),
    'text.svg': svg('<text x="0" y="12">A</text>'),
    'fake.png': '<svg/>',
  };

  it('assets add writes the pack cleaned: shapes as paths, transforms applied, scripts and colours gone', async () => {
    const dir = project();
    const file = zip(acme({ truck: { file: 'icons/truck.svg', filled: 'icons/truck-filled.svg', keywords: ['delivery'] }, box: { file: 'icons/box.svg' } }, { logo: { file: 'logo.png', alt: 'ACME' } }), {
      'icons/truck.svg': svg('<script>alert(1)</script><g transform="translate(2 2)"><rect width="10" height="8" fill="#f00"/><circle cx="16" cy="16" r="2"/></g>'),
      'icons/truck-filled.svg': svg('<path d="M0 0h24v24H0z"/>'),
      'icons/box.svg': svg('<path fill-rule="evenodd" d="M2 2h20v20H2z M4 4v16h16V4z"/>', 'width="24" height="24"'),
      'logo.png': PNG,
    });
    const { code, stdout, stderr } = await run(['assets', 'add', file, dir]);
    assert.equal(code, 0, stdout + stderr);
    assert.match(stdout, /assets\/acme\.json written: 2 icons, 1 images \(acme 1\.2\.0, MIT\)/);
    const pack = readJson(dir, 'assets/acme.json');
    assert.equal(pack.assets, 'acme');
    assert.equal(pack.icons.truck.viewBox, '0 0 24 24');
    assert.ok(pack.icons.truck.paths.every((d) => /^[MmLlHhVvCcSsQqTtAaZz0-9eE.,+\- ]+$/.test(d)));
    assert.ok(!JSON.stringify(pack).includes('alert'));
    assert.deepEqual(pack.icons.truck.keywords, ['delivery']);
    assert.equal(pack.icons.truck.filled.paths.length, 1);
    assert.equal(pack.icons.box.viewBox, '0 0 24 24');
    assert.equal(pack.icons.box.fillRule, 'evenodd');
    assert.deepEqual(pack.images.logo, { type: 'image/png', data: Buffer.from(PNG).toString('base64'), alt: 'ACME' });
    // Added again: the pack of the same name is replaced.
    assert.match((await run(['assets', 'add', file, dir])).stdout, /replaced/);
  });

  it('assets add refuses a path out of the zip and a file that is not there, and writes nothing', async () => {
    const dir = project();
    const outside = await run(['assets', 'add', zip(acme({ up: { file: '../up.svg' } }), {}), dir]);
    assert.equal(outside.code, 1);
    assert.match(outside.stderr, /icons\/up\/file: the path of a file of the zip/);
    const missing = await run(['assets', 'add', zip(acme({ gone: { file: 'missing.svg' } }), {}), dir]);
    assert.equal(missing.code, 1);
    assert.match(missing.stderr, /missing\.svg: named in pack\.json but not in the zip/);
    assert.ok(!existsSync(join(dir, 'assets/acme.json')));
  });

  it('assets add refuses what cannot become geometry or is not what it says', async () => {
    const dir = project();
    const { code, stderr } = await run(['assets', 'add', zip(acme({ line: { file: 'line.svg' }, text: { file: 'text.svg' } }, { fake: { file: 'fake.png' } }), broken), dir]);
    assert.equal(code, 1);
    assert.match(stderr, /line\.svg: strokes/);
    assert.match(stderr, /text\.svg: the element text cannot become geometry/);
    assert.match(stderr, /fake\.png: the content is not image\/png/);
    assert.ok(!existsSync(join(dir, 'assets/acme.json')));
  });

  it('validate reports a pack icon that is not there, and only notes the entries nobody uses', async () => {
    const used = await run(['validate', examples]);
    assert.equal(used.code, 0);
    assert.match(used.stdout, /NOTICE assets\/logistics\.json: icons not used, left out when publishing: barcode/);
    const dir = project((d) =>
      change(d, 'screens/order-list.json', (s) => ({
        ...s,
        components: [...s.components, { type: 'button', label: 'A', icon: 'logistics/ship', onClick: [{ toast: 'A' }] }, { type: 'button', label: 'B', icon: 'nowhere/truck', onClick: [{ toast: 'B' }] }],
      })),
    );
    const { code, stderr } = await run(['validate', dir]);
    assert.equal(code, 1);
    assert.match(stderr, /order-list\.json \/components\/\d+\/icon: the pack «logistics» has no icon «ship»/);
    assert.match(stderr, /order-list\.json \/components\/\d+\/icon: the icon nowhere\/truck is from the pack «nowhere», which is not in assets\//);
  });

  it('publish sends a pack with only the entries used, and no pack that nobody uses', async () => {
    const fake = await registry();
    const { code, stdout } = await run(['publish', examples, '--registry', fake.url, '--app', 'tracker']);
    assert.equal(code, 0, stdout);
    const pack = fake.calls.find((c) => c.method === 'POST' && c.url.includes('/documents/assets/logistics/')).body;
    assert.deepEqual(Object.keys(pack.icons).sort(), ['truck', 'warehouse']);
    const unused = project((d) => change(d, 'screens/showcase-basics.json', (s) => JSON.parse(JSON.stringify(s).replaceAll('logistics/truck', 'save').replaceAll('logistics/warehouse', 'save').replaceAll('asset:logistics/parcel', '/parcel.png'))));
    const other = await registry();
    const second = await run(['publish', unused, '--registry', other.url, '--app', 'tracker']);
    assert.equal(second.code, 0, second.stdout);
    assert.match(second.stdout, /skipped +assets\/logistics\.json \(assets logistics\): no icon or image used/);
    assert.ok(!other.calls.some((c) => c.url.includes('/documents/assets/logistics/')));
    // The pack of the brand is still used, by the classic theme.
    assert.ok(other.calls.some((c) => c.url.includes('/documents/assets/brand/')));
  });
});
