import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { I18n, type ScreenRuntime, type Scope } from 'core';
import { NzSelectModule } from 'ng-zorro-antd/select';
import type { FieldDefinition } from 'schema';
import { suggestionsOf } from './suggest';

/** Wait before asking for suggestions: keystrokes close together become a single request. */
const DEBOUNCE_MS = 300;

/**
 * The tags of a value: texts without spaces at the ends, empty ones left out, each once (without regard to case, the
 * first one written wins), in the order they were added.
 */
export function tagsOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const item of value) {
    if (item === null || item === undefined || typeof item === 'object') continue;
    const tag = String(item).trim();
    const key = tag.toLocaleLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }
  return tags;
}

/**
 * `tags` field: a free list of short texts (the labels of an issue). Enter or a comma adds what was typed; the
 * suggestions come from `options` and, with `suggest`, from a GET data source asked with `search` while typing. A
 * suggestion is only a help: any text is a tag. Used by the form, the filter bar and the standalone field.
 */
@Component({
  selector: 'lc-tags-field',
  imports: [FormsModule, NzSelectModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `:host { display: block; } nz-select { width: 100%; min-width: 200px; }`,
  template: `
    <nz-select
      [nzId]="inputId()"
      nzMode="tags"
      nzAllowClear
      [nzTokenSeparators]="separators"
      [nzServerSearch]="!!field().suggest"
      [nzPlaceHolder]="placeholder()"
      [nzDisabled]="disabled()"
      [nzMaxMultipleCount]="field().maxItems ?? infinity"
      [nzNotFoundContent]="i18n.t('lc.tagsHint')"
      [ngModel]="tags()"
      (ngModelChange)="changed($event)"
      (nzOnSearch)="search($event)"
      (nzOpenChange)="$event && search('')"
    >
      @for (option of options(); track option.value) {
        <nz-option [nzValue]="option.value" [nzLabel]="option.label" />
      }
    </nz-select>
  `,
})
export class TagsFieldComponent {
  readonly field = input.required<FieldDefinition>();
  readonly runtime = input.required<ScreenRuntime>();
  readonly scope = input<Scope>({});
  readonly value = input<unknown>(null);
  readonly disabled = input(false);
  readonly inputId = input<string | null>(null);
  readonly placeholder = input('—');
  /** Label of an option of `options` (translated with `optionKey`, or from the data). */
  readonly optionLabel = input<(option: string) => string>((option) => option);
  /** In a filter, no tag means «no filter» (null). */
  readonly emptyAsNull = input(false);
  readonly valueChange = output<unknown>();

  protected readonly i18n = inject(I18n);
  protected readonly separators = [','];
  protected readonly infinity = Infinity;
  /** Suggestions of the latest search of `suggest`. */
  private readonly found = signal<string[]>([]);
  /** What is being typed, for `options` when the data source searches (the menu then does not filter by itself). */
  private readonly term = signal('');
  private timer: ReturnType<typeof setTimeout> | null = null;
  private sequence = 0;

  protected readonly tags = computed(() => tagsOf(this.value()));

  /**
   * The options of the field, then the suggestions of the data source, each text once. With `suggest` the options are
   * those containing what is being typed; the tags already there that are not options are drawn by the menu itself.
   */
  protected readonly options = computed(() => {
    const seen = new Set<string>();
    const out: { value: string; label: string }[] = [];
    const add = (value: string, label: string) => {
      if (seen.has(value)) return;
      seen.add(value);
      out.push({ value, label });
    };
    const label = this.optionLabel();
    const term = this.field().suggest ? this.term().toLocaleLowerCase() : '';
    for (const option of this.field().options ?? []) if (label(option).toLocaleLowerCase().includes(term)) add(option, label(option));
    for (const suggestion of this.found()) add(suggestion, suggestion);
    return out;
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.timer && clearTimeout(this.timer));
  }

  protected changed(values: unknown): void {
    const tags = tagsOf(values);
    this.valueChange.emit(this.emptyAsNull() && tags.length === 0 ? null : tags);
  }

  protected search(text: string): void {
    const spec = this.field().suggest;
    if (!spec) return;
    if (this.timer) clearTimeout(this.timer);
    const term = text.trim();
    this.term.set(term);
    if (term.length < (spec.minChars ?? 1)) {
      this.sequence++;
      this.found.set([]);
      return;
    }
    this.timer = setTimeout(() => void this.run(term), DEBOUNCE_MS);
  }

  private async run(term: string): Promise<void> {
    const spec = this.field().suggest!;
    const seq = ++this.sequence;
    const result = await this.runtime().query(spec.source, { search: term, word: term }, this.scope());
    if (seq !== this.sequence) return;
    this.found.set(result.ok ? suggestionsOf(result.data, spec).map((s) => s.value) : []);
  }
}
