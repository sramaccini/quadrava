import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { I18n } from 'core';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzPaginationModule } from 'ng-zorro-antd/pagination';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import { IconComponent } from './icon.component';

/**
 * Piede comune delle tabelle (tabella, datatable, datatable lato server): a sinistra il pulsante facoltativo «Aggiorna»
 * (`refreshable`), a destra le pagine con «prima» e «ultima». Le pagine compaiono solo se ce n'è più di una.
 */
@Component({
  selector: 'lc-table-footer',
  imports: [IconComponent, NzButtonModule, NzPaginationModule, NzTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: flex; align-items: center; gap: 8px; padding-top: var(--lc-gap, 12px); }
    .pages { margin-left: auto; display: flex; align-items: center; gap: 4px; }
    button lc-icon { margin: 0; }
    .refresh.busy lc-icon { animation: lc-spin 1s linear infinite; }
    @keyframes lc-spin { to { transform: rotate(360deg); } }
    @media (prefers-reduced-motion: reduce) { .refresh.busy lc-icon { animation: none; } }
  `,
  template: `
    @if (refreshable()) {
      <button
        nz-button
        type="button"
        class="refresh"
        [class.busy]="busy()"
        [attr.aria-busy]="busy()"
        [attr.aria-disabled]="busy()"
        [attr.aria-label]="i18n.t('lc.refresh')"
        nz-tooltip
        [nzTooltipTitle]="i18n.t('lc.refresh')"
        (click)="busy() || refresh.emit()"
      >
        <!-- Durante il caricamento l'icona gira (niente spinner al suo posto, così il pulsante non cambia misura) e un altro clic
             non fa nulla; il pulsante non si disabilita, altrimenti chi lo usa da tastiera perderebbe il focus. -->
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
  /** Caricamento in corso: «Aggiorna» mostra l'attesa e non si ripete. */
  readonly busy = input(false);
  /** Pagina corrente, da 0. */
  readonly page = input(0);
  readonly pageSize = input(10);
  readonly total = input(0);
  readonly pageChange = output<number>();
  readonly refresh = output<void>();

  protected readonly i18n = inject(I18n);
  protected readonly pages = computed(() => Math.max(1, Math.ceil(this.total() / Math.max(1, this.pageSize()))));

  protected go(page: number): void {
    const target = Math.min(Math.max(0, page), this.pages() - 1);
    if (target !== this.page()) this.pageChange.emit(target);
  }
}
