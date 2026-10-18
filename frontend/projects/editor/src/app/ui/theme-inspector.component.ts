import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { I18n } from 'core';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { THEME } from '../model/theme-store';
import { DockPinComponent } from './dock-pin.component';
import { FieldsComponent } from './fields.component';

/**
 * The tokens of the theme (colours, typography, shape, density, layout), with the fields generated from the theme schema. A
 * side panel of the workspace: it shows the theme of the active window.
 */
@Component({
  selector: 'ed-theme-inspector',
  imports: [DockPinComponent, FieldsComponent, NzIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: flex; flex-direction: column; min-height: 0; }
    .ed-panel { flex: 1 1 auto; }
    .note { margin: 0 0 12px; font-size: 12px; color: var(--lc-color-muted); }
  `,
  template: `
    <section class="ed-panel" [attr.aria-label]="i18n.t('ed.inspector')">
      <h2 class="ed-panel-title"><span nz-icon nzType="control" aria-hidden="true"></span>{{ i18n.t('ed.inspector') }}<ed-dock-pin panel="inspector" /></h2>
      <div class="ed-panel-body">
        <p class="note">{{ i18n.t('ed.theme.note') }}</p>
        <ed-fields [path]="[]" [fields]="fields" />
      </div>
    </section>
  `,
})
export class ThemeInspectorComponent {
  protected readonly i18n = inject(I18n);
  protected readonly fields = THEME.rootProperties();
}
