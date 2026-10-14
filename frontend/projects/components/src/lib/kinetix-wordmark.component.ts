import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Logotipo KinetiX (assets/brand): icona più «Kineti» e la «X» colorata, con il nome del prodotto in chiaro accanto
 * («KinetiX Studio»). Il testo è HTML in Sora, non un'immagine: un SVG caricato come immagine non vede i caratteri
 * della pagina e il logotipo uscirebbe in un altro carattere. I colori sono quelli del marchio, fissi e indipendenti
 * dal tema (il marchio non si ricolora), in due varianti: su chiaro e su scuro. Proporzioni come nel logo originale:
 * icona alta 1,45 volte il testo, spazio pari a un quarto dell'icona.
 */
@Component({
  selector: 'lc-kinetix-wordmark',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: inline-flex; font-size: var(--kx-wordmark-size, 20px); }
    .kx {
      --kx-text: #0b1630; --kx-x: #1f4fd8; --kx-product: #4338ca;
      display: inline-flex; align-items: center; gap: 0.36em; line-height: 1; white-space: nowrap;
    }
    .kx.dark { --kx-text: #fff; --kx-x: #38c6f4; --kx-product: #b9b3ff; }
    .icon { width: 1.45em; height: 1.45em; flex: none; }
    .word { font-family: Sora, 'Segoe UI', Arial, sans-serif; font-weight: 600; letter-spacing: -0.03em; color: var(--kx-text); }
    .x { color: var(--kx-x); }
    .product { font-weight: 300; color: var(--kx-product); }
  `,
  template: `
    <span class="kx" [class.dark]="tone() === 'dark'" role="img" [attr.aria-label]="label()">
      @if (icon(); as src) {
        <img class="icon" [src]="src" alt="" />
      }
      @if (!compact()) {
        <span class="word" aria-hidden="true">Kineti<span class="x">X</span>@if (product()) {<span class="product">&nbsp;{{ product() }}</span>}</span>
      }
    </span>
  `,
})
export class KinetixWordmarkComponent {
  /** Nome del prodotto dopo il marchio, per esempio «Studio». */
  readonly product = input('');
  /** Indirizzo dell'icona (`kinetix-icon-small.svg` sotto i 32 px); senza, solo il testo. */
  readonly icon = input<string | null>(null);
  /** Su sfondo chiaro o scuro. */
  readonly tone = input<'light' | 'dark'>('light');
  /** Solo l'icona (barra laterale compressa). */
  readonly compact = input(false);
  protected readonly label = computed(() => (this.product() ? `KinetiX ${this.product()}` : 'KinetiX'));
}
