import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { I18n, rowsOf, runSteps, type ScreenRuntime, type Scope } from 'core';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import type { CommentsNode } from 'schema';
import { BusyComponent } from './busy.component';
import { mentionsIn, threadOf } from './comments-thread';
import { MarkdownComponent } from './markdown.component';
import { nextId } from './shared';
import type { Suggestion, SuggestSpec } from './suggest';
import { SuggestInputComponent } from './suggest-input.component';

/**
 * Thread of comments of a data source: author with initials, date and text in restricted Markdown (`lc-markdown`, never
 * HTML), in date order. With `onPost` (and `postIf`, fail-closed) a box for writing below: Markdown, `@` to mention the
 * people of `mentions` (suggested while typing), Ctrl+Enter or the button to publish. The steps see `text` and
 * `mentions`; the box is emptied when they succeed and the outcome is announced.
 */
@Component({
  selector: 'lc-comments',
  imports: [BusyComponent, MarkdownComponent, NzAlertModule, NzButtonModule, SuggestInputComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: block; }
    .thread { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }
    article { display: grid; grid-template-columns: 28px 1fr; gap: 0 10px; }
    .avatar { grid-row: span 2; display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 50%;
      background: var(--lc-color-primary, #1f5fbf); color: var(--lc-color-on-primary, #fff); font-size: 11px; font-weight: 600; }
    header { display: flex; flex-wrap: wrap; gap: 0 8px; align-items: baseline; }
    .author { font-weight: 600; }
    time { font-size: 12px; color: var(--lc-color-muted, #5d6b7a); }
    .empty { color: var(--lc-color-muted, #5d6b7a); margin: 0; }
    .compose { margin-top: 16px; display: flex; flex-direction: column; gap: 6px; }
    .compose label { font-weight: 600; }
    .bar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: space-between; }
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
                  </header>
                  <lc-markdown [source]="c.text" />
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
          <span class="hint" [id]="boxId + '-hint'">{{ i18n.t(node().mentions ? 'lc.commentHintMentions' : 'lc.commentHint') }}</span>
          <button nz-button nzType="primary" type="button" [nzLoading]="sending()" [disabled]="!draft().trim() || sending()" (click)="post()">
            {{ i18n.t('lc.commentPost') }}
          </button>
        </div>
      </div>
    }
    <p class="visually-hidden" aria-live="polite">{{ announcement() }}</p>
  `,
})
export class CommentsComponent {
  readonly node = input.required<CommentsNode>();
  readonly runtime = input.required<ScreenRuntime>();
  readonly scope = input<Scope>({});
  protected readonly i18n = inject(I18n);
  protected readonly boxId = nextId('lc-comment');
  protected readonly draft = signal('');
  protected readonly sending = signal(false);
  protected readonly announcement = signal('');
  /** Labels of the people chosen from the suggestions, with their values. */
  private readonly chosen = new Map<string, string>();

  protected readonly source = computed(() => this.runtime().source(this.node().source));
  protected readonly comments = computed(() => threadOf(rowsOf(this.source().data), this.node()));
  protected readonly format = computed(() => new Intl.DateTimeFormat(this.i18n.intlLocale(), { dateStyle: 'medium', timeStyle: 'short' }));

  /** The box is there with steps to publish and if `postIf` (when present) says yes; an error counts as no. */
  protected readonly canPost = computed(() => {
    const node = this.node();
    if (!node.onPost?.length) return false;
    return node.postIf === undefined || this.runtime().engine.evaluateCondition(node.postIf, this.runtime().context(this.scope()), { whenMissing: true, fallback: false });
  });

  protected readonly mentionSpec = computed<SuggestSpec | null>(() => {
    const m = this.node().mentions;
    return m ? { source: m.source, valueField: m.valueField ?? 'id', labelField: m.labelField, minChars: m.minChars } : null;
  });

  protected mentioned(person: Suggestion): void {
    this.chosen.set(person.label, person.value);
  }

  /** Ctrl+Enter (Cmd+Enter on a Mac) publishes. */
  protected shortcut(event: KeyboardEvent): void {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.defaultPrevented) {
      event.preventDefault();
      void this.post();
    }
  }

  protected async post(): Promise<void> {
    const text = this.draft().trim();
    if (!text || this.sending()) return;
    this.sending.set(true);
    this.announcement.set('');
    const ok = await runSteps(this.runtime(), this.node().onPost ?? [], { ...this.scope(), text, mentions: mentionsIn(text, this.chosen) });
    this.sending.set(false);
    if (ok) {
      this.draft.set('');
      this.chosen.clear();
      this.announcement.set(this.i18n.t('lc.commentPosted'));
    }
  }
}
