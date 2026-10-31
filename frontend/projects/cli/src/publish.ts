import type { Kind, ProjectDocument } from './validate';

export interface PublishOptions {
  /** Address of the registry service (contracts/registry.yaml), for example `https://registry.example`. */
  registry: string;
  app: string;
  env: string;
  /** Bearer token; without it only a registry without authentication accepts the calls. */
  token?: string;
  log: (line: string) => void;
}

/** The data sources first, since the screens refer to them; the manifest is not a registry document. */
const ORDER: Kind[] = ['datasources', 'screen', 'navigation', 'theme', 'messages'];

/** The registry document kind of a project document. */
const REGISTRY_KIND: Partial<Record<Kind, string>> = { datasources: 'datasources', screen: 'screen', navigation: 'navigation', theme: 'theme', messages: 'messages' };

/**
 * Saves a version of every document and publishes it in the environment (contracts/registry.yaml 0.6): one document
 * after the other, carrying on after a failure. Returns how many failed. Protected environments accept approved
 * versions only, so publishing there fails until a reviewer approves them.
 */
export async function publishProject(documents: ProjectDocument[], options: PublishOptions): Promise<number> {
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json', ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}) };
  const registry = options.registry.replace(/\/+$/, '');
  const ordered = ORDER.flatMap((kind) => documents.filter((d) => d.kind === kind));
  let failed = 0;
  for (const { kind, id, doc, file } of ordered) {
    const base = `${registry}/registry/apps/${encodeURIComponent(options.app)}/documents/${REGISTRY_KIND[kind]}/${encodeURIComponent(id)}`;
    try {
      const saved = await fetch(`${base}/versions`, { method: 'POST', headers, body: JSON.stringify(doc) });
      if (!saved.ok) throw new Error(`save: ${await failure(saved)}`);
      const { hash } = (await saved.json()) as { hash: string };
      const published = await fetch(`${base}/published?env=${encodeURIComponent(options.env)}`, { method: 'PUT', headers, body: JSON.stringify({ hash }) });
      if (!published.ok) throw new Error(`publish: ${await failure(published)}`);
      options.log(`published  ${file} (${kind} ${id}, ${hash.slice(0, 10)})`);
    } catch (e) {
      failed++;
      options.log(`FAILED     ${file} (${kind} ${id}): ${e instanceof Error ? e.message : e}`);
    }
  }
  return failed;
}

/** The status and, for a Problem, its title: never the whole body. */
async function failure(response: Response): Promise<string> {
  try {
    const problem = (await response.json()) as { title?: unknown };
    if (typeof problem.title === 'string') return `HTTP ${response.status} ${problem.title}`;
  } catch {
    // Not JSON: the status is enough.
  }
  return `HTTP ${response.status}`;
}
