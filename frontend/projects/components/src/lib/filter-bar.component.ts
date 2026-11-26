import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, input, OnInit, signal, untracked } from '@angular/core';
import { I18n, isEmptyValue, NO_PROBLEM, RemoteChecks, type FieldCheck, type ScreenRuntime, type Scope } from 'core';
import { NzFormModule } from 'ng-zorro-antd/form';
import type { FieldDefinition, FilterBarNode } from 'schema';
import { FieldControlComponent } from './field-control.component';
import { labelInControl } from './file-field.component';
import { checkValue, validationEnv } from './field-validation';
import { nextId } from './shared';

/**
 * Filter bar: it writes into the screen state (`bind`), on which the data sources depend. An empty filter means «all»;
 * a value that breaks the rules of its field (format, pattern, limits) is shown with its message and does not reach the
 * state, so the data sources never search with it. A remote rule is checked as in a form (pause, spinner, newer value
 * cancels the request, answers kept per value): the value reaches the state only once the service accepts it.
 */
@Component({
  selector: 'lc-filter-bar',
  imports: [FieldControlComponent, NzFormModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    nz-form-item { margin-bottom: 0; }
    /* A filter is at least 160px wide, unless its field says how wide it is (width). */
    lc-field-control:not(.sized) { min-width: 160px; }
  `,
  template: `
    <form nz-form ngNoForm nzLayout="inline" role="search" (submit)="$event.preventDefault()">
      <!-- A file or a password is not a search criterion: it is not shown in the filter bar. -->
      @for (field of fields(); track field.name) {
        @if (field.type !== 'file' && field.type !== 'password' && runtime().isVisible(field, scope())) {
          <nz-form-item>
            @if (!labelInControl(field)) {
              <nz-form-label [nzFor]="id + field.name" [nzTooltipTitle]="field.tooltip ? runtime().text(field.tooltip, scope()) : undefined" [nzTooltipIcon]="'question-circle'">{{ runtime().text(field.label, scope()) || field.name }}</nz-form-label>
            }
            @let p = problems()[field.name] ?? noProblem;
            <nz-form-control [nzValidateStatus]="p.error ? 'error' : p.pending ? 'validating' : ''" [nzHasFeedback]="!!p.pending" [nzErrorTip]="p.error ?? undefined">
              <lc-field-control
                [field]="field"
                [runtime]="runtime()"
                [scope]="scope()"
                [value]="value(field)"
                [inputId]="id + field.name"
                [invalid]="!!p.error"
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
  /** A checkbox and a drop zone draw their label themselves. */
  protected readonly labelInControl = labelInControl;
  readonly node = input.required<FilterBarNode>();
  readonly runtime = input.required<ScreenRuntime>();
  readonly scope = input<Scope>({});
  protected readonly i18n = inject(I18n);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly id = nextId('lc-filter') + '-';
  protected readonly noProblem = NO_PROBLEM;
  /** In an inline bar a multi-line text is searched with a one-line box. */
  protected readonly fields = computed(() => this.node().fields.map((f) => (f.type === 'textarea' || f.type === 'richtext' ? { ...f, type: 'text' as const } : f)));
  private readonly remote = computed(() => new RemoteChecks(this.runtime()));
  /** Values typed that are not in the state yet: they break a rule, or a remote check is running or did not pass. */
  private readonly drafts = signal<Readonly<Record<string, unknown>>>({});
  /** Problem of every draft (read in a reactive context, it schedules the remote checks and follows their outcome). */
  protected readonly problems = computed(() => {
    const checks: Record<string, FieldCheck> = {};
    for (const [name, value] of Object.entries(this.drafts())) {
      const field = this.node().fields.find((f) => f.name === name);
      if (field) checks[name] = this.checkOf(field, value);
    }
    return checks;
  });

  constructor() {
    // A draft whose remote check has passed reaches the state: the search starts only then.
    effect(() => {
      const problems = this.problems();
      untracked(() => {
        for (const [name, check] of Object.entries(problems)) {
          const field = this.node().fields.find((f) => f.name === name);
          if (field && !check.error && !check.pending) this.commit(field, this.drafts()[name]);
        }
      });
    });
  }

  ngOnInit(): void {
    this.destroyRef.onDestroy(() => this.remote().destroy());
    // Every declared filter exists in the state (null if not set): the `state.filters.x` expressions never fail.
    for (const field of this.node().fields) {
      if (this.runtime().getState(this.path(field)) === undefined) this.runtime().setState(this.path(field), null);
    }
  }

  protected path(field: FieldDefinition): string {
    return `${this.node().bind}.${field.name}`;
  }

  protected value(field: FieldDefinition): unknown {
    const drafts = this.drafts();
    return field.name in drafts ? drafts[field.name] : (this.runtime().getState(this.path(field)) ?? null);
  }

  protected change(field: FieldDefinition, raw: unknown): void {
    let value: unknown = raw === '' || raw === undefined ? null : raw;
    if (field.type === 'number' && value !== null) value = Number(value);
    const check = isEmptyValue(value) ? NO_PROBLEM : this.checkOf(field, value);
    if (check.error || check.pending) this.drafts.update((all) => ({ ...all, [field.name]: value }));
    else this.commit(field, value);
  }

  private checkOf(field: FieldDefinition, value: unknown): FieldCheck {
    return checkValue(field, value, validationEnv(this.runtime(), this.i18n, this.scope(), { [field.name]: value }, this.node().fields, this.remote()));
  }

  private commit(field: FieldDefinition, value: unknown): void {
    this.drafts.update(({ [field.name]: _, ...rest }) => rest);
    this.runtime().setState(this.path(field), value);
    // A new filter goes back to the first page.
    this.runtime().setState('page', 0);
  }
}
