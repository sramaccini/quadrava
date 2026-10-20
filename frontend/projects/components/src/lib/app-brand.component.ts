import { ChangeDetectionStrategy, Component, computed, input, linkedSignal } from '@angular/core';
import type { ThemeBrand } from 'schema';
import { safeImageSrc } from './display.component';

/**
 * Brand of the application at the top left of the side bar, from its theme (`brand`): the logo (its dark variant on a dark
 * side bar, the icon when the bar is collapsed) and, with `showName` or without a logo, the name. Images follow the rules
 * of the image component (relative, https:// or data:image/…); one that does not load leaves the name.
 */
@Component({
  selector: 'lc-app-brand',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: inline-flex; min-width: 0; }
    .brand { display: inline-flex; align-items: center; gap: 10px; min-width: 0; color: var(--lc-sider-text, inherit); }
    img { display: block; max-width: 180px; object-fit: contain; flex: none; }
    .compact img { max-width: 48px; }
    .initial { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: var(--lc-radius, 6px);
      background: var(--lc-color-primary, #1f5fbf); color: var(--lc-color-on-primary, #fff); font-weight: 600; }
    .name { font-size: 18px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  `,
  template: `
    @let b = brand();
    <span class="brand" [class.compact]="compact()" [attr.role]="showsName() ? null : 'img'" [attr.aria-label]="showsName() ? null : b.name || null">
      @if (src(); as image) {
        <img [src]="image" alt="" [style.height.px]="b.height ?? 32" (error)="failed.set(true)" />
      }
      @if (!src() && compact() && b.name) {
        <span class="initial" aria-hidden="true">{{ b.name.charAt(0).toUpperCase() }}</span>
      }
      @if (showsName()) {
        <span class="name">{{ b.name }}</span>
      }
    </span>
  `,
})
export class AppBrandComponent {
  readonly brand = input.required<ThemeBrand>();
  /** Light or dark side bar: on a dark one the logo for dark backgrounds. */
  readonly tone = input<'light' | 'dark'>('light');
  /** Collapsed side bar: the icon, without the name. */
  readonly compact = input(false);

  /** The image did not load: the name is shown instead. */
  protected readonly failed = linkedSignal({ source: () => [this.brand(), this.tone(), this.compact()], computation: () => false });

  protected readonly src = computed(() => {
    const b = this.brand();
    const logo = this.tone() === 'dark' ? (b.logoOnDark ?? b.logo) : b.logo;
    const raw = this.compact() ? (b.icon ?? logo) : logo;
    return this.failed() || !raw ? null : safeImageSrc(raw);
  });

  /** The name as text: asked for, or without an image to show; never in the collapsed bar when there is an image. */
  protected readonly showsName = computed(() => {
    const b = this.brand();
    if (!b.name) return false;
    if (!this.src()) return !this.compact();
    return !!b.showName && !this.compact();
  });
}
