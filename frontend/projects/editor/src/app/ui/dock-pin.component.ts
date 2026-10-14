import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { I18n } from 'core';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import { Dock, type DockSide } from './dock';

/**
 * Puntina nella barra del titolo di un riquadro, come negli IDE: fissa il lato o lo nasconde automaticamente. Diritta
 * quando il lato è fissato, coricata quando si nasconde da solo.
 */
@Component({
  selector: 'ed-dock-pin',
  imports: [NzIconModule, NzTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: contents; }
    button {
      display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; margin: -3px -6px -3px auto;
      padding: 0; border: 0; border-radius: 4px; background: none; color: inherit; font-size: 13px; cursor: pointer; opacity: 0.8;
    }
    button:hover { opacity: 1; background: rgb(255 255 255 / 14%); }
    button:focus-visible { outline: 2px solid currentColor; outline-offset: -2px; opacity: 1; }
    button.unpinned .anticon { transform: rotate(-90deg); }
  `,
  template: `
    @let pinned = dock.pinned[side()]();
    <button
      type="button"
      class="pin"
      [class.unpinned]="!pinned"
      [attr.data-dock-pin]="side()"
      [attr.aria-pressed]="pinned"
      [attr.aria-label]="i18n.t('ed.dock.pin')"
      [nz-tooltip]="i18n.t(pinned ? 'ed.dock.autoHide' : 'ed.dock.pin')"
      (click)="dock.togglePin(side())"
    >
      <span nz-icon nzType="pushpin" [nzTheme]="pinned ? 'fill' : 'outline'" aria-hidden="true"></span>
    </button>
  `,
})
export class DockPinComponent {
  readonly side = input.required<DockSide>();
  protected readonly dock = inject(Dock);
  protected readonly i18n = inject(I18n);
}
