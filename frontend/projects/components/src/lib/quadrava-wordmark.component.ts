import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Quadrava logotype (assets/brand): icon plus «Quadrava» with the coloured «Q», with the product name in plain text
 * next to it («Quadrava Studio»). The text is HTML in Sora, not an image: an SVG loaded as an image does not see the
 * fonts of the page and the logotype would come out in another font. The colours are the brand ones, fixed and
 * independent of the theme (the brand is not recoloured), in two variants: on light and on dark. Proportions as in the
 * SVG logos: icon 1.45 times the text height, gap equal to a quarter of the icon.
 */
@Component({
  selector: 'lc-quadrava-wordmark',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: inline-flex; font-size: var(--qv-wordmark-size, 20px); }
    .qv {
      --qv-text: #0b1630; --qv-q: #1f4fd8; --qv-product: #4338ca;
      display: inline-flex; align-items: center; gap: 0.36em; line-height: 1; white-space: nowrap;
    }
    .qv.dark { --qv-text: #fff; --qv-q: #38c6f4; --qv-product: #b9b3ff; }
    .icon { width: 1.45em; height: 1.45em; flex: none; }
    .word { font-family: Sora, 'Segoe UI', Arial, sans-serif; font-weight: 600; letter-spacing: -0.03em; color: var(--qv-text); }
    .q { color: var(--qv-q); }
    .product { font-weight: 300; color: var(--qv-product); }
  `,
  template: `
    <span class="qv" [class.dark]="tone() === 'dark'" role="img" [attr.aria-label]="label()">
      @if (icon(); as src) {
        <img class="icon" [src]="src" alt="" />
      }
      @if (!compact()) {
        <span class="word" aria-hidden="true"><span class="q">Q</span>uadrava@if (product()) {<span class="product">&nbsp;{{ product() }}</span>}</span>
      }
    </span>
  `,
})
export class QuadravaWordmarkComponent {
  /** Name of the product after the brand, for example «Studio». */
  readonly product = input('');
  /** Address of the icon (`quadrava-icon-small.svg` below 32 px); without it, text only. */
  readonly icon = input<string | null>(null);
  /** On a light or dark background. */
  readonly tone = input<'light' | 'dark'>('light');
  /** Icon only (collapsed side bar). */
  readonly compact = input(false);
  protected readonly label = computed(() => (this.product() ? `Quadrava ${this.product()}` : 'Quadrava'));
}
