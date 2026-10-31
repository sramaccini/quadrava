import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
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
  const [command, folder = '.', ...extra] = positionals;
  if (values.help || !command) return print(USAGE);
  if (command !== 'validate' && command !== 'publish') throw new UsageError(`unknown command: ${command}`);
  if (extra.length) throw new UsageError(`one folder only, not: ${extra.join(' ')}`);
  const root = resolve(folder);
  if (!existsSync(root) || !statSync(root).isDirectory()) throw new UsageError(`not a folder: ${folder}`);

  const files = readProject(root);
  const { documents, issues } = validateProject(files);
  report(issues, files.length);
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
  const failed = await publishProject(documents, { registry, app: values.app, env, token, log: (line) => console.log(line) });
  const published = documents.filter((d) => d.kind !== 'project').length - failed;
  console.log(`${published} documents published in application «${values.app}», environment «${env}»${failed ? `, ${failed} failed` : ''}.`);
  return failed ? 1 : 0;
}

function report(issues: Issue[], files: number): void {
  for (const issue of issues) console.error(`ERROR  ${issue.file}${issue.path ? ` ${issue.path}` : ''}: ${issue.message}`);
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
