import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Confirmation, I18n, Notifier } from 'core';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzTagModule } from 'ng-zorro-antd/tag';
import type { Json } from '../model/doc-ops';
import type { DocumentState } from '../model/document-state';
import { jsonDiff, type JsonChange } from '../model/json-diff';
import {
  RegistryClient,
  RegistryError,
  documentRef,
  type DocumentKind,
  type DocumentVersion,
  type ReviewAction,
  type ScreenReference,
} from '../model/registry-client';
import { RegistrySession } from '../model/registry-session';
import { SavedDocuments } from '../model/saved-documents';

/** Colour of the label of every review state. */
const STATE_COLORS: Record<string, string> = { draft: 'default', 'in-review': 'orange', approved: 'cyan', rejected: 'red' };

/**
 * Registry panel for the open document (screen, navigation or theme): saves a version (only if the
 * document has no errors), shows the history with the review state and the environments where every
 * version is published, reopens a version, compares it with the open document, requests review, approves or rejects it,
 * and publishes it in an environment. Application and environment are remembered in the browser.
 *
 * Before publishing it asks the registry for the screens referenced by the version and not published in the environment: the confirmation
 * lists them. In protected environments the registry rejects a navigation with missing screens: the panel lists them.
 *
 * Saving tells the registry the version one started from (opened or just saved): if in the meantime another
 * author saved, the panel says so and asks whether to save anyway. Application, environment, sign-in and starting
 * version live in RegistrySession, shared with «Save to registry» and «Open from registry…» of the File menu.
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
    .issues { margin: 0; padding-left: 16px; font-size: 12px; color: var(--lc-color-danger); }
    .issues code { font-size: 11px; }
    .review { color: var(--lc-color-muted); }
    .diff { border: 1px solid var(--lc-color-border); border-radius: var(--lc-radius); padding: 8px; font-size: 12px; }
    .diff h3 { margin: 0 0 6px; font-size: 12px; }
    .diff ul { margin: 0; padding-left: 16px; display: flex; flex-direction: column; gap: 4px; }
    .diff code { font-size: 11px; word-break: break-all; }
    .removed { color: var(--lc-color-danger); }
    .added { color: var(--lc-color-success); }
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
    @if (issues().length) {
      <div role="alert">
        <p class="warn">{{ i18n.t('ed.registry.invalid') }}</p>
        <ul class="issues">
          @for (issue of issues(); track $index) {
            <li><code>{{ issue.path }}</code> {{ issue.message }}</li>
          }
        </ul>
      </div>
    }
    @if (missing(); as m) {
      <div role="alert">
        <p class="warn">{{ i18n.t('ed.registry.missingTitle', { env: m.env }) }}</p>
        <ul class="issues">
          @for (r of m.references; track $index) {
            <li><code>{{ r.path }}</code> {{ r.screen }}</li>
          }
        </ul>
      </div>
    }
    @if (loaded()) {
      <div class="row">
        <label for="registry-note">{{ i18n.t('ed.registry.note') }}</label>
        <input nz-input nzSize="small" id="registry-note" maxlength="500" [ngModel]="note()" (ngModelChange)="note.set($event)" />
      </div>
      <ol [attr.aria-label]="i18n.t('ed.registry.history')">
        @for (v of versions(); track v.hash) {
          <li>
            <div>
              <span class="hash" [attr.title]="v.hash">{{ v.hash.slice(0, 10) }}</span>
              @if (v.state) {
                <nz-tag [nzColor]="stateColor(v.state)">{{ i18n.t('ed.registry.state.' + v.state) }}</nz-tag>
              }
              @for (e of envsOf(v.hash); track e) {
                <nz-tag nzColor="green">{{ e }}</nz-tag>
              }
              @if (v.hash === basedOn()) {
                <nz-tag>{{ i18n.t('ed.registry.current') }}</nz-tag>
              }
            </div>
            <div class="meta">{{ v.author }} · {{ when(v.createdAt) }}</div>
            @if (v.reviewedBy) {
              <div class="review">{{ i18n.t('ed.registry.reviewedBy', { who: v.reviewedBy, when: when(v.reviewedAt ?? '') }) }}{{ v.reviewNote ? ': ' + v.reviewNote : '' }}</div>
            }
            <div class="item-actions">
              <button nz-button nzSize="small" type="button" [disabled]="busy()" (click)="open(v)">{{ i18n.t('ed.registry.open') }}</button>
              <button nz-button nzSize="small" type="button" [disabled]="busy()" (click)="compare(v)">{{ i18n.t('ed.registry.compare') }}</button>
              <button nz-button nzSize="small" type="button" [disabled]="busy() || !env()" (click)="publish(v)">{{ i18n.t('ed.registry.publish', { env: env() }) }}</button>
            </div>
            <div class="item-actions">
              @if (v.state === 'draft' || v.state === 'rejected') {
                <button nz-button nzSize="small" type="button" [disabled]="busy()" (click)="review(v, 'request')">{{ i18n.t('ed.registry.requestReview') }}</button>
              }
              @if (v.state === 'in-review') {
                <button nz-button nzSize="small" type="button" [disabled]="busy()" (click)="review(v, 'approve')">{{ i18n.t('ed.registry.approve') }}</button>
                <button nz-button nzSize="small" nzDanger type="button" [disabled]="busy()" (click)="review(v, 'reject')">{{ i18n.t('ed.registry.reject') }}</button>
              }
            </div>
          </li>
        } @empty {
          <li class="empty">{{ i18n.t('ed.registry.none') }}</li>
        }
      </ol>
    }
    @if (diff(); as d) {
      <section class="diff" [attr.aria-label]="i18n.t('ed.registry.compare')">
        <h3>{{ i18n.t('ed.registry.diffTitle', { hash: d.hash.slice(0, 10) }) }}</h3>
        @if (d.changes.length === 0) {
          <p class="empty">{{ i18n.t('ed.registry.diffNone') }}</p>
        } @else {
          <ul>
            @for (c of d.changes; track $index) {
              <li>
                <code>{{ c.path }}</code>
                @if (c.kind !== 'added') {
                  <span class="removed"> − <code>{{ c.before }}</code></span>
                }
                @if (c.kind !== 'removed') {
                  <span class="added"> + <code>{{ c.after }}</code></span>
                }
              </li>
            }
          </ul>
          @if (d.truncated) {
            <p class="empty">{{ i18n.t('ed.registry.diffMore') }}</p>
          }
        }
        <button nz-button nzSize="small" type="button" (click)="diff.set(null)">{{ i18n.t('ed.registry.diffClose') }}</button>
      </section>
    }
  `,
})
export class RegistryPanelComponent {
  private readonly client = inject(RegistryClient);
  private readonly notifier = inject(Notifier);
  private readonly confirmation = inject(Confirmation);
  private readonly session = inject(RegistrySession);
  private readonly saved = inject(SavedDocuments);
  protected readonly i18n = inject(I18n);

  /** The active document: its state, its type and its identifier in the workspace. */
  readonly state = input.required<DocumentState>();
  readonly kind = input.required<DocumentKind>();
  readonly document = input.required<string>();

  protected readonly appId = this.session.appId;
  protected readonly env = this.session.env;
  private readonly working = signal(false);
  protected readonly busy = computed(() => this.working() || this.session.busy());
  protected readonly loaded = signal(false);
  /** The registry answered 401: sign-in is needed (through the BFF), then one comes back here. */
  protected readonly needsLogin = computed(() => this.session.status() === 'login');
  protected readonly versions = signal<DocumentVersion[]>([]);
  /** Environment → published hash, for the open document. */
  private readonly published = signal<Record<string, string>>({});
  /** Validation problems reported by the registry at the last save (also from «Save to registry»). */
  protected readonly issues = this.session.issues;
  /** Screens referenced and not published in the environment, from the last rejected publication. */
  protected readonly missing = signal<{ env: string; references: ScreenReference[] } | null>(null);
  /** Note for the next review action. */
  protected readonly note = signal('');
  /** Open comparison: the version and the differences from the open document. */
  protected readonly diff = signal<{ hash: string; changes: JsonChange[]; truncated: boolean } | null>(null);

  /** The open document; it changes only if type or identifier change, not at every change of the content. */
  protected readonly ref = computed(() => documentRef(this.kind(), this.state().doc()), { equal: (a, b) => a?.kind === b?.kind && a?.id === b?.id });
  /** Version the open document starts from (opened or just saved): the registry uses it for concurrent changes. */
  protected readonly basedOn = computed(() => this.session.basedOn(this.document(), this.ref()));
  protected readonly canSave = computed(() => !!this.ref() && !!this.appId() && this.state().errorCount() === 0 && !this.busy());

  constructor() {
    // Changing document, the history shown no longer applies.
    effect(() => {
      this.document();
      this.ref();
      this.kind();
      this.loaded.set(false);
      this.diff.set(null);
      this.missing.set(null);
    });
  }

  /** Date and time of the version in the editor's language. */
  protected when(iso: string): string {
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? iso : new Intl.DateTimeFormat(this.i18n.intlLocale(), { dateStyle: 'short', timeStyle: 'short' }).format(date);
  }

  protected stateColor(state: string): string {
    return STATE_COLORS[state] ?? 'default';
  }

  protected login(): void {
    this.session.login();
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
    if (!this.canSave()) return;
    const doc = this.state().doc();
    if (await this.session.save(this.document(), this.kind(), doc)) this.markSaved(doc);
    await this.refresh();
  }

  protected async review(version: DocumentVersion, action: ReviewAction): Promise<void> {
    const ref = this.ref();
    if (!ref) return;
    const note = this.note().trim();
    await this.run(async () => {
      await this.client.review(this.appId(), ref.kind, ref.id, version.hash, action, note || undefined);
      this.note.set('');
      this.notifier.toast(this.i18n.t('ed.registry.reviewed.' + action));
    });
    await this.refresh();
  }

  protected async compare(version: DocumentVersion): Promise<void> {
    const ref = this.ref();
    if (!ref) return;
    await this.run(async () => {
      const content = await this.client.version(this.appId(), ref.kind, ref.id, version.hash);
      this.diff.set({ hash: version.hash, ...jsonDiff(content, this.state().doc()) });
    });
  }

  protected async open(version: DocumentVersion): Promise<void> {
    const ref = this.ref();
    if (!ref || !(await this.confirmation.confirm(this.i18n.t('ed.confirmReplace')))) return;
    await this.run(async () => {
      this.state().load(await this.client.version(this.appId(), ref.kind, ref.id, version.hash));
      this.session.setOrigin(this.document(), ref, version.hash);
      this.markSaved(this.state().doc());
      this.notifier.toast(this.i18n.t('ed.opened', { name: `${ref.id} @ ${version.hash.slice(0, 10)}` }));
    });
  }

  protected async publish(version: DocumentVersion): Promise<void> {
    const ref = this.ref();
    const env = this.env();
    if (!ref || !env) return;
    this.missing.set(null);
    const screens = await this.missingScreens(ref.kind, ref.id, version.hash, env);
    const question = screens.length
      ? this.i18n.t('ed.registry.confirmPublishMissing', { id: ref.id, env, screens: screens.join(', ') })
      : this.i18n.t('ed.registry.confirmPublish', { id: ref.id, env });
    if (!(await this.confirmation.confirm(question))) return;
    await this.run(async () => {
      try {
        await this.client.publish(this.appId(), ref.kind, ref.id, env, version.hash);
      } catch (e) {
        if (e instanceof RegistryError && e.missingReferences.length) this.missing.set({ env, references: e.missingReferences });
        throw e;
      }
      this.notifier.toast(this.i18n.t('ed.registry.published', { env }));
    });
    await this.refresh();
  }

  /**
   * Screens referenced by the version and not published in the environment, without repetitions. Only screens and navigation
   * have references; if the check fails (for example a 0.3 registry) the publication decides by itself.
   */
  private async missingScreens(kind: DocumentKind, id: string, hash: string, env: string): Promise<string[]> {
    if (kind !== 'screen' && kind !== 'navigation') return [];
    try {
      const report = await this.client.references(this.appId(), kind, id, hash, env);
      return [...new Set(report.missing.map((r) => r.screen))];
    } catch {
      return [];
    }
  }

  /** The document saved or opened from the registry has no changes to save (only the kinds with an editor mode). */
  private markSaved(doc: Json): void {
    const kind = this.kind();
    if (kind !== 'messages') this.saved.markSaved(this.document(), doc);
  }

  /** Runs an operation reporting errors in an understandable way, without technical details of the service. */
  private async run(action: () => Promise<void>): Promise<void> {
    this.working.set(true);
    try {
      await action();
      this.session.status.set('available');
    } catch (e) {
      // Without a session the panel shows «Sign in» instead of a message.
      if (e instanceof RegistryError && e.status === 401) this.session.status.set('login');
      else this.session.report(e);
    } finally {
      this.working.set(false);
    }
  }
}

