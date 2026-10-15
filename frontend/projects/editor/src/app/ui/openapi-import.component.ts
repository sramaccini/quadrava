import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { I18n, Notifier } from 'core';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCheckboxModule } from 'ng-zorro-antd/checkbox';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { getIn, isObject } from '../model/doc-ops';
import { EditorStore } from '../model/editor-store';
import { OpenApiError, dataSourceOf, readOpenApi, sourceNameOf, type ApiDescription, type ApiOperation } from '../model/openapi';

const URL_KEY = 'lc.editor.openapi.url';
/** Default address: that of springdoc in Spring Boot. */
const DEFAULT_URL = '/v3/api-docs';
/** Document too large for an editor in the browser. */
const MAX_SIZE = 5_000_000;
const TIMEOUT_MS = 15_000;

/**
 * Import of data sources from an OpenAPI 3.x or Swagger 2.0 document: it is read from an address (springdoc in
 * Spring Boot exposes it at `/v3/api-docs`) or from a file, the operations are chosen and each one becomes a data source,
 * with the sample data taken from the response. A relative address goes through the same origin as the editor (behind the
 * BFF it reaches the services); an absolute one of another origin works only if the service allows CORS.
 */
@Component({
  selector: 'ed-openapi-import',
  imports: [FormsModule, NzButtonModule, NzCheckboxModule, NzIconModule, NzInputModule, NzTagModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: block; }
    .source { display: flex; gap: 6px; align-items: center; }
    .source input[type='text'], .source input:not([type]) { flex: 1; }
    .hint { margin: 6px 0 0; font-size: 12px; color: var(--lc-color-muted); }
    .error { margin: 8px 0 0; color: var(--lc-color-danger); font-size: 13px; }
    .api { margin: 14px 0 6px; font-weight: 600; }
    .base { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; font-size: 13px; }
    .base input { width: 180px; }
    .bulk { display: flex; gap: 8px; margin-bottom: 6px; }
    .list { max-height: 46vh; overflow: auto; border: 1px solid var(--lc-color-border); border-radius: var(--lc-radius); }
    h4 { position: sticky; top: 0; z-index: 1; margin: 0; padding: 4px 10px; background: var(--lc-color-background); font-size: 12px; font-weight: 600; }
    .op { display: grid; grid-template-columns: auto 64px minmax(0, 1fr); gap: 2px 8px; align-items: baseline; padding: 6px 10px; border-top: 1px solid var(--lc-color-border); }
    .op.present { opacity: 0.6; }
    .method { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 11px; font-weight: 600; }
    .path { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 12px; word-break: break-all; }
    .detail { grid-column: 3; font-size: 12px; color: var(--lc-color-muted); }
    .name code { color: var(--lc-color-on-surface); }
    .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
  `,
  template: `
    <form class="source" (submit)="$event.preventDefault(); load()">
      <input nz-input nzSize="small" data-openapi-url [attr.aria-label]="i18n.t('ed.openapi.url')" [placeholder]="defaultUrl" [ngModel]="url()" (ngModelChange)="url.set($event)" name="url" spellcheck="false" />
      <button nz-button nzType="primary" nzSize="small" type="submit" [nzLoading]="loading()">{{ i18n.t('ed.openapi.read') }}</button>
      <button nz-button nzSize="small" type="button" (click)="file.click()"><span nz-icon nzType="upload"></span>{{ i18n.t('ed.openapi.file') }}</button>
      <input #file type="file" accept="application/json,.json" hidden (change)="loadFile(file)" />
    </form>
    <p class="hint">{{ i18n.t('ed.openapi.hint') }}</p>
    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }
    @if (api(); as a) {
      <p class="api">{{ a.title }} @if (a.version) { <span>· {{ a.version }}</span> } · {{ i18n.t('ed.openapi.count', { n: a.operations.length }) }}</p>
      <label class="base">
        {{ i18n.t('ed.openapi.basePath') }}
        <input nz-input nzSize="small" data-openapi-base [ngModel]="basePath()" (ngModelChange)="basePath.set($event)" placeholder="/api" spellcheck="false" />
      </label>
      <div class="bulk">
        <button nz-button nzSize="small" type="button" (click)="selectAll(true)">{{ i18n.t('ed.openapi.all') }}</button>
        <button nz-button nzSize="small" type="button" (click)="selectAll(false)">{{ i18n.t('ed.openapi.none') }}</button>
      </div>
      <div class="list" role="group" [attr.aria-label]="i18n.t('ed.openapi.operations')">
        @for (group of groups(); track group.tag) {
          <h4>{{ group.tag || i18n.t('ed.openapi.noTag') }}</h4>
          @for (op of group.operations; track op.key) {
            @let present = existing().has(op.key);
            <div class="op" [class.present]="present">
              <label nz-checkbox [nzDisabled]="present" [ngModel]="selected().has(op.key)" (ngModelChange)="toggle(op.key, $event)" [attr.data-op]="op.key"></label>
              <nz-tag class="method" [nzColor]="colors[op.method]">{{ op.method }}</nz-tag>
              <span class="path">{{ op.path }}</span>
              <span class="detail">
                @if (present) {
                  {{ i18n.t('ed.openapi.present') }}
                } @else {
                  @if (op.summary) {
                    {{ op.summary }} ·
                  }
                  <span class="name">{{ i18n.t('ed.openapi.as') }} <code>{{ names().get(op.key) }}</code></span>
                  @if (optional(op); as list) {
                    · {{ i18n.t('ed.openapi.optional', { list }) }}
                  }
                }
              </span>
            </div>
          }
        }
      </div>
      <div class="actions">
        <button nz-button nzSize="small" type="button" (click)="closed.emit()">{{ i18n.t('ed.cancel') }}</button>
        <button nz-button nzType="primary" nzSize="small" type="button" data-openapi-import [disabled]="!selected().size" (click)="import()">
          {{ i18n.t('ed.openapi.import', { n: selected().size }) }}
        </button>
      </div>
    }
  `,
})
export class OpenApiImportComponent {
  protected readonly i18n = inject(I18n);
  private readonly store = inject(EditorStore);
  private readonly notifier = inject(Notifier);
  /** Closing of the dialog (after the import or with Cancel). */
  readonly closed = output<void>();

  protected readonly defaultUrl = DEFAULT_URL;
  protected readonly url = signal(readUrl());
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly api = signal<ApiDescription | null>(null);
  protected readonly basePath = signal('');
  protected readonly selected = signal<ReadonlySet<string>>(new Set());
  protected readonly colors: Record<string, string> = { GET: 'blue', POST: 'green', PUT: 'orange', PATCH: 'gold', DELETE: 'red' };

  /** Operations by tag, in document order. */
  protected readonly groups = computed(() => {
    const groups = new Map<string, ApiOperation[]>();
    for (const op of this.api()?.operations ?? []) groups.set(op.tag, [...(groups.get(op.tag) ?? []), op]);
    return [...groups].map(([tag, operations]) => ({ tag, operations }));
  });

  /** Operations that already have an equal data source (same method and address). */
  protected readonly existing = computed(() => {
    const sources = getIn(this.store.doc(), ['dataSources']);
    const present = new Set(isObject(sources) ? Object.values(sources).filter(isObject).map((s) => `${s['method']} ${s['url']}`) : []);
    const base = this.basePath();
    return new Set((this.api()?.operations ?? []).filter((op) => present.has(`${op.method} ${dataSourceOf(op, base)['url']}`)).map((op) => op.key));
  });

  /** Name the data source of every operation will have (unique among those already present and those chosen before). */
  protected readonly names = computed(() => {
    const used = new Set(this.store.sourceNames());
    const names = new Map<string, string>();
    for (const op of this.api()?.operations ?? []) {
      const name = sourceNameOf(op, used);
      names.set(op.key, name);
      if (this.selected().has(op.key)) used.add(name);
    }
    return names;
  });

  protected optional(op: ApiOperation): string {
    return op.queryParams
      .filter((p) => !p.required)
      .map((p) => p.name)
      .join(', ');
  }

  /** Reads the document from the address: relative (same origin) or http(s). */
  protected async load(): Promise<void> {
    const url = this.url().trim() || DEFAULT_URL;
    if (!/^(\/(?!\/)|https?:\/\/)/i.test(url)) return this.error.set(this.i18n.t('ed.openapi.error.url'));
    this.loading.set(true);
    this.error.set('');
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(url, { headers: { Accept: 'application/json' }, credentials: 'same-origin', signal: abort.signal });
      if (!response.ok) throw new Error(this.i18n.t('ed.openapi.error.http', { status: response.status }));
      this.show(await response.text());
      try {
        localStorage.setItem(URL_KEY, url);
      } catch {
        // Without browser storage it starts again from the default address.
      }
    } catch (e) {
      // A network error (CORS too) tells the browser nothing more: explain what to check.
      this.error.set(e instanceof TypeError || (e instanceof DOMException && e.name === 'AbortError') ? this.i18n.t('ed.openapi.error.network') : e instanceof Error ? e.message : String(e));
    } finally {
      clearTimeout(timer);
      this.loading.set(false);
    }
  }

  protected async loadFile(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.error.set('');
    try {
      this.show(await file.text());
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : String(e));
    }
  }

  private show(raw: string): void {
    if (raw.length > MAX_SIZE) throw new Error(this.i18n.t('ed.openapi.error.tooLarge'));
    let doc: unknown;
    try {
      doc = JSON.parse(raw);
    } catch {
      throw new Error(this.i18n.t('ed.openapi.error.notJson'));
    }
    try {
      const api = readOpenApi(doc);
      this.api.set(api);
      this.basePath.set(api.basePath);
      this.selected.set(new Set());
    } catch (e) {
      throw new Error(this.i18n.t('ed.openapi.error.' + (e instanceof OpenApiError ? e.reason : 'notOpenApi')));
    }
  }

  protected toggle(key: string, on: boolean): void {
    const next = new Set(this.selected());
    if (on) next.add(key);
    else next.delete(key);
    this.selected.set(next);
  }

  protected selectAll(on: boolean): void {
    const present = this.existing();
    this.selected.set(on ? new Set((this.api()?.operations ?? []).map((op) => op.key).filter((k) => !present.has(k))) : new Set());
  }

  protected import(): void {
    const names = this.names();
    const base = this.basePath();
    const entries = (this.api()?.operations ?? [])
      .filter((op) => this.selected().has(op.key))
      .map((op) => ({ name: names.get(op.key)!, source: dataSourceOf(op, base), sample: op.sample }));
    const added = this.store.importSources(entries);
    this.notifier.toast(this.i18n.t('ed.openapi.imported', { n: added.length }));
    this.closed.emit();
  }
}

function readUrl(): string {
  try {
    return localStorage.getItem(URL_KEY) ?? DEFAULT_URL;
  } catch {
    return DEFAULT_URL;
  }
}
