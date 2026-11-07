import { ChangeDetectionStrategy, Component, inject, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { I18n, type VisibleLeaf } from 'core';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import { DemoNetwork, NETWORK_SPEEDS, type NetworkSpeed } from '../demo/demo-ports';
import { ScreenView } from './pages/screen-view.component';

/**
 * Settings of the user, opened from the user menu: «General» (theme and language), the sections of the application
 * (ADR-25: each one a screen of the application, drawn when its tab is first opened) and, only in the demo, «Debug» (the
 * simulated network). A choice of «General» applies at once, behind the dialog; the screens of the sections save with
 * their own actions; «Close» is the only button of the dialog. The dialog keeps the same size whatever the tab, larger
 * when the application has sections.
 */
@Component({
  selector: 'lc-settings-dialog',
  imports: [FormsModule, NzButtonModule, NzModalModule, NzSelectModule, NzTabsModule, ScreenView],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .tab { display: grid; grid-template-columns: max-content minmax(0, 1fr); align-items: center; gap: 12px 16px; padding: 8px 0; }
    nz-select { width: 100%; }
    /* A section is a screen: no page margins inside the dialog. */
    .section { --lc-content-padding: 0; padding-top: 8px; }
  `,
  template: `
    <nz-modal [nzVisible]="open()" [nzTitle]="i18n.t('app.settings')" [nzFooter]="footer" [nzWidth]="sections().length ? 720 : 480" [nzBodyStyle]="{ height: sections().length ? 'min(60vh, 520px)' : '220px', overflow: 'auto' }" nzCentered (nzOnCancel)="open.set(false)">
      <ng-container *nzModalContent>
        <nz-tabs>
          <nz-tab [nzTitle]="i18n.t('app.general')">
            <div class="tab">
              <label for="lc-setting-theme">{{ i18n.t('app.theme') }}</label>
              <nz-select nzId="lc-setting-theme" [ngModel]="theme()" (ngModelChange)="theme.set($event)">
                @for (t of themes(); track t) {
                  <nz-option [nzValue]="t" [nzLabel]="i18n.t('app.theme.' + t, {}, t)" />
                }
              </nz-select>
              <label for="lc-setting-language">{{ i18n.t('app.language') }}</label>
              <nz-select nzId="lc-setting-language" [ngModel]="i18n.locale()" (ngModelChange)="i18n.setLocale($event)">
                @for (l of languages(); track l) {
                  <nz-option [nzValue]="l" [nzLabel]="i18n.t('app.lang.' + l, {}, l)" />
                }
              </nz-select>
            </div>
          </nz-tab>
          @for (section of sections(); track section.id) {
            <nz-tab [nzTitle]="section.label">
              <ng-template nz-tab>
                <div class="section"><lc-screen-view [name]="section.screen" [params]="section.params" /></div>
              </ng-template>
            </nz-tab>
          }
          @if (demo()) {
            <nz-tab [nzTitle]="i18n.t('app.debug')">
              <div class="tab">
                <label for="lc-setting-network">{{ i18n.t('app.network') }}</label>
                <nz-select nzId="lc-setting-network" [ngModel]="network.speed()" (ngModelChange)="network.set($event)">
                  @for (s of speeds; track s) {
                    <nz-option [nzValue]="s" [nzLabel]="i18n.t('app.network.' + s)" />
                  }
                </nz-select>
              </div>
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
  /** Sections of the application (`settings` of the navigation, already filtered for the user). */
  readonly sections = input<readonly VisibleLeaf[]>([]);
  /** The demo with the back end in the browser: adds the «Debug» tab with the simulated network. */
  readonly demo = input(false);
  protected readonly i18n = inject(I18n);
  protected readonly network = inject(DemoNetwork);
  protected readonly speeds = Object.keys(NETWORK_SPEEDS) as NetworkSpeed[];
}
