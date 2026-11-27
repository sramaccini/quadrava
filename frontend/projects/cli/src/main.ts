import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { packFromZip } from './assets';
import { readProject } from './project';
import { publishProject } from './publish';
import { validateProject, type Issue } from './validate';

/** Written by the build from package.json. */
declare const QUADRAVA_VERSION: string;

const USAGE = `Quadrava CLI ${QUADRAVA_VERSION}: checks and publishes Quadrava projects (screens, data sources, navigation,
themes and translations in JSON).

Usage:
  quadrava validate [folder]
      Checks the project in the folder (default: the current one) as the runtime and Studio read it: schemas,
      identifiers, references to data sources, patterns, CEL expressions, themes, languages and catalogues.

  quadrava publish [folder] --registry <url> --app <id> [--env <environment>] [--token-env <variable>]
      Checks the project, then saves a version of every document in the registry and publishes it in the environment
      (default: development). The token is read from the environment variable QUADRAVA_TOKEN, or from the one named
      by --token-env: never from the command line.

  quadrava assets add <pack.zip> [folder]
      Imports an asset pack (ADR-29): a zip with pack.json and its SVG and image files becomes assets/<name>.json in
      the project, cleaned (icons as geometry only, images in base64). An existing pack of the same name is replaced.

  quadrava --version | --help

Exit code: 0 when everything is fine, 1 when the project has problems or a document was not published, 2 for a
wrong command.`;

class UsageError extends Error {}

async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      registry: { type: 'string' },
      app: { type: 'string' },
      env: { type: 'string' },
      'token-env': { type: 'string' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
    },
  });
  if (values.version) return print(QUADRAVA_VERSION);
  if (values.help || !positionals.length) return print(USAGE);
  if (positionals[0] === 'assets') return addAssets(positionals.slice(1));
  const [command, folder = '.', ...extra] = positionals;
  if (command !== 'validate' && command !== 'publish') throw new UsageError(`unknown command: ${command}`);
  if (extra.length) throw new UsageError(`one folder only, not: ${extra.join(' ')}`);
  const root = resolve(folder);
  if (!existsSync(root) || !statSync(root).isDirectory()) throw new UsageError(`not a folder: ${folder}`);

  const files = readProject(root);
  const { documents, issues, notices } = validateProject(files);
  report(issues, notices, files.length);
  if (issues.length) return 1;
  if (command === 'validate') return 0;

  const registry = values.registry;
  if (!registry) throw new UsageError('publish needs --registry');
  if (!/^https?:\/\/[^/]/.test(registry)) throw new UsageError(`--registry: not an http(s) address: ${registry}`);
  if (!values.app) throw new UsageError('publish needs --app');
  const tokenVariable = values['token-env'] ?? 'QUADRAVA_TOKEN';
  const token = process.env[tokenVariable] || undefined;
  if (!token) console.log(`No token in ${tokenVariable}: only a registry without authentication accepts the calls.`);
  const env = values.env ?? 'development';
  const { published, failed } = await publishProject(documents, { registry, app: values.app, env, token, log: (line) => console.log(line) });
  console.log(`${published} documents published in application «${values.app}», environment «${env}»${failed ? `, ${failed} failed` : ''}.`);
  return failed ? 1 : 0;
}

/** `assets add <zip> [folder]`: the pack of the zip, cleaned, into the assets folder of the project. */
function addAssets(args: string[]): number {
  const [subcommand, zipFile, folder = '.', ...extra] = args;
  if (subcommand !== 'add') throw new UsageError(`unknown command: assets ${subcommand ?? ''}`.trim());
  if (!zipFile) throw new UsageError('assets add needs the zip of the pack');
  if (extra.length) throw new UsageError(`one folder only, not: ${extra.join(' ')}`);
  const root = resolve(folder);
  if (!existsSync(root) || !statSync(root).isDirectory()) throw new UsageError(`not a folder: ${folder}`);
  if (!existsSync(zipFile) || !statSync(zipFile).isFile()) throw new UsageError(`not a file: ${zipFile}`);
  const { pack, issues } = packFromZip(new Uint8Array(readFileSync(zipFile)));
  for (const issue of issues) console.error(`ERROR  ${issue.file}: ${issue.message}`);
  if (!pack) {
    console.log(`${zipFile}: ${issues.length === 1 ? '1 problem' : `${issues.length} problems`}, nothing written.`);
    return 1;
  }
  mkdirSync(join(root, 'assets'), { recursive: true });
  const target = join(root, 'assets', `${pack.assets}.json`);
  const replaced = existsSync(target);
  writeFileSync(target, JSON.stringify(pack, null, 2) + '\n');
  const icons = Object.keys(pack.icons ?? {}).length;
  const images = Object.keys(pack.images ?? {}).length;
  console.log(`assets/${pack.assets}.json ${replaced ? 'replaced' : 'written'}: ${icons} icons, ${images} images (${pack.assets} ${pack.version}, ${pack.license}).`);
  return 0;
}

function report(issues: Issue[], notices: Issue[], files: number): void {
  for (const issue of issues) console.error(`ERROR  ${issue.file}${issue.path ? ` ${issue.path}` : ''}: ${issue.message}`);
  for (const notice of notices) console.log(`NOTICE ${notice.file}: ${notice.message}`);
  const problems = issues.length === 1 ? '1 problem' : `${issues.length || 'no'} problems`;
  console.log(`${files} files checked: ${problems}.`);
}

function print(text: string): number {
  console.log(text);
  return 0;
}

main(process.argv.slice(2)).then(
  (code) => (process.exitCode = code),
  (e: unknown) => {
    // A wrong option is reported by parseArgs with its own error; both are mistakes of the command.
    const usage = e instanceof UsageError || (e instanceof Error && 'code' in e && String(e.code).startsWith('ERR_PARSE_ARGS'));
    console.error(`quadrava: ${e instanceof Error ? e.message : e}${usage ? '\nquadrava --help shows the commands.' : ''}`);
    process.exitCode = usage ? 2 : 1;
  },
);
