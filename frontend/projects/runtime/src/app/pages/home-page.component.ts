import { ChangeDetectionStrategy, Component, effect, inject, signal, untracked } from '@angular/core';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { I18n } from 'core';
import { NavigationService } from '../navigation.service';

/** Home page: takes the user to their default destination, or explains that they have no functions available. */
@Component({
  selector: 'lc-home-page',
  imports: [NzAlertModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `.pad { padding: var(--lc-content-padding, 24px); }`,
  template: `
    @if (loadFailed()) {
      <div class="pad" role="alert"><nz-alert nzType="error" nzShowIcon [nzMessage]="i18n.t('lc.navigationLoadFailed')" /></div>
    } @else if (problems().length) {
      <div class="pad" role="alert">
        <nz-alert nzType="error" nzShowIcon [nzMessage]="i18n.t('app.menuInvalid')" [nzDescription]="list" />
        <ng-template #list><ul>@for (p of problems(); track p) { <li>{{ p }}</li> }</ul></ng-template>
      </div>
    } @else if (empty()) {
      <div class="pad" role="status"><nz-alert nzType="info" nzShowIcon [nzMessage]="i18n.t('lc.noFunctions')" /></div>
    } @else {
      <p class="pad" role="status">{{ i18n.t('lc.loading') }}</p>
    }
  `,
})
export class HomePage {
  protected readonly i18n = inject(I18n);
  private readonly navigation = inject(NavigationService);
  protected readonly problems = this.navigation.problems;
  protected readonly loadFailed = this.navigation.loadFailed;
  protected readonly empty = signal(false);

  constructor() {
    effect(() => {
      const runtime = this.navigation.runtime();
      if (!runtime) return;
      // Reads the areas in the effect: if the permissions change it tries again.
      runtime.areas();
      untracked(() => this.empty.set(!this.navigation.openDefault()));
    });
  }
}
