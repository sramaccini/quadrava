import { Injectable, inject } from '@angular/core';
import type { Json } from './doc-ops';
import { Project, textsOf, type ProjectResource, type ResourceKind } from './project';
import { RegistryClient, RegistryError, type DocumentKind } from './registry-client';

/** Order of publication: what is referred to before what refers to it (data sources, then screens, the navigation last). */
const ORDER: ResourceKind[] = ['datasources', 'screen', 'theme', 'messages', 'navigation'];

/** The outcome of the publication of a project, resource by resource. */
export interface PublishReport {
  /** Resources saved as a new version (or already equal to the latest one). */
  saved: string[];
  /** Resources published in the environment. */
  published: string[];
  /** Resources not saved or not published, with the reason (the title of the Problem of the registry). */
  failed: { path: string; status: number; reason: string }[];
}

/**
 * Publishes a whole project in an application of the registry: every resource saved in the project (the manifest is not a
 * registry document) becomes a version of its document, starting from the latest one, and is published in the environment.
 * Catalogues become `messages` documents. In the protected environments only approved versions are published: there the
 * new versions stay to be reviewed and the report says so.
 */
@Injectable({ providedIn: 'root' })
export class ProjectPublisher {
  private readonly project = inject(Project);
  private readonly client = inject(RegistryClient);

  async publish(appId: string, env: string): Promise<PublishReport> {
    const report: PublishReport = { saved: [], published: [], failed: [] };
    const resources = this.project
      .resources()
      .filter((r) => ORDER.includes(r.kind))
      .sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
    for (const resource of resources) {
      const kind = resource.kind as DocumentKind;
      try {
        const doc = await this.content(resource);
        const id = kind === 'navigation' ? String((doc as { navigation?: unknown }).navigation ?? '') : resource.id;
        const latest = (await this.versions(appId, kind, id))[0];
        const version = await this.client.save(appId, kind, id, doc, latest?.hash ?? null);
        report.saved.push(resource.path);
        await this.client.publish(appId, kind, id, env, version.hash);
        report.published.push(resource.path);
      } catch (e) {
        report.failed.push({ path: resource.path, status: e instanceof RegistryError ? e.status : 0, reason: e instanceof Error ? e.message : String(e) });
      }
    }
    return report;
  }

  /** The document of a resource as the registry wants it: a catalogue becomes a `messages` document. */
  private async content(resource: ProjectResource): Promise<Json> {
    const doc = await this.project.read(resource.path);
    return resource.kind === 'messages' ? { schemaVersion: '1.0', messages: resource.id, texts: textsOf(doc) } : doc;
  }

  /** The versions of a document; none if it is not in the registry yet. */
  private async versions(appId: string, kind: DocumentKind, id: string) {
    try {
      return await this.client.versions(appId, kind, id);
    } catch (e) {
      if (e instanceof RegistryError && e.status === 404) return [];
      throw e;
    }
  }
}
