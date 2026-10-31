// Checks that a release is consistent (ADR-20): one semantic version in the package of the workspace, in its lock file
// and in every library, and a section for it in CHANGELOG.md. With a tag, the tag must be `v` followed by that version.
//
// Usage: node tools/release.mjs [--tag v1.2.3] [--notes <file>]
//   --tag    the tag being released (the release workflow passes the one that started it)
//   --notes  writes the changelog section of the version to the file, for the notes of the GitHub release
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const here = dirname(fileURLToPath(import.meta.url));
const frontend = join(here, '..');
const { values } = parseArgs({ options: { tag: { type: 'string' }, notes: { type: 'string' } } });

// Semantic Versioning 2.0.0, without build metadata.
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$/;

const problems = [];
const read = (file) => JSON.parse(readFileSync(file, 'utf8'));

const workspace = read(join(frontend, 'package.json'));
const version = workspace.version;
if (!SEMVER.test(version ?? '')) problems.push(`package.json: not a semantic version: ${version}`);

const lock = read(join(frontend, 'package-lock.json'));
if (lock.version !== version || lock.packages?.['']?.version !== version) problems.push(`package-lock.json: ${lock.version}, expected ${version} (npm install)`);

const projects = join(frontend, 'projects');
for (const project of readdirSync(projects)) {
  const file = join(projects, project, 'package.json');
  if (!existsSync(file)) continue;
  const library = read(file).version;
  if (library !== version) problems.push(`projects/${project}/package.json: ${library}, expected ${version}`);
}

if (values.tag !== undefined && values.tag !== `v${version}`) problems.push(`tag ${values.tag} does not match the version ${version} (expected v${version})`);

// The section of the version: from its heading to the next one of the same level.
const changelog = readFileSync(join(frontend, '..', 'CHANGELOG.md'), 'utf8').split('\n');
const heading = changelog.findIndex((line) => new RegExp(`^## \\[${version.replace(/\./g, '\\.')}\\] - \\d{4}-\\d{2}-\\d{2}$`).test(line));
let notes = '';
if (heading < 0) {
  problems.push(`CHANGELOG.md: no section «## [${version}] - YYYY-MM-DD»`);
} else {
  const next = changelog.findIndex((line, i) => i > heading && line.startsWith('## '));
  notes = changelog.slice(heading + 1, next < 0 ? undefined : next).join('\n').trim();
  if (!notes) problems.push(`CHANGELOG.md: the section of ${version} is empty`);
}

if (problems.length) {
  for (const problem of problems) console.error(problem);
  process.exit(1);
}
if (values.notes) writeFileSync(values.notes, notes + '\n');
console.log(`Release ${version}: versions and changelog consistent`);
