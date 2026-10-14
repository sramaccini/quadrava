import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, signal, untracked } from '@angular/core';
import { I18n } from 'core';
import { NzSpinModule } from 'ng-zorro-antd/spin';

/** Prima di mostrare l'indicatore: le risposte veloci non lo fanno lampeggiare. */
export const BUSY_DELAY_MS = 300;
/** Una volta comparso, l'indicatore resta almeno questo tempo (niente sfarfallio). */
export const BUSY_MIN_VISIBLE_MS = 400;
/** Oltre questa attesa la scritta diventa «Ci vuole più del solito…». */
export const BUSY_SLOW_MS = 8000;

/**
 * Indicatore di lavoro in corso, comune a tutti i componenti che leggono un data source: avvolge il contenuto e,
 * se l'attesa dura più di {@link BUSY_DELAY_MS}, mostra uno spinner sopra di esso. Al primo caricamento (`empty`)
 * riserva un'altezza minima, così la pagina salta poco all'arrivo dei dati; nelle ricariche il contenuto vecchio resta
 * visibile, attenuato, e utilizzabile (per esempio i filtri di una tabella). Per i lettori di schermo il contenuto ha
 * `aria-busy` e una regione `status` annuncia l'attesa. Colori e attenuazione dal tema (`--lc-busy-*`).
 */
@Component({
  selector: 'lc-busy',
  imports: [NzSpinModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: block; position: relative; }
    .content { transition: opacity 0.15s; }
    .on .content { opacity: var(--lc-busy-dim, 0.45); }
    .reserve .content { min-height: var(--lc-busy-min-height, 160px); }
    /* Sopra il contenuto ma senza intercettare i clic: filtri e scorrimento restano usabili. */
    .overlay { position: absolute; inset: 0; pointer-events: none; z-index: 2; }
    /* Lo spinner resta in vista anche scorrendo una tabella lunga: al centro della parte visibile, al massimo metà schermo. */
    .spot {
      position: sticky; top: var(--lc-header-height, 0px); height: min(100%, 50vh);
      display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;
    }
    .label {
      font-size: 13px; color: var(--lc-color-on-surface);
      background: var(--lc-color-surface); padding: 2px 10px; border-radius: 999px;
      box-shadow: 0 1px 4px color-mix(in srgb, var(--lc-color-on-surface) 18%, transparent);
    }
    .sr { position: absolute; width: 1px; height: 1px; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
    @media (prefers-reduced-motion: reduce) {
      .content { transition: none; }
      .spot ::ng-deep .ant-spin-dot { animation: none; }
      .spot ::ng-deep .ant-spin-dot-item { animation: none; opacity: 1; }
    }
  `,
  template: `
    <div class="busy" [class.on]="visible()" [class.reserve]="busy() && empty()">
      <div class="content" [attr.aria-busy]="busy()"><ng-content /></div>
      @if (visible()) {
        <div class="overlay" aria-hidden="true">
          <div class="spot">
            <nz-spin nzSimple />
            <span class="label">{{ slow() ? i18n.t('lc.loadingSlow') : i18n.t('lc.loading') }}</span>
          </div>
        </div>
      }
      <!-- Sempre presente (una regione live inserita al momento non sempre viene letta): cambia solo il testo. -->
      <span class="sr" role="status">{{ visible() ? (slow() ? i18n.t('lc.loadingSlow') : i18n.t('lc.loading')) : '' }}</span>
    </div>
  `,
})
export class BusyComponent {
  /** C'è lavoro in corso. */
  readonly busy = input(false);
  /** Non ci sono ancora dati da mostrare (primo caricamento): si riserva un'altezza minima. */
  readonly empty = input(false);
  /** Mostra lo spinner subito, senza il ritardo: per un'attesa chiesta dall'utente (per esempio «Aggiorna»). */
  readonly immediate = input(false);

  protected readonly i18n = inject(I18n);
  protected readonly visible = signal(false);
  protected readonly slow = signal(false);
  private timers: ReturnType<typeof setTimeout>[] = [];
  private shownAt = 0;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.clear());
    effect(() => {
      const busy = this.busy();
      untracked(() => (busy ? this.start() : this.stop()));
    });
    // Un'attesa chiesta dall'utente si mostra subito.
    effect(() => {
      if (this.immediate() && this.busy()) untracked(() => this.show());
    });
  }

  private start(): void {
    this.clear();
    if (this.visible()) {
      this.timers.push(setTimeout(() => this.slow.set(true), BUSY_SLOW_MS));
      return;
    }
    this.timers.push(
      setTimeout(() => this.show(), untracked(() => this.immediate()) ? 0 : BUSY_DELAY_MS),
      setTimeout(() => this.slow.set(true), BUSY_SLOW_MS),
    );
  }

  private show(): void {
    if (this.visible()) return;
    this.visible.set(true);
    this.shownAt = Date.now();
  }

  private stop(): void {
    this.clear();
    if (!this.visible()) {
      this.slow.set(false);
      return;
    }
    const hide = () => {
      this.visible.set(false);
      this.slow.set(false);
    };
    const remaining = BUSY_MIN_VISIBLE_MS - (Date.now() - this.shownAt);
    if (remaining > 0) this.timers.push(setTimeout(hide, remaining));
    else hide();
  }

  private clear(): void {
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }
}
