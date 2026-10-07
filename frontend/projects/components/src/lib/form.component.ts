import { ChangeDetectionStrategy, Component, computed, effect, input, signal, untracked } from '@angular/core';
import { runSteps, type ScreenRuntime, type Scope } from 'core';
import type { ActionDefinition, FieldDefinition, FormNode } from 'schema';
import { CONTROL_STYLES, nextId } from './shared';

/** Form: i valori iniziali arrivano dal data source `source` (se restituisce un oggetto); le azioni ricevono `form` nello scope. */
@Component({
  selector: 'lc-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    CONTROL_STYLES,
    `
      form { display: flex; flex-direction: column; gap: var(--lc-gap, 12px); max-width: 520px; }
      .actions { display: flex; gap: var(--lc-gap, 12px); }
    `,
  ],
  template: `
    <form novalidate (submit)="$event.preventDefault()">
      @for (field of node().fields; track field.name) {
        @if (runtime().isVisible(field, fieldScope())) {
          <div class="lc-field">
            <label [for]="id + field.name">{{ field.label ?? field.name }}{{ field.required ? ' *' : '' }}</label>
            @switch (field.type) {
              @case ('select') {
                <select class="lc-input" [id]="id + field.name" [disabled]="readOnly(field)" [attr.aria-invalid]="!!error(field)" (change)="set(field, $any($event.target).value)">
                  <option value="">—</option>
                  @for (option of field.options ?? []; track option) {
                    <option [value]="option" [selected]="text(field) === option">{{ option }}</option>
                  }
                </select>
              }
              @case ('checkbox') {
                <input class="lc-input" type="checkbox" [id]="id + field.name" [disabled]="readOnly(field)" [checked]="values()[field.name] === true" (change)="set(field, $any($event.target).checked)" />
              }
              @default {
                <input
                  class="lc-input"
                  [id]="id + field.name"
                  [type]="field.type"
                  [value]="text(field)"
                  [readOnly]="readOnly(field)"
                  [attr.autocomplete]="field.sensitive ? 'off' : null"
                  [attr.aria-invalid]="!!error(field)"
                  (input)="set(field, $any($event.target).value)"
                />
              }
            }
            @if (error(field); as message) {
              <span class="lc-error" role="alert">{{ message }}</span>
            }
          </div>
        }
      }
      <div class="actions">
        @for (action of node().actions ?? []; track $index) {
          @if (runtime().isVisible(action, fieldScope())) {
            <button type="button" class="lc-btn" [disabled]="busy() || !runtime().isEnabled(action, fieldScope())" (click)="run(action)">{{ action.label }}</button>
          }
        }
      </div>
    </form>
  `,
})
export class FormComponent {
  readonly node = input.required<FormNode>();
  readonly runtime = input.required<ScreenRuntime>();
  readonly scope = input<Scope>({});

  protected readonly id = nextId('lc-form') + '-';
  protected readonly values = signal<Record<string, unknown>>({});
  protected readonly busy = signal(false);
  private readonly submitted = signal(false);

  protected readonly fieldScope = computed<Scope>(() => ({ ...this.scope(), form: this.values() }));

  constructor() {
    // Quando il data source arriva con un oggetto, popola i valori del form.
    effect(() => {
      const data = this.runtime().source(this.node().source).data;
      if (data !== null && typeof data === 'object' && !Array.isArray(data)) {
        untracked(() => this.values.set({ ...(data as Record<string, unknown>) }));
      }
    });
  }

  protected text(field: FieldDefinition): string {
    const value = this.values()[field.name];
    return value === null || value === undefined ? '' : String(value);
  }

  protected readOnly(field: FieldDefinition): boolean {
    return this.runtime().isReadOnly(field, this.fieldScope());
  }

  protected set(field: FieldDefinition, raw: unknown): void {
    const value = field.type === 'number' && raw !== '' ? Number(raw) : raw;
    this.values.update((current) => ({ ...current, [field.name]: value }));
  }

  /** Messaggio di errore del campo, mostrato solo dopo il primo tentativo di invio. */
  protected error(field: FieldDefinition): string | null {
    return this.submitted() ? this.validate(field) : null;
  }

  private validate(field: FieldDefinition): string | null {
    const value = this.values()[field.name];
    const empty = value === undefined || value === null || value === '';
    if (field.required && empty && field.type !== 'checkbox') return 'Campo obbligatorio';
    if (field.validate && !empty) {
      const result = this.runtime().engine.interpolate(field.validate.rule, {
        ...this.runtime().context(this.fieldScope()),
        value,
      });
      // regola in errore => non valido (fail-closed)
      if (!result.ok || result.value !== true) return field.validate.message;
    }
    return null;
  }

  protected async run(action: ActionDefinition): Promise<void> {
    if (this.busy()) return;
    this.submitted.set(true);
    const visible = this.node().fields.filter((f) => this.runtime().isVisible(f, this.fieldScope()));
    if (visible.some((f) => this.validate(f) !== null)) return;
    this.busy.set(true);
    try {
      await runSteps(this.runtime(), action.onClick, this.fieldScope());
    } finally {
      this.busy.set(false);
    }
  }
}
