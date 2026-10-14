import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { I18n } from 'core';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzPaginationModule } from 'ng-zorro-antd/pagination';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import { IconComponent } from './icon.component';

/** Dopo un clic su «Aggiorna» l'icona gira almeno un giro, anche se i dati arrivano prima: il clic deve dare un riscontro. */
export const REFRESH_MIN_SPIN_MS = 800;

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

  /** L'icona gira durante il caricamento e, dopo un clic, almeno {@link REFRESH_MIN_SPIN_MS}. */
  protected readonly spinning = signal(false);
  private clickedAt = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
    effect(() => {
      const busy = this.busy();
      untracked(() => {
        clearTimeout(this.timer);
        if (busy) {
          this.spinning.set(true);
          return;
        }
        const remaining = REFRESH_MIN_SPIN_MS - (Date.now() - this.clickedAt);
        if (remaining > 0) this.timer = setTimeout(() => this.spinning.set(false), remaining);
        else this.spinning.set(false);
      });
    });
  }

  protected onRefresh(): void {
    if (this.spinning()) return;
    this.clickedAt = Date.now();
    this.spinning.set(true);
    clearTimeout(this.timer);
    // Se il caricamento non parte (o finisce subito) l'icona si ferma comunque dopo il giro minimo.
    this.timer = setTimeout(() => {
      if (!this.busy()) this.spinning.set(false);
    }, REFRESH_MIN_SPIN_MS);
    this.refresh.emit();
  }

  protected go(page: number): void {
    const target = Math.min(Math.max(0, page), this.pages() - 1);
    if (target !== this.page()) this.pageChange.emit(target);
  }
}
