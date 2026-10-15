import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, input, OnInit, signal } from '@angular/core';
import { I18n, initialInputValue, inputPath, runSteps, type ScreenRuntime, type Scope } from 'core';
import { NzFormModule } from 'ng-zorro-antd/form';
import type { InputNode } from 'schema';
import { FieldControlComponent } from './field-control.component';
import { fieldError, repeaterError } from './field-validation';
import { nextId } from './shared';

/**
 * Standalone field (text box, drop-down list, date…) bound to the screen state: it reads and writes `bind`
 * (`state.<name>` if absent), so data sources, expressions and steps see it like any other state. Free text is
 * written when leaving the field or with Enter, so as not to reload the data sources at every character. Validation
 * errors are shown after the first change; enforcement stays with the service that receives the value.
 */
@Component({
  selector: 'lc-input',
  imports: [FieldControlComponent, NzFormModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    /* On its own it is at most 560px wide; layout containers lift the limit (--lc-input-max: none) to fill the cell. */
    :host { display: block; max-width: var(--lc-input-max, 560px); }
    nz-form-item { margin-bottom: 0; }
  `,
  template: `
    @let f = node().field;
    <div nz-form nzLayout="vertical">
      <nz-form-item>
        @if (f.type !== 'checkbox') {
          <nz-form-label [nzFor]="id" [id]="id + '-label'" [nzRequired]="!!f.required" [nzTooltipTitle]="f.tooltip ? runtime().text(f.tooltip, scope()) : undefined" [nzTooltipIcon]="'question-circle'">{{ runtime().text(f.label, scope()) || f.name }}</nz-form-label>
        }
        <nz-form-control [nzValidateStatus]="error() && f.type !== 'repeater' ? 'error' : ''" [nzErrorTip]="error() ?? undefined">
          <lc-field-control
            [field]="f"
            [runtime]="runtime()"
            [scope]="scope()"
            [value]="value()"
            [disabled]="disabled()"
            [inputId]="id"
            [labelId]="id + '-label'"
            [invalid]="!!error()"
            [submitted]="touched()"
            [summary]="error()"
            commitOn="change"
            (valueChange)="change($event)"
          />
        </nz-form-control>
      </nz-form-item>
    </div>
  `,
})
export class InputComponent implements OnInit {
  readonly node = input.required<InputNode>();
  readonly runtime = input.required<ScreenRuntime>();
  readonly scope = input<Scope>({});

  private readonly i18n = inject(I18n);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly id = nextId('lc-input');
  protected readonly touched = signal(false);

  protected readonly path = computed(() => inputPath(this.node()));
  protected readonly value = computed(() => this.runtime().getState(this.path()) ?? null);

  protected readonly disabled = computed(() => {
    const node = this.node();
    const runtime = this.runtime();
    return !runtime.isEnabled(node, this.scope()) || runtime.isReadOnly(node, this.scope()) || runtime.isReadOnly(node.field, this.scope());
  });

  protected readonly error = computed(() => {
    if (!this.touched()) return null;
    const field = this.node().field;
    return field.type === 'repeater'
      ? repeaterError(field, this.value(), this.runtime(), this.scope(), this.i18n)
      : fieldError(field, this.value(), this.runtime(), this.scope(), this.i18n);
  });

  ngOnInit(): void {
    // Usually the state has already been prepared by the runtime; here for fields in windows or added later.
    if (this.runtime().getState(this.path()) === undefined) this.runtime().setState(this.path(), this.runtime().resolveValue(initialInputValue(this.node()), this.scope()));
    // The validate step checks the fields of the group (`default` if not given) while the field is on the screen.
    const unregister = this.runtime().registerValidator(this.node().group ?? 'default', () => {
      this.touched.set(true);
      return this.error() === null;
    });
    this.destroyRef.onDestroy(unregister);
  }

  protected async change(raw: unknown): Promise<void> {
    const field = this.node().field;
    let value: unknown = raw === '' || raw === undefined ? null : raw;
    if (field.type === 'number' && value !== null) {
      const n = Number(value);
      value = Number.isFinite(n) ? n : null;
    }
    if (field.type === 'multiselect' && Array.isArray(value) && value.length === 0) value = null;
    this.touched.set(true);
    this.runtime().setState(this.path(), value);
    const steps = this.node().onChange;
    if (steps?.length) await runSteps(this.runtime(), steps, { ...this.scope(), value });
  }
}

