import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { ScreenRuntime, Scope } from 'core';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import type { AlertNode } from 'schema';

/** Messaggio fisso in pagina: informazione, conferma o errore. Compare e sparisce con `visibleIf`. */
@Component({
  selector: 'lc-alert',
  imports: [NzAlertModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div [attr.role]="kind() === 'error' ? 'alert' : 'status'">
      <nz-alert [nzType]="kind()" [nzMessage]="runtime().text(node().text, scope())" nzShowIcon />
    </div>
  `,
})
export class AlertComponent {
  readonly node = input.required<AlertNode>();
  readonly runtime = input.required<ScreenRuntime>();
  readonly scope = input<Scope>({});
  protected readonly kind = computed(() => this.node().kind ?? 'info');
}
