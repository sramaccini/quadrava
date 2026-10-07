import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { ScreenRuntime, Scope } from 'core';
import type { AlertNode } from 'schema';

/** Messaggio fisso in pagina: informazione, conferma o errore. Compare e sparisce con `visibleIf`. */
@Component({
  selector: 'lc-alert',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .alert { padding: var(--lc-gap, 12px); border: 1px solid var(--lc-color-border, #d5dbe3); border-left-width: 4px; border-radius: var(--lc-radius, 6px); background: var(--lc-color-surface, #fff); color: var(--lc-color-on-surface, #1b2430); }
    .alert.info { border-left-color: var(--lc-color-primary, #1f5fbf); }
    .alert.success { border-left-color: var(--lc-color-success, #2e7d32); }
    .alert.error { border-left-color: var(--lc-color-danger, #c62828); }
  `,
  template: `<div class="alert" [class]="'alert ' + kind()" [attr.role]="kind() === 'error' ? 'alert' : 'status'">{{ runtime().text(node().text, scope()) }}</div>`,
})
export class AlertComponent {
  readonly node = input.required<AlertNode>();
  readonly runtime = input.required<ScreenRuntime>();
  readonly scope = input<Scope>({});
  protected readonly kind = computed(() => this.node().kind ?? 'info');
}
