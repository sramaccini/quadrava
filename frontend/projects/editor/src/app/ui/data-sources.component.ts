import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { I18n, Notifier } from 'core';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import type { DataSourceDefinition } from 'schema';
import { getIn, isObject, toPointer, type Json, type JsonObject } from '../model/doc-ops';
import { DataSourceList, SOURCE_NAME } from '../model/datasources-store';
import { DocumentState } from '../model/document-state';
import { HTTP_METHODS, METHODS_WITH_BODY, METHOD_COLORS } from '../model/http-methods';
import { Project, RESOURCE_ID } from '../model/project';
import { ProjectDataSources } from '../model/project-data-sources';
import { JsonFieldComponent } from './json-field.component';
import { OpenApiImportComponent } from './openapi-import.component';

interface SourceView {
  name: string;
  value: JsonObject;
  /** Reference to a data source of the project (`orders/list`), or null for a data source written here. */
  ref: string | null;
  /** The definition referred to (null if the reference does not resolve). */
  target: DataSourceDefinition | null;
  /** HTTP method: of the definition referred to, or of the one written here. */
  method: string;
  hasBody: boolean;
  issues: string[];
}

/**
 * Data sources of a data sources document of the project (method, coloured by verb as in the OpenAPI import, URL, parameters,
 * body, paging; with the import from OpenAPI) or of a screen, which only refers to them (`ref`, with parameters and body to
 * adjust it). Next to each one the sample data that the preview returns instead of the service (they stay in the editor's
 * draft, not in the document). A data source written in a screen by an earlier version is flagged and can be moved into the
 * project, leaving a reference in its place.
 */
@Component({
  selector: 'ed-data-sources',
  imports: [FormsModule, JsonFieldComponent, NzButtonModule, NzIconModule, NzInputModule, NzModalModule, NzSelectModule, NzTagModule, NzTooltipModule, OpenApiImportComponent],
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
  /** In a screen: only references (the data sources are defined, and imported from OpenAPI, in the documents of the project). */
  protected readonly inScreen = this.list.listPath[0] === 'dataSources';
  /** «Import from OpenAPI» dialog open. */
  protected readonly importing = signal(false);
  protected readonly methods = HTTP_METHODS;
  protected readonly colors = METHOD_COLORS;
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
      const method = String((ref ? target?.method : source['method']) ?? 'GET');
      return {
        name,
        value: source,
        ref,
        target,
        method,
        hasBody: METHODS_WITH_BODY.includes(method),
        issues: issues.filter((i) => i.pointer === pointer || i.pointer.startsWith(pointer + '/')).map((i) => `${i.pointer.slice(pointer.length) || '/'} ${i.message}`),
      };
    });
  });

  protected add(): void {
    this.list.addSource();
  }

  /** Adds a data source referring to one of the project (the first one; it is changed from the list). */
  protected addReference(): void {
    this.list.addSource();
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
