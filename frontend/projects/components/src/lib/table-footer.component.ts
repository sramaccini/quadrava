import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { I18n } from 'core';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzPaginationModule } from 'ng-zorro-antd/pagination';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import { IconComponent } from './icon.component';

/** After a click on «Refresh» the icon turns at least once, even if the data arrive earlier: the click must give feedback. */
export const REFRESH_MIN_SPIN_MS = 800;

/**
 * Common footer of the tables (table, datatable, server-side datatable): on the left the optional «Refresh» button
 * (`refreshable`), on the right the pages with «first» and «last». The pages appear only when there is more than one.
 */
@Component({
  selector: 'lc-table-footer',
  imports: [IconComponent, NzButtonModule, NzPaginationModule, NzTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: flex; align-items: center; gap: 8px; padding-top: var(--lc-gap, 12px); }
    .pages { margin-left: auto; display: flex; align-items: center; gap: 4px; }
    button lc-icon { margin: 0; }
    .refresh.busy lc-icon { animation: lc-spin 0.8s linear infinite; }
    @keyframes lc-spin { to { transform: rotate(360deg); } }
    @media (prefers-reduced-motion: reduce) { .refresh.busy lc-icon { animation: none; } }
  `,
  template: `
    @if (refreshable()) {
      <button
        nz-button
        type="button"
        class="refresh"
        [class.busy]="spinning()"
        [attr.aria-busy]="spinning()"
        [attr.aria-disabled]="spinning()"
        [attr.aria-label]="i18n.t('lc.refresh')"
        nz-tooltip
        [nzTooltipTitle]="i18n.t('lc.refresh')"
        (click)="onRefresh()"
      >
        <!-- While loading the icon turns (no spinner in its place, so the button does not change size) and another click
             does nothing; the button is not disabled, otherwise keyboard users would lose the focus. -->
        <lc-icon name="reload" />
      </button>
    }
    @if (pages() > 1) {
      <nav class="pages" [attr.aria-label]="i18n.t('lc.pages')">
        <button nz-button nzType="text" type="button" class="first" [disabled]="page() === 0" [attr.aria-label]="i18n.t('lc.firstPage')" nz-tooltip [nzTooltipTitle]="i18n.t('lc.firstPage')" (click)="go(0)">
          <lc-icon name="first" />
        </button>
        <nz-pagination [nzPageIndex]="page() + 1" [nzPageSize]="pageSize()" [nzTotal]="total()" (nzPageIndexChange)="go($event - 1)" />
        <button nz-button nzType="text" type="button" class="last" [disabled]="page() >= pages() - 1" [attr.aria-label]="i18n.t('lc.lastPage')" nz-tooltip [nzTooltipTitle]="i18n.t('lc.lastPage')" (click)="go(pages() - 1)">
          <lc-icon name="last" />
        </button>
      </nav>
    }
  `,
})
export class TableFooterComponent {
  readonly refreshable = input(false);
  /** Loading in progress: «Refresh» shows the wait and does not repeat. */
  readonly busy = input(false);
  /** Current page, from 0. */
  readonly page = input(0);
  readonly pageSize = input(10);
  readonly total = input(0);
  readonly pageChange = output<number>();
  readonly refresh = output<void>();
  /**
   * True from the click on «Refresh» until the icon stops turning: the table shows its central spinner at once, for the
   * same time. Loads not requested with the button do not change it (there the spinner has its own delay).
   */
  readonly refreshingChange = output<boolean>();

  protected readonly i18n = inject(I18n);
  protected readonly pages = computed(() => Math.max(1, Math.ceil(this.total() / Math.max(1, this.pageSize()))));

  /** The icon turns during loading and, after a click, for at least {@link REFRESH_MIN_SPIN_MS}. */
  protected readonly spinning = signal(false);
  private clickedAt = 0;
  /** The icon turns for a click on «Refresh» (not for any load). */
  private manual = false;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
    effect(() => {
      const busy = this.busy();
      untracked(() => {
        clearTimeout(this.timer);
        if (busy) {
          this.setSpinning(true);
          return;
        }
        const remaining = REFRESH_MIN_SPIN_MS - (Date.now() - this.clickedAt);
        if (remaining > 0) this.timer = setTimeout(() => this.setSpinning(false), remaining);
        else this.setSpinning(false);
      });
    });
  }

  private setSpinning(value: boolean): void {
    this.spinning.set(value);
    if (!value && this.manual) {
      this.manual = false;
      this.refreshingChange.emit(false);
    }
  }

  protected onRefresh(): void {
    if (this.spinning()) return;
    this.clickedAt = Date.now();
    this.manual = true;
    this.refreshingChange.emit(true);
    this.setSpinning(true);
    clearTimeout(this.timer);
    // If the load does not start (or ends at once) the icon stops anyway after the minimum turn.
    this.timer = setTimeout(() => {
      if (!this.busy()) this.setSpinning(false);
    }, REFRESH_MIN_SPIN_MS);
    this.refresh.emit();
  }

  protected go(page: number): void {
    const target = Math.min(Math.max(0, page), this.pages() - 1);
    if (target !== this.page()) this.pageChange.emit(target);
  }
}
