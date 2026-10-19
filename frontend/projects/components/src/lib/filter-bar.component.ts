import { ChangeDetectionStrategy, Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { I18n, isEmptyValue, type ScreenRuntime, type Scope } from 'core';
import { NzFormModule } from 'ng-zorro-antd/form';
import type { FieldDefinition, FilterBarNode } from 'schema';
import { FieldControlComponent } from './field-control.component';
import { checkValue, validationEnv } from './field-validation';
import { nextId } from './shared';

/**
 * Filter bar: it writes into the screen state (`bind`), on which the data sources depend. An empty filter means «all»;
 * a value that breaks the rules of its field (format, pattern, limits) is shown with its message and does not reach the
 * state, so the data sources never search with it.
 */
@Component({
  selector: 'lc-filter-bar',
  imports: [FieldControlComponent, NzFormModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    nz-form-item { margin-bottom: 0; }
    lc-field-control { min-width: 160px; }
  `,
  template: `
    <form nz-form ngNoForm nzLayout="inline" role="search" (submit)="$event.preventDefault()">
      <!-- A file is not a search criterion: it is not shown in the filter bar. -->
      @for (field of fields(); track field.name) {
        @if (field.type !== 'file' && runtime().isVisible(field, scope())) {
          <nz-form-item>
            @if (field.type !== 'checkbox') {
              <nz-form-label [nzFor]="id + field.name" [nzTooltipTitle]="field.tooltip ? runtime().text(field.tooltip, scope()) : undefined" [nzTooltipIcon]="'question-circle'">{{ runtime().text(field.label, scope()) || field.name }}</nz-form-label>
            }
            <nz-form-control [nzValidateStatus]="errors()[field.name] ? 'error' : ''" [nzErrorTip]="errors()[field.name] ?? undefined">
              <lc-field-control
                [field]="field"
                [runtime]="runtime()"
                [scope]="scope()"
                [value]="value(field)"
                [inputId]="id + field.name"
                [invalid]="!!errors()[field.name]"
                variant="filter"
                [placeholder]="i18n.t('lc.all')"
                commitOn="change"
                (valueChange)="change(field, $event)"
              />
            </nz-form-control>
          </nz-form-item>
        }
      }
    </form>
  `,
})
export class FilterBarComponent implements OnInit {
  readonly node = input.required<FilterBarNode>();
  readonly runtime = input.required<ScreenRuntime>();
  readonly scope = input<Scope>({});
  protected readonly i18n = inject(I18n);
  protected readonly id = nextId('lc-filter') + '-';
  /** Message of the filters whose last value was not valid (that value is not in the state). */
  protected readonly errors = signal<Record<string, string>>({});
  /** In an inline bar a multi-line text is searched with a one-line box. */
  protected readonly fields = computed(() => this.node().fields.map((f) => (f.type === 'textarea' || f.type === 'richtext' ? { ...f, type: 'text' as const } : f)));
  ngOnInit(): void {
    // Every declared filter exists in the state (null if not set): the `state.filters.x` expressions never fail.
    for (const field of this.node().fields) {
      if (this.runtime().getState(this.path(field)) === undefined) this.runtime().setState(this.path(field), null);
    }
  }

  protected path(field: FieldDefinition): string {
    return `${this.node().bind}.${field.name}`;
  }

  protected value(field: FieldDefinition): unknown {
    return this.runtime().getState(this.path(field)) ?? null;
  }


  protected change(field: FieldDefinition, raw: unknown): void {
    let value: unknown = raw === '' || raw === undefined ? null : raw;
    if (field.type === 'number' && value !== null) value = Number(value);
    const error = isEmptyValue(value) ? null : checkValue(field, value, validationEnv(this.runtime(), this.i18n, this.scope(), { [field.name]: value }, this.node().fields)).error;
    this.errors.update(({ [field.name]: _, ...rest }) => (error ? { ...rest, [field.name]: error } : rest));
    if (error) return;
    this.runtime().setState(this.path(field), value);
    // A new filter goes back to the first page.
    this.runtime().setState('page', 0);
  }
}
