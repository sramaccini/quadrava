import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { I18n } from 'core';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCheckboxModule } from 'ng-zorro-antd/checkbox';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { RegistryClient, type DocumentSummary } from '../model/registry-client';
import { applies, applyToMany, documentKey, needsAttention, type BulkAction, type BulkOutcome } from '../model/registry-review';
import { RegistrySession } from '../model/registry-session';

const STATE_COLORS: Record<string, string> = { draft: 'default', 'in-review': 'processing', approved: 'success', rejected: 'error' };
const ACTIONS: BulkAction[] = ['request', 'approve', 'reject', 'publish'];

/**
 * Review of several documents at once (after «Publish project» in a protected environment every resource waits for its own
 * approval): the documents of the application of the registry with the state of their latest version and whether it is
 * published in the environment; the selected ones are sent for review, approved, rejected (with a shared note) or
 * published together. The registry decides on each one (never the author approves, testing and production want approved
 * versions): the outcome is listed document by document.
 */
@Component({
  selector: 'ed-registry-review',
  imports: [FormsModule, NzButtonModule, NzCheckboxModule, NzIconModule, NzInputModule, NzSwitchModule, NzTagModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: flex; flex-direction: column; gap: 10px; }
    .head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; font-size: 13px; }
    .head .where { color: var(--lc-color-muted); }
    .head label { display: inline-flex; align-items: center; gap: 6px; }
    .head .refresh { margin-left: auto; }
    .table { max-height: 50vh; overflow: auto; border: 1px solid var(--lc-color-border); border-radius: var(--lc-radius); }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { padding: 4px 8px; border-bottom: 1px solid var(--lc-color-border); text-align: left; }
    th { position: sticky; top: 0; background: var(--lc-color-surface); }
    td code { font-size: 12px; }
    .muted, .none { color: var(--lc-color-muted); }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .actions input { flex: 1; min-width: 180px; }
    .outcomes { margin: 0; padding-left: 18px; font-size: 13px; }
    .outcomes .failed { color: var(--lc-color-danger); }
  `,
  template: `
    <div class="head">
      <span class="where">{{ i18n.t('ed.review.where', { app: session.appId(), env: session.env() }) }}</span>
      <label><nz-switch nzSize="small" [ngModel]="onlyPending()" (ngModelChange)="onlyPending.set($event)" />{{ i18n.t('ed.review.onlyPending') }}</label>
      <button nz-button nzSize="small" type="button" class="refresh" [disabled]="busy()" (click)="load()"><span nz-icon nzType="reload"></span>{{ i18n.t('ed.review.refresh') }}</button>
    </div>
    <div class="table">
      <table>
        <thead>
          <tr>
            <th scope="col">
              <label nz-checkbox [ngModel]="allSelected()" [nzIndeterminate]="someSelected()" (ngModelChange)="selectAll($event)" [attr.aria-label]="i18n.t('ed.review.selectAll')"></label>
            </th>
            <th scope="col">{{ i18n.t('ed.review.document') }}</th>
            <th scope="col">{{ i18n.t('ed.review.state') }}</th>
            <th scope="col">{{ i18n.t('ed.review.author') }}</th>
            <th scope="col">{{ i18n.t('ed.review.published', { env: session.env() }) }}</th>
          </tr>
        </thead>
        <tbody>
          @for (doc of shown(); track key(doc)) {
            <tr [attr.data-review]="key(doc)">
              <td><label nz-checkbox [ngModel]="selected().has(key(doc))" (ngModelChange)="toggle(doc, $event)" [attr.aria-label]="key(doc)"></label></td>
              <td><span class="muted">{{ i18n.t('ed.kind.' + doc.kind) }}</span> <code>{{ doc.id }}</code></td>
              <td>
                @if (doc.latest?.state; as state) {
                  <nz-tag [nzColor]="colors[state]">{{ i18n.t('ed.registry.state.' + state) }}</nz-tag>
                }
              </td>
              <td>{{ doc.latest?.author }}</td>
              <td>{{ doc.latest && doc.publishedEnvironments?.[session.env()] === doc.latest.hash ? '✓' : '—' }}</td>
            </tr>
          } @empty {
            <tr><td colspan="5" class="none">{{ i18n.t(busy() ? 'lc.loading' : 'ed.review.none') }}</td></tr>
          }
        </tbody>
      </table>
    </div>
    <div class="actions">
      <input nz-input nzSize="small" [attr.aria-label]="i18n.t('ed.review.note')" [placeholder]="i18n.t('ed.review.note')" [ngModel]="note()" (ngModelChange)="note.set($event)" />
      @for (action of actions; track action) {
        <button nz-button nzSize="small" type="button" [attr.data-bulk]="action" [nzType]="action === 'approve' ? 'primary' : 'default'" [nzDanger]="action === 'reject'" [disabled]="busy() || !count(action)" (click)="run(action)">
          {{ i18n.t('ed.review.action.' + action, { n: count(action), env: session.env() }) }}
        </button>
      }
    </div>
    @if (outcomes().length) {
      <ul class="outcomes" role="status">
        @for (outcome of outcomes(); track key(outcome.document)) {
          <li [class.failed]="!outcome.ok"><code>{{ key(outcome.document) }}</code>: {{ outcome.ok ? i18n.t('ed.review.done') : outcome.reason }}</li>
        }
      </ul>
    }
  `,
})
export class RegistryReviewComponent {
  protected readonly session = inject(RegistrySession);
  private readonly client = inject(RegistryClient);
  protected readonly i18n = inject(I18n);
  protected readonly colors = STATE_COLORS;
  protected readonly actions = ACTIONS;
  protected readonly key = documentKey;

  private readonly documents = signal<DocumentSummary[]>([]);
  protected readonly onlyPending = signal(true);
  protected readonly selected = signal<ReadonlySet<string>>(new Set());
  protected readonly note = signal('');
  protected readonly busy = signal(false);
  protected readonly outcomes = signal<BulkOutcome[]>([]);

  protected readonly shown = computed(() => {
    const env = this.session.env();
    const all = this.documents().filter((d) => d.latest);
    return (this.onlyPending() ? all.filter((d) => needsAttention(d, env)) : all).sort((a, b) => documentKey(a).localeCompare(documentKey(b)));
  });
  private readonly chosen = computed(() => this.shown().filter((d) => this.selected().has(documentKey(d))));
  protected readonly allSelected = computed(() => this.shown().length > 0 && this.chosen().length === this.shown().length);
  protected readonly someSelected = computed(() => this.chosen().length > 0 && !this.allSelected());

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    const appId = this.session.appId();
    if (!appId) return;
    this.busy.set(true);
    try {
      this.documents.set(await this.client.documents(appId));
    } catch (e) {
      this.session.report(e);
    } finally {
      this.busy.set(false);
    }
  }

  /** How many of the selected documents the action applies to. */
  protected count(action: BulkAction): number {
    return this.chosen().filter((d) => applies(action, d)).length;
  }

  protected toggle(doc: DocumentSummary, on: boolean): void {
    this.selected.update((set) => {
      const next = new Set(set);
      if (on) next.add(documentKey(doc));
      else next.delete(documentKey(doc));
      return next;
    });
  }

  protected selectAll(on: boolean): void {
    this.selected.set(on ? new Set(this.shown().map(documentKey)) : new Set());
  }

  protected async run(action: BulkAction): Promise<void> {
    const targets = this.chosen().filter((d) => applies(action, d));
    if (!targets.length) return;
    this.busy.set(true);
    try {
      this.outcomes.set(await applyToMany(this.client, this.session.appId(), this.session.env(), action, targets, this.note().trim()));
      this.note.set('');
    } finally {
      this.busy.set(false);
    }
    await this.load();
  }
}
