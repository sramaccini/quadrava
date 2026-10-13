import { ChangeDetectionStrategy, Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { I18n, initialInputValue, inputPath, runSteps, type ScreenRuntime, type Scope } from 'core';
import { NzFormModule } from 'ng-zorro-antd/form';
import type { InputNode } from 'schema';
import { FieldControlComponent } from './field-control.component';
import { fieldError, repeaterError } from './field-validation';
import { nextId } from './shared';

/**
 * Campo a sé (casella di testo, elenco a discesa, data…) legato allo stato della schermata: legge e scrive `bind`
 * (`state.<nome>` se assente), così data source, espressioni e passi lo vedono come ogni altro stato. Il testo libero si
 * scrive uscendo dal campo o con Invio, per non ricaricare i data source a ogni carattere. Gli errori di validazione si
 * mostrano dopo la prima modifica; l'enforcement resta del servizio che riceve il valore.
 */
@Component({
  selector: 'lc-input',
  imports: [FieldControlComponent, NzFormModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    /* Da solo non supera i 560px; i contenitori di layout tolgono il limite (--lc-input-max: none) per riempire la cella. */
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
    // Di norma lo stato è già stato preparato dal runtime; qui per i campi in finestre o aggiunti dopo.
    if (this.runtime().getState(this.path()) === undefined) this.runtime().setState(this.path(), initialInputValue(this.node()));
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

