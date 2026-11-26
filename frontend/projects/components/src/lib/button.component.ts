import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { I18n, runSteps, type ScreenRuntime, type Scope } from 'core';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import type { ButtonNode } from 'schema';
import { buttonFace } from './button-face';
import { IconComponent } from './icon.component';

/**
 * A button that runs steps. With `display: "icon"` it shows the icon alone, and its text becomes the name for screen
 * readers and the tooltip; `count` adds a number, `pressed` makes it a toggle (aria-pressed, highlighted). An icon
 * button and a toggle have the default look, the others the primary one.
 */
@Component({
  selector: 'lc-button',
  imports: [IconComponent, NzButtonModule, NzTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // The icon gives way to the spinner while the steps run.
  styles: `
    .gap { margin-inline-end: 8px; }
    .icon-only { min-width: 32px; padding-inline: 8px; }
    .count { margin-inline-start: 6px; font-variant-numeric: tabular-nums; }
    .icon-only .count { margin-inline-start: 4px; }
    .pressed, .pressed:hover, .pressed:focus { color: var(--lc-color-primary); border-color: var(--lc-color-primary); background: color-mix(in srgb, var(--lc-color-primary) 14%, transparent); }
  `,
  template: `
    <button
      nz-button
      [nzType]="face().iconOnly || face().pressed !== null ? 'default' : 'primary'"
      type="button"
      [class.icon-only]="face().iconOnly"
      [class.pressed]="face().pressed === true"
      [attr.aria-pressed]="face().pressed"
      [attr.aria-label]="face().iconOnly || face().count !== null ? face().name : null"
      nz-tooltip
      [nzTooltipTitle]="face().iconOnly ? face().name : null"
      [nzLoading]="busy()"
      [disabled]="busy() || !runtime().isEnabled(node(), scope())"
      (click)="click()"
    >
      @if (node().icon && !busy()) {
        <lc-icon [class.gap]="!face().iconOnly" [name]="node().icon" />
      }
      @if (!face().iconOnly) {
        {{ face().text }}
      }
      @if (face().count !== null) {
        <span class="count" aria-hidden="true">{{ face().count }}</span>
      }
    </button>
  `,
})
export class ButtonComponent {
  readonly node = input.required<ButtonNode>();
  readonly runtime = input.required<ScreenRuntime>();
  readonly scope = input<Scope>({});
  private readonly i18n = inject(I18n);
  protected readonly busy = signal(false);
  protected readonly face = computed(() => {
    const format = new Intl.NumberFormat(this.i18n.intlLocale());
    return buttonFace(this.node(), this.runtime(), this.scope(), (n) => format.format(n));
  });

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
