import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * KinetiX logotype (assets/brand): icon plus «Kineti» and the coloured «X», with the product name in plain text next
 * to it («KinetiX Studio»). The text is HTML in Sora, not an image: an SVG loaded as an image does not see the fonts
 * of the page and the logotype would come out in another font. The colours are the brand ones, fixed and independent
 * of the theme (the brand is not recoloured), in two variants: on light and on dark. Proportions as in the original
 * logo: icon 1.45 times the text height, gap equal to a quarter of the icon.
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
  /** Name of the product after the brand, for example «Studio». */
  readonly product = input('');
  /** Address of the icon (`kinetix-icon-small.svg` below 32 px); without it, text only. */
  readonly icon = input<string | null>(null);
  /** On a light or dark background. */
  readonly tone = input<'light' | 'dark'>('light');
  /** Icon only (collapsed side bar). */
  readonly compact = input(false);
  protected readonly label = computed(() => (this.product() ? `KinetiX ${this.product()}` : 'KinetiX'));
}
