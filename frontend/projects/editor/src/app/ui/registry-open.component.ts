import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { I18n } from 'core';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzInputModule } from 'ng-zorro-antd/input';
import type { Json } from '../model/doc-ops';
import { RegistryClient, type DocumentKind, type DocumentSummary } from '../model/registry-client';
import { RegistrySession, type RegistryRef } from '../model/registry-session';

export interface RegistryDocument {
  ref: RegistryRef;
  hash: string;
  doc: Json;
}

/** Version to open: the last one saved or the one published in an environment. */
interface VersionOption {
  value: string;
  hash: string;
  label: string;
}

/**
 * Content of the «Open from registry…» dialog: one chooses the application (from the registry's list or typed), one
 * of its documents of the kind of the current mode and the version (the last one or the one published in an environment).
 */
@Component({
  selector: 'ed-registry-open',
  imports: [FormsModule, NzButtonModule, NzInputModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; }
    .app { display: flex; gap: 8px; }
    .docs { list-style: none; margin: 0 0 12px; padding: 0; max-height: 260px; overflow: auto; border: 1px solid var(--lc-color-border); border-radius: var(--lc-radius); }
    .docs li + li { border-top: 1px solid var(--lc-color-border); }
    .docs label { display: flex; gap: 8px; align-items: baseline; padding: 6px 10px; cursor: pointer; }
    .docs .meta { font-size: 12px; color: var(--lc-color-muted); }
    .empty { color: var(--lc-color-muted); margin: 0 0 12px; }
    select { height: 32px; border: 1px solid var(--lc-color-border); border-radius: var(--lc-radius); padding: 0 8px; background: var(--lc-color-surface, #fff); }
    .actions { display: flex; justify-content: flex-end; gap: 8px; }
  `,
  template: `
    <form ngNoForm (submit)="$event.preventDefault(); load()">
      <div class="field">
        <label for="registry-open-app">{{ i18n.t('ed.registry.app') }}</label>
        <div class="app">
          <input
            #appInput
            nz-input
            id="registry-open-app"
            list="registry-open-apps"
            spellcheck="false"
            [ngModel]="appId()"
            (ngModelChange)="appId.set($event.trim())"
          />
          <datalist id="registry-open-apps">
            @for (a of session.apps(); track a.id) {
              <option [value]="a.id">{{ a.name }}</option>
            }
          </datalist>
          <button nz-button type="submit" [disabled]="!appId() || loading()" [nzLoading]="loading()">{{ i18n.t('ed.openRegistry.list') }}</button>
        </div>
      </div>
    </form>
    @if (documents(); as docs) {
      @if (docs.length) {
        <ul class="docs" role="radiogroup" [attr.aria-label]="i18n.t('ed.openRegistry.documents')">
          @for (d of docs; track d.id) {
            <li>
              <label>
                <input type="radio" name="registry-open-doc" [value]="d.id" [checked]="chosen() === d.id" (change)="choose(d.id)" />
                <span>{{ d.id }}</span>
                <span class="meta">{{ summary(d) }}</span>
              </label>
            </li>
          }
        </ul>
      } @else {
        <p class="empty">{{ i18n.t('ed.openRegistry.none') }}</p>
      }
    }
    @if (options().length) {
      <div class="field">
        <label for="registry-open-version">{{ i18n.t('ed.openRegistry.version') }}</label>
        <select id="registry-open-version" [ngModel]="option()" (ngModelChange)="option.set($event)">
          @for (o of options(); track o.value) {
            <option [value]="o.value">{{ o.label }}</option>
          }
        </select>
      </div>
    }
    <div class="actions">
      <button nz-button type="button" (click)="cancelled.emit()">{{ i18n.t('ed.cancel') }}</button>
      <button nz-button nzType="primary" type="button" [disabled]="!selected() || loading()" (click)="open()">{{ i18n.t('ed.openRegistry.open') }}</button>
    </div>
  `,
})
export class RegistryOpenComponent {
  readonly kind = input.required<DocumentKind>();
  readonly opened = output<RegistryDocument>();
  readonly cancelled = output<void>();
  protected readonly session = inject(RegistrySession);
  protected readonly i18n = inject(I18n);
  private readonly client = inject(RegistryClient);

  protected readonly appId = signal(this.session.appId());
  protected readonly documents = signal<DocumentSummary[] | null>(null);
  protected readonly chosen = signal<string | null>(null);
  protected readonly option = signal('latest');
  protected readonly loading = signal(false);
  private readonly appInput = viewChild.required<ElementRef<HTMLInputElement>>('appInput');

  protected readonly options = computed<VersionOption[]>(() => {
    const doc = this.documents()?.find((d) => d.id === this.chosen());
    if (!doc) return [];
    const list: VersionOption[] = [];
    if (doc.latest) list.push({ value: 'latest', hash: doc.latest.hash, label: this.i18n.t('ed.openRegistry.latest', { hash: doc.latest.hash.slice(0, 10) }) });
    for (const [env, hash] of Object.entries(doc.publishedEnvironments ?? {}).sort()) {
      list.push({ value: 'env:' + env, hash, label: this.i18n.t('ed.openRegistry.published', { env, hash: hash.slice(0, 10) }) });
    }
    return list;
  });
  protected readonly selected = computed(() => this.options().find((o) => o.value === this.option()) ?? null);

  constructor() {
    afterNextRender(() => {
      this.appInput().nativeElement.focus();
      if (this.appId()) void this.load();
    });
  }

  protected summary(doc: DocumentSummary): string {
    const parts: string[] = [];
    if (doc.latest?.state) parts.push(this.i18n.t('ed.registry.state.' + doc.latest.state));
    const envs = Object.keys(doc.publishedEnvironments ?? {}).sort();
    if (envs.length) parts.push(envs.join(', '));
    return parts.join(' · ');
  }

  protected choose(id: string): void {
    this.chosen.set(id);
    this.option.set(this.options()[0]?.value ?? 'latest');
  }

  protected async load(): Promise<void> {
    const appId = this.appId();
    if (!appId) return;
    this.loading.set(true);
    this.chosen.set(null);
    try {
      const all = await this.client.documents(appId);
      this.documents.set(all.filter((d) => d.kind === this.kind()).sort((a, b) => a.id.localeCompare(b.id)));
      this.session.appId.set(appId);
    } catch (e) {
      this.documents.set(null);
      this.session.report(e);
    } finally {
      this.loading.set(false);
    }
  }

  protected async open(): Promise<void> {
    const id = this.chosen();
    const version = this.selected();
    if (!id || !version) return;
    this.loading.set(true);
    try {
      const doc = await this.client.version(this.session.appId(), this.kind(), id, version.hash);
      this.opened.emit({ ref: { kind: this.kind(), id }, hash: version.hash, doc });
    } catch (e) {
      this.session.report(e);
    } finally {
      this.loading.set(false);
    }
  }
}
