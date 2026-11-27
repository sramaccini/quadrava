import { afterNextRender, ChangeDetectionStrategy, Component, computed, ElementRef, inject, Injector, input, linkedSignal, signal } from '@angular/core';
import { I18n, rowsOf, runSteps, type ScreenRuntime, type Scope } from 'core';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import type { CommentsNode, Expression } from 'schema';
import { BusyComponent } from './busy.component';
import { durationText, filterThread, mentionsIn, threadOf, type ThreadComment, type ThreadFilter } from './comments-thread';
import { IconComponent } from './icon.component';
import { MarkdownComponent } from './markdown.component';
import { nextId } from './shared';
import type { Suggestion, SuggestSpec } from './suggest';
import { SuggestInputComponent } from './suggest-input.component';

type Row = Record<string, unknown>;
/** A chip above the feed: its text and the rows it keeps. */
interface Chip {
  label: string;
  filter: ThreadFilter;
}

/**
 * Thread of comments of a data source: author with initials, date and text in restricted Markdown (`lc-markdown`, never
 * HTML), in date order. With `onPost` (and `postIf`, fail-closed) a box for writing below: Markdown, `@` to mention the
 * people of `mentions` (suggested while typing), Ctrl+Enter or the button to publish. The steps see `text` and
 * `mentions`; the box is emptied when they succeed and the outcome is announced. With `onEdit` and `onDelete` (and
 * `editIf`, `deleteIf` with the comment in `row`) each comment has its buttons: Edit turns it into the same box.
 * With `kindField` it is a feed of activity: the rows of `changes` are lines «changed Status from To do to Done», those of
 * `workLog` lines «logged 2 hr» with their text; `filters` adds the chips All, Comments, History, Work log and
 * `orderToggle` a button that turns the order (kept in `orderBind` when given).
 */
@Component({
  selector: 'lc-comments',
  imports: [BusyComponent, IconComponent, MarkdownComponent, NzAlertModule, NzButtonModule, SuggestInputComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: block; }
    .thread { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }
    article { display: grid; grid-template-columns: 28px 1fr; gap: 0 10px; }
    .avatar { grid-row: span 3; display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 50%;
      background: var(--lc-color-primary, #1f5fbf); color: var(--lc-color-on-primary, #fff); font-size: 11px; font-weight: 600; }
    header { display: flex; flex-wrap: wrap; gap: 0 8px; align-items: baseline; }
    .author { font-weight: 600; }
    time, .edited { font-size: 12px; color: var(--lc-color-muted, #5d6b7a); }
    .tools { display: flex; gap: 4px; }
    .tools button { padding: 0; height: auto; font-size: 12px; }
    .empty { color: var(--lc-color-muted, #5d6b7a); margin: 0; }
    .compose { margin-top: 16px; display: flex; flex-direction: column; gap: 6px; }
    .compose label { font-weight: 600; }
    .editing { display: flex; flex-direction: column; gap: 6px; }
    .bar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: space-between; }
    .buttons { display: flex; flex-wrap: wrap; gap: 8px; }
    .hint { font-size: 12px; color: var(--lc-color-muted, #5d6b7a); }
    .feed-bar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: space-between; margin-bottom: 12px; }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .line { color: var(--lc-color-muted, #5d6b7a); }
    .visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  `,
  template: `
    @if (source().status === 'error') {
      <div role="alert"><nz-alert nzType="error" [nzMessage]="source().error ?? null" nzShowIcon /></div>
    } @else {
      @if (chips().length || node().orderToggle) {
        <div class="feed-bar">
          @if (chips().length) {
            <div class="chips" role="group" [attr.aria-label]="i18n.t('lc.activity.show')">
              @for (chip of chips(); track $index) {
                <button nz-button nzSize="small" type="button" [nzType]="chipIndex() === $index ? 'primary' : 'default'" [attr.aria-pressed]="chipIndex() === $index" (click)="chipIndex.set($index)">
                  {{ chip.label }}
                </button>
              }
            </div>
          }
          @if (node().orderToggle) {
            <button nz-button nzType="text" nzSize="small" type="button" (click)="toggleOrder()">
              <lc-icon name="move" />
              {{ i18n.t(order() === 'desc' ? 'lc.activity.newestFirst' : 'lc.activity.oldestFirst') }}
            </button>
          }
        </div>
      }
      <lc-busy [busy]="source().status === 'loading'" [empty]="!all().length">
        @if (comments().length) {
          <ol class="thread" [attr.aria-label]="i18n.t(node().kindField ? 'lc.activity' : 'lc.comments')">
            @for (c of comments(); track $index) {
              <li>
                <article [attr.aria-label]="c.author">
                  <span class="avatar" aria-hidden="true">{{ c.initials }}</span>
                  <header>
                    <span class="author">{{ c.author }}</span>
                    @if (c.kind !== 'comment') {
                      &ngsp;<span class="line">{{ line(c) }}</span>
                    }
                    @if (c.iso) {
                      <time [attr.datetime]="c.iso">{{ format().format(c.time!) }}</time>
                    }
                    @if (c.edited) {
                      <span class="edited">{{ i18n.t('lc.commentEdited') }}</span>
                    }
                  </header>
                  @if (editing() === c.row) {
                    <div class="editing">
                      <lc-suggest-input
                        [inputId]="boxId + '-edit'"
                        [rows]="3"
                        trigger="@"
                        [label]="i18n.t('lc.commentEditBox')"
                        [spec]="mentionSpec()"
                        [runtime]="runtime()"
                        [scope]="scope()"
                        [value]="editDraft()"
                        [disabled]="sending()"
                        [describedBy]="boxId + '-hint'"
                        (typed)="editDraft.set($event.value)"
                        (chosen)="mentioned($event)"
                        (keydown)="editKey($event, c)"
                      />
                      <div class="buttons">
                        <button nz-button nzType="primary" nzSize="small" type="button" [nzLoading]="sending()" [disabled]="!editDraft().trim() || sending()" (click)="save(c)">
                          {{ i18n.t('lc.commentSave') }}
                        </button>
                        <button nz-button nzSize="small" type="button" [disabled]="sending()" (click)="cancel(c)">{{ i18n.t('lc.commentCancel') }}</button>
                      </div>
                    </div>
                  } @else if (c.kind !== 'change') {
                    @if (c.text) {
                      <lc-markdown [source]="c.text" />
                    }
                    @if (canEdit(c.row) || canDelete(c.row)) {
                      <div class="tools">
                        @if (canEdit(c.row)) {
                          <button nz-button nzType="link" type="button" [attr.data-edit]="$index" [disabled]="sending()" (click)="edit(c)">{{ i18n.t('lc.commentEdit') }}</button>
                        }
                        @if (canDelete(c.row)) {
                          <button nz-button nzType="link" nzDanger type="button" [disabled]="sending()" (click)="remove(c)">{{ i18n.t('lc.commentDelete') }}</button>
                        }
                      </div>
                    }
                  }
                </article>
              </li>
            }
          </ol>
        } @else if (all().length) {
          <p class="empty">{{ i18n.t('lc.activity.nothing') }}</p>
        } @else if (source().status !== 'loading') {
          <p class="empty">{{ i18n.t('lc.noComments') }}</p>
        }
      </lc-busy>
    }
    @if (canPost()) {
      <div class="compose">
        <label [for]="boxId">{{ i18n.t('lc.commentWrite') }}</label>
        <lc-suggest-input
          [inputId]="boxId"
          [rows]="3"
          trigger="@"
          [spec]="mentionSpec()"
          [runtime]="runtime()"
          [scope]="scope()"
          [value]="draft()"
          [disabled]="sending()"
          [describedBy]="boxId + '-hint'"
          (typed)="draft.set($event.value)"
          (chosen)="mentioned($event)"
          (keydown)="shortcut($event)"
        />
        <div class="bar">
          <span class="hint" [id]="boxId + '-hint'">{{ hint() }}</span>
          <button nz-button nzType="primary" type="button" [nzLoading]="sending() && !editing()" [disabled]="!draft().trim() || sending()" (click)="post()">
            {{ i18n.t('lc.commentPost') }}
          </button>
        </div>
      </div>
    } @else if (editing()) {
      <span class="visually-hidden" [id]="boxId + '-hint'">{{ hint() }}</span>
    }
    <p class="visually-hidden" aria-live="polite">{{ announcement() }}</p>
  `,
})
export class CommentsComponent {
  readonly node = input.required<CommentsNode>();
  readonly runtime = input.required<ScreenRuntime>();
  readonly scope = input<Scope>({});
  protected readonly i18n = inject(I18n);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  protected readonly boxId = nextId('lc-comment');
  protected readonly draft = signal('');
  protected readonly sending = signal(false);
  protected readonly announcement = signal('');
  /** The row of the comment being changed, and its text. */
  protected readonly editing = signal<Row | null>(null);
  protected readonly editDraft = signal('');
  /** Labels of the people chosen from the suggestions, with their values. */
  private readonly chosen = new Map<string, string>();

  protected readonly source = computed(() => this.runtime().source(this.node().source));
  /** Order chosen with the button, from `order`; with `orderBind` the state wins when it holds asc or desc. */
  private readonly chosenOrder = linkedSignal<'asc' | 'desc'>(() => this.node().order ?? 'asc');
  protected readonly order = computed<'asc' | 'desc'>(() => {
    const bind = this.node().orderBind;
    const kept = bind ? this.runtime().getState(bind) : undefined;
    return kept === 'asc' || kept === 'desc' ? kept : this.chosenOrder();
  });
  /**
   * The chips, with `kindField`: `true` gives All, Comments and, for the kinds the feed has, History and Work log; a list
   * gives those of the screen, each with the values of `kindField` it shows.
   */
  protected readonly chips = computed<Chip[]>(() => {
    const node = this.node();
    if (!node.filters || !node.kindField) return [];
    if (Array.isArray(node.filters)) return node.filters.map((chip) => ({ label: this.runtime().text(chip.label, this.scope()), filter: chip.kinds ? { values: chip.kinds } : {} }));
    const chips: Chip[] = [
      { label: this.i18n.t('lc.activity.all'), filter: {} },
      { label: this.i18n.t('lc.activity.comments'), filter: { kinds: ['comment'] } },
    ];
    if (node.changes) chips.push({ label: this.i18n.t('lc.activity.history'), filter: { kinds: ['change'] } });
    if (node.workLog) chips.push({ label: this.i18n.t('lc.activity.workLog'), filter: { kinds: ['worklog'] } });
    return chips;
  });
  /** Position of the chip chosen: the first at the start, and again when the chips change. */
  protected readonly chipIndex = linkedSignal<number>(() => (this.chips(), 0));
  /** Every row of the feed, and those of the chip chosen. */
  protected readonly all = computed(() => threadOf(rowsOf(this.source().data), this.node(), this.order()));
  protected readonly comments = computed(() => {
    const chosen = this.chips()[this.chipIndex()];
    return chosen ? filterThread(this.all(), chosen.filter) : this.all();
  });
  protected readonly format = computed(() => new Intl.DateTimeFormat(this.i18n.intlLocale(), { dateStyle: 'medium', timeStyle: 'short' }));
  protected readonly hint = computed(() => this.i18n.t(this.node().mentions ? 'lc.commentHintMentions' : 'lc.commentHint'));

  /** The box is there with steps to publish and if `postIf` (when present) says yes; an error counts as no. */
  protected readonly canPost = computed(() => {
    const node = this.node();
    return !!node.onPost?.length && this.allowed(node.postIf, {});
  });

  protected readonly mentionSpec = computed<SuggestSpec | null>(() => {
    const m = this.node().mentions;
    return m ? { source: m.source, valueField: m.valueField ?? 'id', labelField: m.labelField, minChars: m.minChars } : null;
  });

  protected toggleOrder(): void {
    const next = this.order() === 'desc' ? 'asc' : 'desc';
    this.chosenOrder.set(next);
    const bind = this.node().orderBind;
    if (bind) this.runtime().setState(bind, next);
  }

  /** The line of a change or of a work log, after the author. */
  protected line(item: ThreadComment): string {
    if (item.kind === 'worklog') return this.i18n.t('lc.activity.logged', { time: item.minutes === null || item.minutes === undefined ? '—' : durationText(item.minutes, this.i18n.intlLocale()) });
    const change = item.change!;
    const keys = this.node().changes ?? {};
    const field = keys.fieldKey ? this.i18n.t(`${keys.fieldKey}.${change.field}`, {}, change.field) : change.field;
    const from = this.valueText(change.field, change.from);
    const to = this.valueText(change.field, change.to);
    if (!to) return this.i18n.t('lc.activity.cleared', { field });
    return from ? this.i18n.t('lc.activity.changed', { field, from, to }) : this.i18n.t('lc.activity.set', { field, to });
  }

  /** A value of a change as text, translated with `valueKey`; a list is joined, an object or nothing is empty. */
  private valueText(field: string, value: unknown): string {
    if (Array.isArray(value)) return value.map((v) => this.valueText(field, v)).filter(Boolean).join(', ');
    if (value === null || value === undefined || typeof value === 'object') return '';
    const raw = String(value);
    const prefix = this.node().changes?.valueKey;
    return prefix && raw ? this.i18n.t(`${prefix}.${field}.${raw}`, {}, raw) : raw;
  }

  protected canEdit(row: Row): boolean {
    return !!this.node().onEdit?.length && this.allowed(this.node().editIf, { row });
  }

  protected canDelete(row: Row): boolean {
    return !!this.node().onDelete?.length && this.allowed(this.node().deleteIf, { row });
  }

  /** A condition with the comment in `row`; absent means yes, an error means no. */
  private allowed(condition: Expression | undefined, extra: Scope): boolean {
    return condition === undefined || this.runtime().engine.evaluateCondition(condition, this.runtime().context({ ...this.scope(), ...extra }), { whenMissing: true, fallback: false });
  }

  protected mentioned(person: Suggestion): void {
    this.chosen.set(person.label, person.value);
  }

  /** Ctrl+Enter (Cmd+Enter on a Mac) publishes. */
  protected shortcut(event: KeyboardEvent): void {
    if (this.isSubmit(event)) {
      event.preventDefault();
      void this.post();
    }
  }

  /** In the box of a comment being changed Ctrl+Enter saves and Escape (with the suggestions closed) cancels. */
  protected editKey(event: KeyboardEvent, comment: ThreadComment): void {
    if (this.isSubmit(event)) {
      event.preventDefault();
      void this.save(comment);
    } else if (event.key === 'Escape' && !event.defaultPrevented && !this.sending()) {
      event.preventDefault();
      this.cancel(comment);
    }
  }

  private isSubmit(event: KeyboardEvent): boolean {
    return event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.defaultPrevented;
  }

  protected async post(): Promise<void> {
    const text = this.draft().trim();
    if (!text || this.sending()) return;
    if (await this.run(this.node().onPost, { text, mentions: mentionsIn(text, this.chosen) }, 'lc.commentPosted')) this.draft.set('');
  }

  protected edit(comment: ThreadComment): void {
    this.editDraft.set(comment.text);
    this.editing.set(comment.row);
    this.focus(`[id="${this.boxId}-edit"]`);
  }

  protected cancel(comment: ThreadComment): void {
    this.editing.set(null);
    this.focusEditButton(comment);
  }

  /** Runs `onEdit`; `mentions` holds the people chosen while changing it who are still in the text. */
  protected async save(comment: ThreadComment): Promise<void> {
    const text = this.editDraft().trim();
    if (!text || this.sending()) return;
    if (await this.run(this.node().onEdit, { row: comment.row, text, mentions: mentionsIn(text, this.chosen) }, 'lc.commentSaved')) {
      this.editing.set(null);
      this.focusEditButton(comment);
    }
  }

  protected async remove(comment: ThreadComment): Promise<void> {
    if (this.sending()) return;
    await this.run(this.node().onDelete, { row: comment.row }, 'lc.commentDeleted');
  }

  /** Runs the steps with the variables given; when they succeed the outcome is announced and the people chosen forgotten. */
  private async run(steps: CommentsNode['onPost'], variables: Scope, done: string): Promise<boolean> {
    this.sending.set(true);
    this.announcement.set('');
    const ok = await runSteps(this.runtime(), steps ?? [], { ...this.scope(), ...variables });
    this.sending.set(false);
    if (ok) {
      this.chosen.clear();
      this.announcement.set(this.i18n.t(done));
    }
    return ok;
  }

  /** Back to the Edit button of the comment, if it is still there (a refresh may have changed the thread). */
  private focusEditButton(comment: ThreadComment): void {
    const index = this.comments().indexOf(comment);
    if (index >= 0) this.focus(`[data-edit="${index}"]`);
  }

  private focus(selector: string): void {
    afterNextRender(() => (this.host.nativeElement.querySelector(selector) as HTMLElement | null)?.focus(), { injector: this.injector });
  }
}
