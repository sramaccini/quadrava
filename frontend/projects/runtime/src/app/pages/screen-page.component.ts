import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { NavigationService } from '../navigation.service';
import { ScreenView } from './screen-view.component';

/** Router page: the screen named in the URL, with the query parameters and its path in the menu. */
@Component({
  selector: 'lc-screen-page',
  imports: [ScreenView],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<lc-screen-view [name]="name()" [params]="params()" [breadcrumb]="breadcrumb()" />`,
})
export class ScreenPage {
  private readonly route = inject(ActivatedRoute);
  private readonly pathParams = toSignal(this.route.paramMap, { requireSync: true });
  private readonly queryParams = toSignal(this.route.queryParamMap, { requireSync: true });
  private readonly navigation = inject(NavigationService);

  /** Path in the menu (area, groups, item) shown as breadcrumbs above the title. */
  protected readonly breadcrumb = computed<string[]>(() => {
    const here = this.navigation.current();
    const runtime = this.navigation.runtime();
    if (!runtime || !here.area || !here.screen) return [];
    return runtime.trail(here.area, here.screen, here.params) ?? [];
  });

  protected readonly name = computed(() => this.pathParams().get('screen') ?? '');
  protected readonly params = computed<Record<string, unknown>>(() => {
    const query = this.queryParams();
    return Object.fromEntries(query.keys.map((key) => [key, query.get(key)]));
  });
}
