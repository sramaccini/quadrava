import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { I18n, Notifier } from 'core';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import type { DataSourceDefinition } from 'schema';
import { getIn, isObject, toPointer, type Json, type JsonObject } from '../model/doc-ops';
import { DataSourceList, SOURCE_NAME } from '../model/datasources-store';
import { DocumentState } from '../model/document-state';
import { Project, RESOURCE_ID } from '../model/project';
import { ProjectDataSources } from '../model/project-data-sources';
import { JsonFieldComponent } from './json-field.component';
import { OpenApiImportComponent } from './openapi-import.component';

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const WITH_BODY = ['POST', 'PUT', 'PATCH'];

interface SourceView {
  name: string;
  value: JsonObject;
  /** Reference to a data source of the project (`orders/list`), or null for a data source written here. */
  ref: string | null;
  /** The definition referred to (null if the reference does not resolve). */
  target: DataSourceDefinition | null;
  hasBody: boolean;
  issues: string[];
}

/**
 * Data sources of a screen or of a data sources document of the project: method, URL, parameters, body, paging, and next to
 * each one the sample data that the preview returns instead of the service (they stay in the editor's draft, not in the
 * document). In a screen a data source can also refer to one of the project (`ref`, with parameters and body to adjust it),
 * be moved into the project or become a copy written in the screen again.
 */
@Component({
  selector: 'ed-data-sources',
  imports: [FormsModule, JsonFieldComponent, NzButtonModule, NzIconModule, NzInputModule, NzModalModule, NzSelectModule, NzTooltipModule, OpenApiImportComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './data-sources.component.scss',
  templateUrl: './data-sources.component.html',
})
export class DataSourcesComponent {
  protected readonly list = inject(DataSourceList);
  protected readonly state = inject(DocumentState);
  protected readonly projectSources = inject(ProjectDataSources);
  protected readonly project = inject(Project);
  protected readonly i18n = inject(I18n);
  private readonly notifier = inject(Notifier);
  /** In a screen (the data sources of a document of the project have no references and no OpenAPI import). */
  protected readonly inScreen = this.list.listPath[0] === 'dataSources';
  /** «Import from OpenAPI» dialog open. */
  protected readonly importing = signal(false);
  protected readonly methods = METHODS;
  /** Name that could not be applied (not valid or already used). */
  protected readonly renameError = signal<string | null>(null);
  /** «Move to the project» dialog: the data source, the document and the name it gets there. */
  protected readonly moving = signal<{ name: string; document: string; as: string } | null>(null);

  protected readonly sources = computed<SourceView[]>(() => {
    const all = getIn(this.state.doc(), this.list.listPath);
    if (!isObject(all)) return [];
    const issues = this.state.issues();
    return Object.entries(all).map(([name, value]) => {
      const pointer = toPointer([...this.list.listPath, name]);
      const source = isObject(value) ? value : {};
      const ref = typeof source['ref'] === 'string' ? source['ref'] : null;
      const target = ref ? this.projectSources.definition(ref) : null;
      const method = String(ref ? target?.method : source['method']);
      return {
        name,
        value: source,
        ref,
        target,
        hasBody: WITH_BODY.includes(method),
        issues: issues.filter((i) => i.pointer === pointer || i.pointer.startsWith(pointer + '/')).map((i) => `${i.pointer.slice(pointer.length) || '/'} ${i.message}`),
      };
    });
  });

  protected add(): void {
    this.list.addSource();
  }

  /** Adds a data source referring to one of the project (the first one; it is changed from the list). */
  protected addReference(): void {
    const ref = this.projectSources.references()[0];
    if (!ref) return;
    const names = new Set(this.sources().map((s) => s.name));
    let name = ref.split('/')[1];
    for (let n = 2; names.has(name); n++) name = `${ref.split('/')[1]}${n}`;
    this.state.setValue([...this.list.listPath, name], { ref });
  }

  protected rename(from: string, input: HTMLInputElement): void {
    const to = input.value.trim();
    if (this.list.renameSource(from, to)) {
      this.renameError.set(null);
      return;
    }
    this.renameError.set(from);
    input.value = from;
  }

  protected set(name: string, key: string, value: Json | undefined): void {
    this.state.setValue([...this.list.listPath, name, key], value === '' ? undefined : value);
  }

  protected text(value: Json | undefined): string {
    return typeof value === 'string' ? value : '';
  }

  /** The reference becomes a copy written in the screen (with the parameters and the body of the reference applied). */
  protected unlink(source: SourceView): void {
    if (!source.target) return;
    const copy: JsonObject = { ...(source.target as unknown as JsonObject) };
    const params = source.value['params'];
    if (isObject(params)) copy['params'] = { ...(isObject(copy['params']) ? copy['params'] : {}), ...params };
    if (source.value['body'] !== undefined) copy['body'] = source.value['body'];
    this.state.setValue([...this.list.listPath, source.name], copy);
  }

  protected startMove(name: string): void {
    const doc = this.state.doc();
    const screen = isObject(doc) && typeof doc['screen'] === 'string' ? doc['screen'] : '';
    this.moving.set({ name, document: this.projectSources.documents()[0] ?? screen, as: name });
  }

  protected readonly moveValid = computed(() => {
    const move = this.moving();
    if (!move || !RESOURCE_ID.test(move.document) || !SOURCE_NAME.test(move.as)) return false;
    return !this.projectSources.definition(`${move.document}/${move.as}`);
  });

  /** Moves the data source into the document of the project and leaves a reference in its place. */
  protected async move(): Promise<void> {
    const move = this.moving();
    if (!move || !this.moveValid()) return;
    const definition = getIn(this.state.doc(), [...this.list.listPath, move.name]);
    try {
      await this.projectSources.add(move.document, move.as, definition as unknown as DataSourceDefinition);
      this.state.setValue([...this.list.listPath, move.name], { ref: `${move.document}/${move.as}` });
      this.moving.set(null);
      this.notifier.toast(this.i18n.t('ed.sources.moved', { ref: `${move.document}/${move.as}` }));
    } catch (e) {
      this.notifier.toast(this.i18n.t('ed.saveFailed', { e: e instanceof Error ? e.message : String(e) }), 'error');
    }
  }

  protected updateMove(change: Partial<{ document: string; as: string }>): void {
    this.moving.update((m) => (m ? { ...m, ...change } : m));
  }
}
