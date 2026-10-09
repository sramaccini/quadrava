import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { runSteps, type ScreenRuntime, type Scope } from 'core';
import { NzButtonModule } from 'ng-zorro-antd/button';
import type { ButtonNode } from 'schema';

@Component({
  selector: 'lc-button',
  imports: [NzButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button nz-button nzType="primary" type="button" [nzLoading]="busy()" [disabled]="busy() || !runtime().isEnabled(node(), scope())" (click)="click()">
      {{ runtime().text(node().label, scope()) }}
    </button>
  `,
})
export class ButtonComponent {
  readonly node = input.required<ButtonNode>();
  readonly runtime = input.required<ScreenRuntime>();
  readonly scope = input<Scope>({});
  protected readonly busy = signal(false);

  protected async click(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      await runSteps(this.runtime(), this.node().onClick, this.scope());
    } finally {
      this.busy.set(false);
    }
  }
}
