import type { AssetsDefinition } from '../../schema/src/public-api';
import { usedAssets, type Kind, type ProjectDocument } from './validate';

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
const ORDER: Kind[] = ['datasources', 'assets', 'screen', 'navigation', 'theme', 'messages'];

/** The registry document kind of a project document. */
const REGISTRY_KIND: Partial<Record<Kind, string>> = { datasources: 'datasources', screen: 'screen', navigation: 'navigation', theme: 'theme', messages: 'messages', assets: 'assets' };

/**
 * Saves a version of every document and publishes it in the environment (contracts/registry.yaml 0.8): one document
 * after the other, carrying on after a failure. Returns how many were published and how many failed. The protected environments of a registry, if
 * it has any, accept approved versions only, so publishing there fails until a reviewer approves them. An asset pack is
 * published with only the icons and images that the project uses (ADR-29), and not at all when it uses none.
 */
export async function publishProject(documents: ProjectDocument[], options: PublishOptions): Promise<{ published: number; failed: number }> {
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json', ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}) };
  const registry = options.registry.replace(/\/+$/, '');
  const ordered = ORDER.flatMap((kind) => documents.filter((d) => d.kind === kind));
  const used = usedAssets(documents);
  let failed = 0;
  let published = 0;
  for (const document of ordered) {
    const { kind, id, file } = document;
    let doc = document.doc;
    if (kind === 'assets') {
      doc = prunePack(doc as AssetsDefinition, used.get(id));
      if (doc === null) {
        options.log(`skipped    ${file} (assets ${id}): no icon or image used`);
        continue;
      }
    }
    const base = `${registry}/registry/apps/${encodeURIComponent(options.app)}/documents/${REGISTRY_KIND[kind]}/${encodeURIComponent(id)}`;
    try {
      const saved = await fetch(`${base}/versions`, { method: 'POST', headers, body: JSON.stringify(doc) });
      if (!saved.ok) throw new Error(`save: ${await failure(saved)}`);
      const { hash } = (await saved.json()) as { hash: string };
      const publication = await fetch(`${base}/published?env=${encodeURIComponent(options.env)}`, { method: 'PUT', headers, body: JSON.stringify({ hash }) });
      if (!publication.ok) throw new Error(`publish: ${await failure(publication)}`);
      published++;
      options.log(`published  ${file} (${kind} ${id}, ${hash.slice(0, 10)})`);
    } catch (e) {
      failed++;
      options.log(`FAILED     ${file} (${kind} ${id}): ${e instanceof Error ? e.message : e}`);
    }
  }
  return { published, failed };
}

/** The pack with only the entries used; null when none is. */
function prunePack(pack: AssetsDefinition, used: { icons: Set<string>; images: Set<string> } | undefined): AssetsDefinition | null {
  const keep = <T>(entries: Record<string, T> | undefined, names: Set<string> | undefined) =>
    Object.fromEntries(Object.entries(entries ?? {}).filter(([name]) => names?.has(name)));
  const icons = keep(pack.icons, used?.icons);
  const images = keep(pack.images, used?.images);
  if (!Object.keys(icons).length && !Object.keys(images).length) return null;
  const pruned: AssetsDefinition = { ...pack, icons, images };
  if (!Object.keys(icons).length) delete pruned.icons;
  if (!Object.keys(images).length) delete pruned.images;
  return pruned;
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
