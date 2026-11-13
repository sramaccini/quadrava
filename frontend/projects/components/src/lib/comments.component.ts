import { afterNextRender, ChangeDetectionStrategy, Component, computed, ElementRef, inject, Injector, input, signal } from '@angular/core';
import { I18n, rowsOf, runSteps, type ScreenRuntime, type Scope } from 'core';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import type { CommentsNode, Expression } from 'schema';
import { BusyComponent } from './busy.component';
import { mentionsIn, threadOf, type ThreadComment } from './comments-thread';
import { MarkdownComponent } from './markdown.component';
import { nextId } from './shared';
import type { Suggestion, SuggestSpec } from './suggest';
import { SuggestInputComponent } from './suggest-input.component';

type Row = Record<string, unknown>;

/**
 * Thread of comments of a data source: author with initials, date and text in restricted Markdown (`lc-markdown`, never
 * HTML), in date order. With `onPost` (and `postIf`, fail-closed) a box for writing below: Markdown, `@` to mention the
 * people of `mentions` (suggested while typing), Ctrl+Enter or the button to publish. The steps see `text` and
 * `mentions`; the box is emptied when they succeed and the outcome is announced. With `onEdit` and `onDelete` (and
 * `editIf`, `deleteIf` with the comment in `row`) each comment has its buttons: Edit turns it into the same box.
 */
@Component({
  selector: 'lc-comments',
  imports: [BusyComponent, MarkdownComponent, NzAlertModule, NzButtonModule, SuggestInputComponent],
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
    .visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  `,
  template: `
    @if (source().status === 'error') {
      <div role="alert"><nz-alert nzType="error" [nzMessage]="source().error ?? null" nzShowIcon /></div>
    } @else {
      <lc-busy [busy]="source().status === 'loading'" [empty]="!comments().length">
        @if (comments().length) {
          <ol class="thread" [attr.aria-label]="i18n.t('lc.comments')">
            @for (c of comments(); track $index) {
              <li>
                <article [attr.aria-label]="c.author">
                  <span class="avatar" aria-hidden="true">{{ c.initials }}</span>
                  <header>
                    <span class="author">{{ c.author }}</span>
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
                  } @else {
                    <lc-markdown [source]="c.text" />
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
  protected readonly comments = computed(() => threadOf(rowsOf(this.source().data), this.node()));
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
