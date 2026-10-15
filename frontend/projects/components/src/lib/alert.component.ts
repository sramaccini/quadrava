import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { ScreenRuntime, Scope } from 'core';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { MarkdownComponent } from './markdown.component';
import type { AlertNode } from 'schema';

/** Fixed message in the page: information, confirmation or error. It appears and disappears with `visibleIf`. */
@Component({
  selector: 'lc-alert',
  imports: [NzAlertModule, MarkdownComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div [attr.role]="kind() === 'error' ? 'alert' : 'status'">
      @if (node().format === 'markdown') {
        <nz-alert [nzType]="kind()" [nzMessage]="formatted" nzShowIcon />
        <ng-template #formatted><lc-markdown [source]="runtime().text(node().text, scope())" /></ng-template>
      } @else {
        <nz-alert [nzType]="kind()" [nzMessage]="runtime().text(node().text, scope())" nzShowIcon />
      }
    </div>
  `,
})
export class AlertComponent {
  readonly node = input.required<AlertNode>();
  readonly runtime = input.required<ScreenRuntime>();
  readonly scope = input<Scope>({});
  protected readonly kind = computed(() => this.node().kind ?? 'info');
}
