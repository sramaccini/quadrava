import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Confirmation, I18n, Notifier } from 'core';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzTagModule } from 'ng-zorro-antd/tag';
import type { Json } from '../model/doc-ops';
import type { DocumentState } from '../model/document-state';
import { EDITOR_REDIRECT, RegistryClient, RegistryError, documentRef, loginUrl, type DocumentKind, type DocumentVersion } from '../model/registry-client';

const SETTINGS_KEY = 'lc.editor.registry';

interface Settings {
  appId: string;
  env: string;
}

/**
 * Pannello del registro per il documento aperto (schermata, navigazione o tema): salva una versione (solo se il
 * documento non ha errori), mostra lo storico con gli ambienti in cui è pubblicata ogni versione, riapre una
 * versione nell'editor, pubblica una versione in un ambiente. Applicazione e ambiente si ricordano nel browser.
 */
@Component({
  selector: 'ed-registry-panel',
  imports: [FormsModule, NzButtonModule, NzIconModule, NzInputModule, NzTagModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: flex; flex-direction: column; gap: 12px; }
    .row { display: flex; flex-direction: column; gap: 2px; }
    label { font-size: 12px; font-weight: 600; }
    .doc { margin: 0; font-size: 13px; }
    .doc code { font-size: 12px; }
    .warn { margin: 0; font-size: 12px; color: var(--lc-color-danger); }
    .actions { display: flex; gap: 8px; flex-wrap: wrap; }
    ol { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
    li { padding: 8px; border: 1px solid var(--lc-color-border); border-radius: var(--lc-radius); font-size: 12px; }
    .hash { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
    .meta { color: var(--lc-color-muted); }
    .item-actions { display: flex; gap: 4px; margin-top: 6px; }
    .empty { color: var(--lc-color-muted); font-size: 12px; margin: 0; }
    .login { display: flex; flex-direction: column; gap: 6px; align-items: flex-start; }
  `,
  template: `
    <div class="row">
      <label for="registry-app">{{ i18n.t('ed.registry.app') }}</label>
      <input nz-input nzSize="small" id="registry-app" [ngModel]="appId()" (ngModelChange)="appId.set($event.trim())" spellcheck="false" />
    </div>
    <div class="row">
      <label for="registry-env">{{ i18n.t('ed.registry.env') }}</label>
      <input nz-input nzSize="small" id="registry-env" [ngModel]="env()" (ngModelChange)="env.set($event.trim())" spellcheck="false" />
    </div>
    @if (ref(); as r) {
      <p class="doc">{{ i18n.t('ed.registry.document') }} <code>{{ r.kind }} / {{ r.id }}</code></p>
    } @else {
      <p class="warn">{{ i18n.t('ed.registry.noId') }}</p>
    }
    @if (needsLogin()) {
      <div class="login" role="alert">
        <p class="warn">{{ i18n.t('ed.registry.loginNeeded') }}</p>
        <button nz-button nzType="primary" nzSize="small" type="button" (click)="login()">{{ i18n.t('ed.registry.login') }}</button>
      </div>
    }
    @if (state().errorCount()) {
      <p class="warn">{{ i18n.t('ed.registry.hasErrors') }}</p>
    }
    <div class="actions">
      <button nz-button nzType="primary" nzSize="small" type="button" [disabled]="!canSave()" [nzLoading]="busy()" (click)="save()">
        <span nz-icon nzType="upload"></span>{{ i18n.t('ed.registry.save') }}
      </button>
      <button nz-button nzSize="small" type="button" [disabled]="!ref() || !appId() || busy()" (click)="refresh()">
        <span nz-icon nzType="reload"></span>{{ i18n.t('ed.registry.history') }}
      </button>
    </div>
    @if (loaded()) {
      <ol [attr.aria-label]="i18n.t('ed.registry.history')">
        @for (v of versions(); track v.hash) {
          <li>
            <div>
              <span class="hash" [attr.title]="v.hash">{{ v.hash.slice(0, 10) }}</span>
              @for (e of envsOf(v.hash); track e) {
                <nz-tag nzColor="green">{{ e }}</nz-tag>
              }
            </div>
            <div class="meta">{{ v.author }} · {{ when(v.createdAt) }}</div>
            <div class="item-actions">
              <button nz-button nzSize="small" type="button" [disabled]="busy()" (click)="open(v)">{{ i18n.t('ed.registry.open') }}</button>
              <button nz-button nzSize="small" type="button" [disabled]="busy() || !env()" (click)="publish(v)">{{ i18n.t('ed.registry.publish', { env: env() }) }}</button>
            </div>
          </li>
        } @empty {
          <li class="empty">{{ i18n.t('ed.registry.none') }}</li>
        }
      </ol>
    }
  `,
})
export class RegistryPanelComponent {
  private readonly client = inject(RegistryClient);
  private readonly notifier = inject(Notifier);
  private readonly confirmation = inject(Confirmation);
  private readonly redirect = inject(EDITOR_REDIRECT);
  protected readonly i18n = inject(I18n);

  /** Il documento aperto e il suo tipo. */
  readonly state = input.required<DocumentState & { load(doc: Json): void }>();
  readonly kind = input.required<DocumentKind>();

  private readonly settings = readSettings();
  protected readonly appId = signal(this.settings.appId);
  protected readonly env = signal(this.settings.env);
  protected readonly busy = signal(false);
  protected readonly loaded = signal(false);
  /** Il registro ha risposto 401: serve il login (attraverso il BFF), poi si torna qui. */
  protected readonly needsLogin = signal(false);
  protected readonly versions = signal<DocumentVersion[]>([]);
  /** Ambiente → hash pubblicato, per il documento aperto. */
  private readonly published = signal<Record<string, string>>({});

  protected readonly ref = computed(() => documentRef(this.kind(), this.state().doc()));
  protected readonly canSave = computed(() => !!this.ref() && !!this.appId() && this.state().errorCount() === 0 && !this.busy());

  constructor() {
    effect(() => {
      const settings: Settings = { appId: this.appId(), env: this.env() };
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      } catch {
        // vedi la bozza
      }
    });
    // Cambiando documento lo storico mostrato non vale più.
    effect(() => {
      this.ref();
      this.kind();
      this.loaded.set(false);
    });
  }

  /** Data e ora della versione nella lingua dell'editor. */
  protected when(iso: string): string {
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? iso : new Intl.DateTimeFormat(this.i18n.intlLocale(), { dateStyle: 'short', timeStyle: 'short' }).format(date);
  }

  protected login(): void {
    this.redirect(loginUrl(globalThis.location.href));
  }

  protected envsOf(hash: string): string[] {
    return Object.entries(this.published())
      .filter(([, h]) => h === hash)
      .map(([e]) => e)
      .sort();
  }

  protected async refresh(): Promise<void> {
    const ref = this.ref();
    if (!ref || !this.appId()) return;
    await this.run(async () => {
      const [versions, documents] = await Promise.all([this.client.versions(this.appId(), ref.kind, ref.id), this.client.documents(this.appId())]);
      this.versions.set(versions);
      this.published.set(documents.find((d) => d.kind === ref.kind && d.id === ref.id)?.publishedEnvironments ?? {});
      this.loaded.set(true);
    });
  }

  protected async save(): Promise<void> {
    const ref = this.ref();
    if (!ref || !this.canSave()) return;
    await this.run(async () => {
      const version = await this.client.save(this.appId(), ref.kind, ref.id, this.state().doc());
      this.notifier.toast(this.i18n.t('ed.registry.saved', { hash: version.hash.slice(0, 10) }));
    });
    await this.refresh();
  }

  protected async open(version: DocumentVersion): Promise<void> {
    const ref = this.ref();
    if (!ref || !(await this.confirmation.confirm(this.i18n.t('ed.confirmReplace')))) return;
    await this.run(async () => {
      this.state().load(await this.client.version(this.appId(), ref.kind, ref.id, version.hash));
      this.notifier.toast(this.i18n.t('ed.opened', { name: `${ref.id} @ ${version.hash.slice(0, 10)}` }));
    });
  }

  protected async publish(version: DocumentVersion): Promise<void> {
    const ref = this.ref();
    const env = this.env();
    if (!ref || !env || !(await this.confirmation.confirm(this.i18n.t('ed.registry.confirmPublish', { id: ref.id, env })))) return;
    await this.run(async () => {
      await this.client.publish(this.appId(), ref.kind, ref.id, env, version.hash);
      this.notifier.toast(this.i18n.t('ed.registry.published', { env }));
    });
    await this.refresh();
  }

  /** Esegue un'operazione segnalando gli errori in modo comprensibile, senza dettagli tecnici del servizio. */
  private async run(action: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    try {
      await action();
      this.needsLogin.set(false);
    } catch (e) {
      const status = e instanceof RegistryError ? e.status : 0;
      if (status === 401) {
        this.needsLogin.set(true);
        return;
      }
      const key = status === 0 ? 'ed.registry.unreachable' : status === 401 || status === 403 ? 'ed.registry.forbidden' : status === 404 ? 'ed.registry.notFound' : 'ed.registry.rejected';
      // Il titolo del Problem è un testo pensato per l'autore (per esempio «identificativo diverso dal percorso»).
      this.notifier.toast(this.i18n.t(key, { reason: e instanceof RegistryError ? e.message : '' }), 'error');
    } finally {
      this.busy.set(false);
    }
  }
}

function readSettings(): Settings {
  try {
    const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Partial<Settings>;
    return { appId: typeof parsed.appId === 'string' ? parsed.appId : '', env: typeof parsed.env === 'string' ? parsed.env : 'produzione' };
  } catch {
    return { appId: '', env: 'produzione' };
  }
}
