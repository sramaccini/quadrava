import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { I18n, runSteps, type ScreenRuntime, type Scope } from 'core';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import type { ButtonNode } from 'schema';
import { PRESSED_COLORS, buttonFace } from './button-face';
import { TONE_COLORS, TONE_TEXT } from './display.component';
import { IconComponent } from './icon.component';

/**
 * A button that runs steps. With `display: "icon"` it shows the icon alone, and its text becomes the name for screen
 * readers and the tooltip; `count` adds a number, `pressed` makes it a toggle (aria-pressed, highlighted with the colour of
 * `tone`, the icon filled when it has a filled form). Otherwise `tone` fills the button; without it an icon button has the
 * default look and a button with text the primary one.
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
    .toned, .toned:hover, .toned:focus { background: var(--lc-button-tone); border-color: var(--lc-button-tone); color: var(--lc-button-on-tone); }
    .toned:hover { filter: brightness(1.08); }
    .pressed, .pressed:hover, .pressed:focus { color: var(--lc-pressed); border-color: var(--lc-pressed); background: color-mix(in srgb, var(--lc-pressed) 14%, transparent); }
  `,
  template: `
    <button
      nz-button
      [nzType]="look() === 'primary' ? 'primary' : 'default'"
      [class.toned]="look() === 'success' || look() === 'danger'"
      [style.--lc-button-tone]="toneColor()"
      [style.--lc-button-on-tone]="toneText()"
      [style.--lc-pressed]="pressedColor()"
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
        <lc-icon [class.gap]="!face().iconOnly" [name]="node().icon" [filled]="face().pressed === true" />
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
  /** The fill of the button: none (neutral) for a toggle; without a tone, neutral for an icon button and primary with text. */
  protected readonly look = computed(() => {
    const face = this.face();
    if (face.pressed !== null) return 'neutral';
    return face.tone ?? (face.iconOnly ? 'neutral' : 'primary');
  });
  protected readonly toneColor = computed(() => TONE_COLORS[this.look()]);
  protected readonly toneText = computed(() => TONE_TEXT[this.look()]);
  protected readonly pressedColor = computed(() => (this.face().pressed === null ? null : PRESSED_COLORS[this.face().tone ?? 'primary']));

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
