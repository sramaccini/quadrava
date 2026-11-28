import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, inject, input, signal, viewChild } from '@angular/core';
import { I18n, rowsOf, runSteps, type ScreenRuntime, type Scope } from 'core';
import type { SearchNode } from 'schema';
import { BusyComponent } from './busy.component';
import { IconComponent } from './icon.component';
import { nextId } from './shared';

/** Wait before searching: keystrokes close together become a single request. */
const DEBOUNCE_MS = 300;

/** A result as the list shows it, with its row for the steps. */
interface SearchResult {
  readonly label: string;
  readonly secondary: string;
  readonly icon: string;
  readonly row: Record<string, unknown>;
}

/** The results of a response: its rows (a list, or the items of a page) with the texts of the fields named. */
export function searchResults(data: unknown, node: Pick<SearchNode, 'labelField' | 'secondaryField' | 'iconField'>): SearchResult[] {
  const text = (value: unknown): string => (typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '');
  return rowsOf(data).flatMap((row) => {
    const label = text(row[node.labelField ?? 'label']);
    if (!label) return [];
    return [{ label, secondary: node.secondaryField ? text(row[node.secondaryField]) : '', icon: node.iconField ? text(row[node.iconField]) : '', row }];
  });
}

/**
 * `search` component: a box that asks a GET data source while the user types (the text in `search`, after `minChars`
 * characters and a short pause) and shows the results in a list under it, as the search of the top bar of a tracker.
 * Picking a result (a click, or Enter on the one chosen with the arrows) runs `onPick` with the result in `row`; Enter
 * with no result chosen runs `onSubmit` with the text. A WAI-ARIA combobox: the arrows move in the list, Escape closes it
 * (and empties the box when it is already closed), the number of results is announced. A response older than the latest
 * request is discarded; an error of the data source shows no results.
 */
@Component({
  selector: 'lc-search',
  imports: [BusyComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: block; position: relative; max-width: 100%; }
    .box {
      display: flex; align-items: center; max-width: 100%; gap: 6px; height: 32px; padding: 0 10px; border-radius: var(--lc-radius, 6px);
      border: 1px solid var(--lc-color-border, #d0d7de); background: var(--lc-color-surface, #fff); color: var(--lc-color-on-surface, #1f2933);
    }
    .box:focus-within { border-color: var(--lc-color-primary, #1677ff); box-shadow: 0 0 0 2px var(--lc-focus-ring, color-mix(in srgb, var(--lc-color-primary, #1677ff) 25%, transparent)); }
    .box lc-icon { color: var(--lc-color-muted, #5d6b7a); }
    input { flex: 1 1 auto; min-width: 0; border: 0; outline: 0; background: transparent; color: inherit; font: inherit; }
    input::-webkit-search-cancel-button { display: none; }
    .panel {
      position: absolute; z-index: 1050; left: 0; min-width: 100%; width: max-content; max-width: min(480px, 90vw); top: calc(100% + 4px);
      background: var(--lc-color-surface, #fff); color: var(--lc-color-on-surface, #1f2933); --lc-busy-min-height: 64px;
      border: 1px solid var(--lc-color-border, #d0d7de); border-radius: 6px; box-shadow: 0 6px 16px rgb(0 0 0 / 12%);
    }
    ul { margin: 0; padding: 4px 0; list-style: none; max-height: 320px; overflow-y: auto; }
    li { display: flex; align-items: center; gap: 8px; padding: 6px 12px; cursor: pointer; }
    li.active { background: color-mix(in srgb, var(--lc-color-primary, #1677ff) 12%, transparent); }
    .texts { display: flex; flex-direction: column; min-width: 0; }
    .label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .secondary { color: var(--lc-color-muted, #5d6b7a); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .none { margin: 0; padding: 8px 12px; color: var(--lc-color-muted, #5d6b7a); }
    .visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  `,
  template: `
    <div class="box" [style.width.px]="node().width ?? 280">
      <lc-icon name="search" />
      <input
        #box
        type="search"
        role="combobox"
        autocomplete="off"
        aria-autocomplete="list"
        [id]="id"
        [value]="text()"
        [attr.placeholder]="placeholder()"
        [attr.aria-label]="label()"
        [attr.aria-expanded]="open()"
        [attr.aria-controls]="id + '-results'"
        [attr.aria-activedescendant]="open() && active() >= 0 ? id + '-result-' + active() : null"
        [disabled]="!runtime().isEnabled(node(), scope())"
        (input)="typed($any($event.target).value)"
        (keydown)="key($event)"
        (blur)="close()"
      />
    </div>
    @if (open()) {
      <div class="panel">
        <lc-busy [busy]="loading()" [empty]="!results().length">
          <ul role="listbox" [id]="id + '-results'" [attr.aria-label]="label()">
            @for (r of results(); track $index; let i = $index) {
              <li role="option" [id]="id + '-result-' + i" [class.active]="i === active()" [attr.aria-selected]="i === active()" (mousedown)="$event.preventDefault(); pick(i)">
                @if (r.icon) {
                  <lc-icon [name]="r.icon" />
                }
                <span class="texts">
                  <span class="label">{{ r.label }}</span>
                  @if (r.secondary) {
                    <span class="secondary">{{ r.secondary }}</span>
                  }
                </span>
              </li>
            }
          </ul>
          @if (!loading() && !results().length) {
            <p class="none">{{ i18n.t('lc.noResults') }}</p>
          }
        </lc-busy>
      </div>
    }
    <p class="visually-hidden" aria-live="polite">{{ announcement() }}</p>
  `,
})
export class SearchComponent {
  readonly node = input.required<SearchNode>();
  readonly runtime = input.required<ScreenRuntime>();
  readonly scope = input<Scope>({});

  protected readonly i18n = inject(I18n);
  protected readonly id = nextId('lc-search');
  protected readonly text = signal('');
  protected readonly results = signal<SearchResult[]>([]);
  protected readonly active = signal(-1);
  protected readonly loading = signal(false);
  /** The list is open from the first search to Escape, a pick or leaving the box. */
  protected readonly open = signal(false);
  protected readonly announcement = signal('');
  protected readonly label = computed(() => this.runtime().text(this.node().label ?? '', this.scope()) || this.i18n.t('lc.search'));
  protected readonly placeholder = computed(() => (this.node().placeholder ? this.runtime().text(this.node().placeholder!, this.scope()) : this.label()));
  private readonly box = viewChild.required<ElementRef<HTMLInputElement>>('box');
  private timer: ReturnType<typeof setTimeout> | null = null;
  private sequence = 0;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.timer && clearTimeout(this.timer));
  }

  protected typed(value: string): void {
    this.text.set(value);
    if (this.timer) clearTimeout(this.timer);
    if (value.trim().length < (this.node().minChars ?? 2)) {
      this.close();
      return;
    }
    this.timer = setTimeout(() => void this.search(value.trim()), DEBOUNCE_MS);
  }

  private async search(term: string): Promise<void> {
    const seq = ++this.sequence;
    this.open.set(true);
    this.loading.set(true);
    const result = await this.runtime().query(this.node().source, { search: term }, this.scope());
    if (seq !== this.sequence) return;
    const found = result.ok ? searchResults(result.data, this.node()) : [];
    this.loading.set(false);
    this.results.set(found);
    this.active.set(-1);
    this.announcement.set(found.length ? this.i18n.t('lc.searchFound', { count: found.length }) : this.i18n.t('lc.noResults'));
  }

  protected key(event: KeyboardEvent): void {
    const count = this.results().length;
    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && this.open() && count) {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      this.active.update((i) => (i < 0 ? (step > 0 ? 0 : count - 1) : (i + step + count) % count));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (this.open() && this.active() >= 0) this.pick(this.active());
      else this.submit();
    } else if (event.key === 'Escape') {
      // Only the list closes, not the window around the box; a second Escape empties it.
      event.stopPropagation();
      if (this.open()) this.close();
      else this.text.set('');
    }
  }

  protected pick(index: number): void {
    const result = this.results()[index];
    const steps = this.node().onPick;
    if (!result) return;
    const search = this.text().trim();
    this.reset();
    if (steps?.length) void runSteps(this.runtime(), steps, { ...this.scope(), row: result.row, search });
  }

  private submit(): void {
    const steps = this.node().onSubmit;
    const search = this.text().trim();
    if (!steps?.length || !search) return;
    this.close();
    void runSteps(this.runtime(), steps, { ...this.scope(), search });
  }

  /** After a pick the box is emptied and leaves the focus where the steps put it. */
  private reset(): void {
    this.close();
    this.text.set('');
    this.box().nativeElement.value = '';
  }

  /** Closes the list; a response still on its way is discarded. */
  protected close(): void {
    if (this.timer) clearTimeout(this.timer);
    this.sequence++;
    this.open.set(false);
    this.loading.set(false);
    this.results.set([]);
    this.active.set(-1);
    this.announcement.set('');
  }
}
