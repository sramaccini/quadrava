// Builds the Quadrava CLI into dist/cli, ready for `npm publish` (ADR-20): one file with everything it needs (the
// precompiled schema validators, the CEL engine), so the package has no dependencies; the licence texts of the
// bundled packages go into THIRD-PARTY-NOTICES.md, as their licences require.
//
// Usage: node projects/cli/build.mjs
import { build } from 'esbuild';
import { copyFileSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const frontend = join(here, '../..');
const out = join(frontend, 'dist/cli');
const pkg = JSON.parse(readFileSync(join(here, 'package.json'), 'utf8'));

rmSync(out, { recursive: true, force: true });
const result = await build({
  entryPoints: [join(here, 'src/main.ts')],
  outfile: join(out, 'bin/quadrava.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  banner: { js: '#!/usr/bin/env node' },
  define: { QUADRAVA_VERSION: JSON.stringify(pkg.version) },
  metafile: true,
  logLevel: 'warning',
});

// The packages that ended up in the bundle, from the inputs of the build.
const LICENCE_FILE = /^(licen[cs]e|copying|notice)(\.(md|txt|markdown))?$/i;
const bundled = new Map();
for (const input of Object.keys(result.metafile.inputs)) {
  const match = /node_modules\/((?:@[^/]+\/)?[^/]+)\//.exec(input);
  if (!match || bundled.has(match[1])) continue;
  const dir = join(frontend, 'node_modules', match[1]);
  const meta = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  const texts = readdirSync(dir).filter((f) => LICENCE_FILE.test(f)).sort().map((f) => readFileSync(join(dir, f), 'utf8').replace(/\r\n/g, '\n').trim());
  bundled.set(match[1], { version: meta.version, licence: meta.license, texts });
}
const notices = [
  '# Third-party notices',
  '',
  `The Quadrava CLI ${pkg.version} bundles these packages, under their own licences:`,
  '',
  ...[...bundled].sort(([a], [b]) => a.localeCompare(b)).flatMap(([name, { version, licence, texts }]) => [`## ${name} ${version}`, '', `Licence: ${licence}`, '', ...texts.flatMap((t) => ['```', t, '```', ''])]),
];
writeFileSync(join(out, 'THIRD-PARTY-NOTICES.md'), notices.join('\n'));

// The package: its manifest, its README and the licence files of the repository.
writeFileSync(join(out, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
copyFileSync(join(here, 'README.md'), join(out, 'README.md'));
for (const file of ['LICENSE', 'NOTICE']) copyFileSync(join(frontend, '..', file), join(out, file));
console.log(`Quadrava CLI ${pkg.version} built in dist/cli (bundled: ${[...bundled.keys()].join(', ') || 'nothing'})`);
