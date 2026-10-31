import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { I18n, type ScreenRuntime, type Scope } from 'core';
import { NzInputModule } from 'ng-zorro-antd/input';
import { insertSuggestion, suggestionsOf, wordAt, type Suggestion, type SuggestSpec } from './suggest';

/** Wait before asking: keystrokes close together become a single request. */
const DEBOUNCE_MS = 300;

/**
 * Text box with suggestions: while the user types, a GET data source is asked for suggestions with the whole text
 * (`search`) and the word at the cursor (`word`); choosing one replaces that word (or the whole text). The value stays
 * free text. With a `trigger` (the mentions of `comments`: `@`) only the words that start with it ask, with the rest of
 * the word in `search`, and the chosen suggestion is inserted as the trigger followed by its label and a space. With
 * `rows` it is a multi-line box. A WAI-ARIA combobox: the arrows move in the list, Enter inserts, Escape closes, and
 * the number of suggestions is announced. A response older than the latest request is discarded; an error of the data
 * source shows no suggestions. Used by `lc-field-control` (`suggest`) and `lc-comments`.
 */
@Component({
  selector: 'lc-suggest-input',
  imports: [NzInputModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: block; position: relative; }
    .list {
      position: absolute; z-index: 1050; left: 0; right: 0; top: calc(100% + 4px); margin: 0; padding: 4px 0; list-style: none;
      max-height: 256px; overflow-y: auto; background: var(--lc-color-surface, #fff); color: var(--lc-color-on-surface, #1f2933);
      border: 1px solid var(--lc-color-border, #d9d9d9); border-radius: 6px; box-shadow: 0 6px 16px rgb(0 0 0 / 12%);
    }
    .list li { display: flex; gap: 8px; align-items: baseline; padding: 5px 12px; cursor: pointer; }
    .list li.active { background: color-mix(in srgb, var(--lc-color-primary, #1677ff) 12%, transparent); }
    .description { color: var(--lc-color-muted, #5d6b7a); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  `,
  template: `
    @if (rows()) {
      <textarea
        #box
        nz-input
        role="combobox"
        autocomplete="off"
        aria-autocomplete="list"
        [id]="inputId()"
        [rows]="rows()"
        [value]="value()"
        [readonly]="disabled()"
        [attr.placeholder]="placeholder()"
        [attr.aria-label]="label()"
        [attr.aria-describedby]="describedBy()"
        [attr.aria-invalid]="invalid()"
        [attr.aria-expanded]="open()"
        [attr.aria-controls]="inputId() + '-suggestions'"
        [attr.aria-activedescendant]="open() && active() >= 0 ? inputId() + '-suggestion-' + active() : null"
        (input)="changed($any($event.target).value)"
        (change)="typed.emit({ value: $any($event.target).value, event: 'change' })"
        (keydown)="key($event)"
        (blur)="close()"
      ></textarea>
    } @else {
      <input
        #box
        nz-input
        type="text"
        role="combobox"
        autocomplete="off"
        aria-autocomplete="list"
        [id]="inputId()"
        [value]="value()"
        [readonly]="disabled()"
        [attr.placeholder]="placeholder()"
        [attr.aria-label]="label()"
        [attr.aria-describedby]="describedBy()"
        [attr.aria-invalid]="invalid()"
        [attr.aria-expanded]="open()"
        [attr.aria-controls]="inputId() + '-suggestions'"
        [attr.aria-activedescendant]="open() && active() >= 0 ? inputId() + '-suggestion-' + active() : null"
        (input)="changed($any($event.target).value)"
        (change)="typed.emit({ value: $any($event.target).value, event: 'change' })"
        (keydown)="key($event)"
        (blur)="close()"
      />
    }
    <ul class="list" role="listbox" [id]="inputId() + '-suggestions'" [attr.aria-label]="i18n.t('lc.suggestions')" [hidden]="!open()">
      @for (s of suggestions(); track s.value; let i = $index) {
        <li role="option" [id]="inputId() + '-suggestion-' + i" [class.active]="i === active()" [attr.aria-selected]="i === active()" (mousedown)="$event.preventDefault(); choose(i)">
          <span>{{ s.label }}</span>
          @if (s.description) {
            &ngsp;<span class="description">{{ s.description }}</span>
          }
        </li>
      }
    </ul>
    <p class="visually-hidden" aria-live="polite">{{ announcement() }}</p>
  `,
})
export class SuggestInputComponent {
  /** Data source and fields of the suggestions; without it the box never asks. */
  readonly spec = input<SuggestSpec | null>(null);
  readonly runtime = input.required<ScreenRuntime>();
  readonly scope = input<Scope>({});
  readonly value = input('');
  readonly disabled = input(false);
  readonly inputId = input.required<string>();
  readonly invalid = input(false);
  /** Lines of a multi-line box; a single line if absent. */
  readonly rows = input<number | null>(null);
  /** Only words that start with it ask for suggestions (`@` for mentions). */
  readonly trigger = input('');
  /** Accessible name, when there is no visible label; hint and placeholder. */
  readonly label = input<string | null>(null);
  readonly describedBy = input<string | null>(null);
  readonly placeholder = input<string | null>(null);
  /** The text as the user types it (`input`) and when it is committed (`change`: leaving the field, or a suggestion chosen). */
  readonly typed = output<{ value: string; event: 'input' | 'change' }>();
  /** A suggestion has been inserted. */
  readonly chosen = output<Suggestion>();

  protected readonly i18n = inject(I18n);
  protected readonly suggestions = signal<Suggestion[]>([]);
  protected readonly active = signal(-1);
  protected readonly open = computed(() => this.suggestions().length > 0);
  protected readonly announcement = signal('');
  private readonly box = viewChild.required<ElementRef<HTMLInputElement | HTMLTextAreaElement>>('box');
  private timer: ReturnType<typeof setTimeout> | null = null;
  private sequence = 0;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.timer && clearTimeout(this.timer));
  }

  protected changed(text: string): void {
    this.typed.emit({ value: text, event: 'input' });
    this.ask(text);
  }

  /** Asks for the suggestions of the word at the cursor, after a pause; a word too short (or without the trigger) closes the list. */
  private ask(text: string): void {
    if (this.timer) clearTimeout(this.timer);
    const spec = this.spec();
    const { word } = wordAt(text, this.box().nativeElement.selectionStart ?? text.length);
    const trigger = this.trigger();
    const term = trigger ? (word.startsWith(trigger) ? word.slice(trigger.length) : null) : word;
    if (!spec || term === null || term.length < (spec.minChars ?? 1)) {
      this.close();
      return;
    }
    const args = trigger ? { search: term } : { search: text, word };
    this.timer = setTimeout(() => void this.run(spec, args), DEBOUNCE_MS);
  }

  private async run(spec: SuggestSpec, args: Record<string, unknown>): Promise<void> {
    const seq = ++this.sequence;
    const result = await this.runtime().query(spec.source, args, this.scope());
    if (seq !== this.sequence) return;
    const found = result.ok ? suggestionsOf(result.data, spec) : [];
    this.suggestions.set(found);
    this.active.set(-1);
    this.announcement.set(found.length ? this.i18n.t('lc.suggestionsFound', { count: found.length }) : '');
  }

  protected key(event: KeyboardEvent): void {
    const count = this.suggestions().length;
    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && (count || !this.rows())) {
      event.preventDefault();
      if (!count) {
        // Closed list of a single-line box: ask now for the word at the cursor.
        this.ask(this.box().nativeElement.value);
        return;
      }
      const step = event.key === 'ArrowDown' ? 1 : -1;
      this.active.update((i) => (i < 0 ? (step > 0 ? 0 : count - 1) : (i + step + count) % count));
    } else if (event.key === 'Enter' && count && this.active() >= 0) {
      // Enter inserts the suggestion instead of submitting the form (or starting a new line).
      event.preventDefault();
      event.stopPropagation();
      this.choose(this.active());
    } else if (event.key === 'Escape' && count) {
      // Only the list closes, not the dialog around the field.
      event.stopPropagation();
      this.close();
    }
  }

  protected choose(index: number): void {
    const suggestion = this.suggestions()[index];
    if (!suggestion) return;
    const el = this.box().nativeElement;
    const trigger = this.trigger();
    const inserted = trigger ? `${trigger}${suggestion.label} ` : suggestion.value;
    const next = insertSuggestion(el.value, el.selectionStart ?? el.value.length, inserted, trigger ? 'word' : this.spec()?.replace);
    el.value = next.text;
    el.setSelectionRange(next.caret, next.caret);
    this.close();
    this.chosen.emit(suggestion);
    this.typed.emit({ value: next.text, event: 'change' });
  }

  /** Closes the list; a response still on its way is discarded. */
  protected close(): void {
    if (this.timer) clearTimeout(this.timer);
    this.sequence++;
    this.suggestions.set([]);
    this.active.set(-1);
    this.announcement.set('');
  }
}
