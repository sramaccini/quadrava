import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { I18n } from 'core';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';

/**
 * A table of names and text values: the property panel shows this way an object whose values are all texts (for example
 * the `settings` of the project, the variables the expressions read as `settings.<name>`). A name that is not valid, or that
 * is already in the table, is not applied and is said; an empty table removes the property.
 */
@Component({
  selector: 'ed-map-field',
  imports: [NzButtonModule, NzIconModule, NzInputModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: block; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th { text-align: left; font-weight: 600; color: var(--lc-color-muted); padding: 0 4px 4px 0; }
    td { padding: 0 4px 4px 0; vertical-align: top; }
    td.name { width: 40%; }
    td.action { width: 1%; }
    input { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 12px; }
    .issue { margin: 2px 0 4px; color: var(--lc-color-danger); font-size: 12px; }
    .empty { margin: 0 0 6px; color: var(--lc-color-muted); font-size: 12px; }
    .visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  `,
  template: `
    @if (entries().length) {
      <table [attr.aria-label]="label()">
        <thead>
          <tr>
            <th scope="col">{{ i18n.t('ed.map.name') }}</th>
            <th scope="col">{{ i18n.t('ed.map.value') }}</th>
            <th scope="col"><span class="visually-hidden">{{ i18n.t('ed.map.actions') }}</span></th>
          </tr>
        </thead>
        <tbody>
          @for (entry of entries(); track $index) {
            <tr [attr.data-entry]="entry[0]">
              <td class="name">
                <input
                  #nameInput
                  nz-input
                  nzSize="small"
                  spellcheck="false"
                  [value]="entry[0]"
                  [attr.aria-label]="i18n.t('ed.map.name') + ' ' + ($index + 1)"
                  [attr.aria-invalid]="invalid() === entry[0]"
                  (change)="rename(entry[0], nameInput)"
                />
              </td>
              <td>
                <input
                  nz-input
                  nzSize="small"
                  spellcheck="false"
                  [value]="entry[1]"
                  [attr.aria-label]="i18n.t('ed.map.valueOf', { name: entry[0] })"
                  (input)="setValue(entry[0], $any($event.target).value)"
                />
              </td>
              <td class="action">
                <button nz-button nzType="text" nzDanger nzSize="small" type="button" [attr.aria-label]="i18n.t('ed.map.remove', { name: entry[0] })" (click)="remove(entry[0])">
                  <span nz-icon nzType="delete"></span>
                </button>
              </td>
            </tr>
            @if (invalid() === entry[0]) {
              <tr>
                <td colspan="3"><p class="issue" role="alert">{{ i18n.t('ed.map.nameInvalid') }}</p></td>
              </tr>
            }
          }
        </tbody>
      </table>
    } @else {
      <p class="empty">{{ i18n.t('ed.map.empty') }}</p>
    }
    <button nz-button nzSize="small" nzType="dashed" type="button" [id]="fieldId()" (click)="add()"><span nz-icon nzType="plus"></span>{{ i18n.t('ed.map.add') }}</button>
  `,
})
export class MapFieldComponent {
  readonly fieldId = input('');
  readonly label = input('');
  readonly value = input<unknown>(undefined);
  /** Rule of the names (`propertyNames.pattern` of the schema); any non-empty name if missing. */
  readonly namePattern = input<string | undefined>(undefined);
  /** The new object, or undefined when the table is empty (the property goes away). */
  readonly valueChange = output<Record<string, string> | undefined>();

  protected readonly i18n = inject(I18n);
  /** Name that could not be applied (not valid or repeated). */
  protected readonly invalid = signal<string | null>(null);

  protected readonly entries = computed<[string, string][]>(() => {
    const value = this.value();
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return [];
    return Object.entries(value).map(([k, v]) => [k, typeof v === 'string' ? v : String(v)]);
  });

  protected add(): void {
    const names = new Set(this.entries().map(([k]) => k));
    let name = 'name';
    for (let n = 2; names.has(name); n++) name = `name${n}`;
    this.emit([...this.entries(), [name, '']]);
  }

  protected rename(from: string, input: HTMLInputElement): void {
    const to = input.value.trim();
    if (to === from) return;
    const pattern = this.namePattern();
    const valid = to !== '' && (!pattern || new RegExp(pattern).test(to)) && !this.entries().some(([k]) => k === to);
    if (!valid) {
      this.invalid.set(from);
      input.value = from;
      return;
    }
    this.invalid.set(null);
    this.emit(this.entries().map(([k, v]) => [k === from ? to : k, v]));
  }

  protected setValue(name: string, value: string): void {
    this.emit(this.entries().map(([k, v]) => [k, k === name ? value : v]));
  }

  protected remove(name: string): void {
    if (this.invalid() === name) this.invalid.set(null);
    this.emit(this.entries().filter(([k]) => k !== name));
  }

  private emit(entries: [string, string][]): void {
    this.valueChange.emit(entries.length ? Object.fromEntries(entries) : undefined);
  }
}
