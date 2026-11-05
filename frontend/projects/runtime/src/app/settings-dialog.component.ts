import { ChangeDetectionStrategy, Component, inject, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { I18n } from 'core';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzRadioModule } from 'ng-zorro-antd/radio';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import { DemoNetwork, NETWORK_SPEEDS, type NetworkSpeed } from '../demo/demo-ports';

/**
 * Settings of the user, opened from the user menu: one tab per setting (theme, language and, only in the demo, the
 * simulated network). A choice applies at once, behind the dialog; «Close» is the only button.
 */
@Component({
  selector: 'lc-settings-dialog',
  imports: [FormsModule, NzButtonModule, NzModalModule, NzRadioModule, NzTabsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    nz-radio-group { display: flex; flex-direction: column; gap: 8px; padding: 4px 0 8px; }
  `,
  template: `
    <nz-modal [nzVisible]="open()" [nzTitle]="i18n.t('app.settings')" [nzFooter]="footer" nzCentered (nzOnCancel)="open.set(false)">
      <ng-container *nzModalContent>
        <nz-tabs>
          <nz-tab [nzTitle]="i18n.t('app.theme')">
            <nz-radio-group [ngModel]="theme()" (ngModelChange)="theme.set($event)" [attr.aria-label]="i18n.t('app.theme')">
              @for (t of themes(); track t) {
                <label nz-radio [nzValue]="t">{{ i18n.t('app.theme.' + t, {}, t) }}</label>
              }
            </nz-radio-group>
          </nz-tab>
          <nz-tab [nzTitle]="i18n.t('app.language')">
            <nz-radio-group [ngModel]="i18n.locale()" (ngModelChange)="i18n.setLocale($event)" [attr.aria-label]="i18n.t('app.language')">
              @for (l of languages(); track l) {
                <label nz-radio [nzValue]="l">{{ i18n.t('app.lang.' + l, {}, l) }}</label>
              }
            </nz-radio-group>
          </nz-tab>
          @if (demo()) {
            <nz-tab [nzTitle]="i18n.t('app.network')">
              <nz-radio-group [ngModel]="network.speed()" (ngModelChange)="network.set($event)" [attr.aria-label]="i18n.t('app.network')">
                @for (s of speeds; track s) {
                  <label nz-radio [nzValue]="s">{{ i18n.t('app.network.' + s) }}</label>
                }
              </nz-radio-group>
            </nz-tab>
          }
        </nz-tabs>
      </ng-container>
      <ng-template #footer>
        <button nz-button nzType="primary" type="button" (click)="open.set(false)">{{ i18n.t('lc.close') }}</button>
      </ng-template>
    </nz-modal>
  `,
})
export class SettingsDialogComponent {
  readonly open = model(false);
  readonly themes = input.required<readonly string[]>();
  /** The theme in use: changed here, applied by the shell. */
  readonly theme = model.required<string>();
  readonly languages = input.required<readonly string[]>();
  /** The demo with the back end in the browser: adds the simulated network. */
  readonly demo = input(false);
  protected readonly i18n = inject(I18n);
  protected readonly network = inject(DemoNetwork);
  protected readonly speeds = Object.keys(NETWORK_SPEEDS) as NetworkSpeed[];
}
