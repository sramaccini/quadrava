import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import type { ScreenRuntime, Scope } from 'core';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzProgressModule } from 'ng-zorro-antd/progress';
import type { ImageNode, LinkNode, ProgressNode, Tone } from 'schema';
import { IconComponent } from './icon.component';

/** Colour of a tone, from the theme. */
export const TONE_COLORS: Record<Tone, string> = {
  neutral: 'var(--lc-color-muted, #5d6b7a)',
  primary: 'var(--lc-color-primary, #1f5fbf)',
  success: 'var(--lc-color-success, #2e7d32)',
  danger: 'var(--lc-color-danger, #c62828)',
};

/**
 * Allowed image address: relative (no protocol, no leading `//` and no `..`), https, or an image embedded
 * in base64. Everything else (javascript:, http:, file:…) is discarded: null.
 */
export function safeImageSrc(raw: string): string | null {
  const src = raw.trim();
  if (/^https:\/\/[^\s]+$/i.test(src)) return src;
  if (/^data:image\/(png|jpeg|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(src)) return src;
  if (/^(\/(?!\/)|[A-Za-z0-9_-])[A-Za-z0-9_\-./%?=&]*$/.test(src) && !src.split(/[/?]/).includes('..') && !src.includes(':')) return src;
  return null;
}

/** Image with alternative text: if the address is not allowed or does not load, the text is shown. */
@Component({
  selector: 'lc-image',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: block; }
    img { display: block; max-width: 100%; height: auto; border-radius: var(--lc-radius, 6px); }
    img.sized { height: var(--lc-image-height); }
    .missing { display: flex; align-items: center; justify-content: center; min-height: 64px; padding: 8px; border: 1px dashed var(--lc-color-border, #d0d7de);
      border-radius: var(--lc-radius, 6px); color: var(--lc-color-muted, #5d6b7a); font-size: 13px; text-align: center; }
  `,
  template: `
    @if (src() && !failed()) {
      <img
        [src]="src()"
        [alt]="alt()"
        [attr.width]="node().width ?? null"
        [class.sized]="!!node().height"
        [style.--lc-image-height.px]="node().height ?? null"
        [style.max-width.px]="node().width ?? null"
        [style.object-fit]="node().height && node().width ? (node().fit ?? 'contain') : null"
        loading="lazy"
        referrerpolicy="no-referrer"
        (error)="failed.set(true)"
      />
    } @else {
      <div class="missing" role="img" [attr.aria-label]="alt()" [style.max-width.px]="node().width ?? null">{{ alt() }}</div>
    }
  `,
})
export class ImageComponent {
  readonly node = input.required<ImageNode>();
  readonly runtime = input.required<ScreenRuntime>();
  readonly scope = input<Scope>({});
  protected readonly failed = signal(false);
  protected readonly src = computed(() => safeImageSrc(this.runtime().text(this.node().src, this.scope())));
  protected readonly alt = computed(() => this.runtime().text(this.node().alt, this.scope()));
}

/**
 * Link: to a screen of the application (internal navigation, with parameters) or to an address. External
 * addresses (https) open in a new tab that cannot act on this one (noopener, noreferrer).
 */
@Component({
  selector: 'lc-link',
  imports: [NzButtonModule, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: inline-block; }
    a { color: var(--lc-color-primary, #1f5fbf); }
    button[nz-button] { padding: 0; height: auto; }
    lc-icon { margin-left: 4px; font-size: 12px; }
  `,
  template: `
    @if (node().screen) {
      <button nz-button nzType="link" type="button" (click)="open()">{{ label() }}</button>
    } @else if (external()) {
      <a [href]="node().href" target="_blank" rel="noopener noreferrer">{{ label() }}<lc-icon name="external" /></a>
    } @else if (node().href) {
      <a [href]="node().href">{{ label() }}</a>
    }
  `,
})
export class LinkComponent {
  readonly node = input.required<LinkNode>();
  readonly runtime = input.required<ScreenRuntime>();
  readonly scope = input<Scope>({});
  protected readonly label = computed(() => this.runtime().text(this.node().label, this.scope()));
  protected readonly external = computed(() => /^https:\/\//i.test(this.node().href ?? ''));

  protected open(): void {
    const node = this.node();
    if (!node.screen) return;
    this.runtime().navigate(node.screen, (this.runtime().resolveValue(node.params ?? {}, this.scope()) ?? {}) as Record<string, unknown>);
  }
}

/** Progress: percentage of `value` over `max` (100 if absent), between 0 and 100; a non-numeric value is not shown. */
@Component({
  selector: 'lc-progress',
  imports: [NzProgressModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: block; }
    .label { display: block; margin-bottom: 4px; font-size: 13px; }
    .missing { color: var(--lc-color-muted, #5d6b7a); }
  `,
  template: `
    @if (label()) {
      <span class="label" [id]="id">{{ label() }}</span>
    }
    @if (percent() !== null) {
      <nz-progress
        role="progressbar"
        [attr.aria-valuenow]="percent()"
        aria-valuemin="0"
        aria-valuemax="100"
        [attr.aria-labelledby]="label() ? id : null"
        [nzPercent]="percent()!"
        [nzType]="node().kind ?? 'line'"
        [nzStrokeColor]="color()"
        [nzWidth]="80"
      />
    } @else {
      <span class="missing">—</span>
    }
  `,
})
export class ProgressComponent {
  private static next = 0;
  readonly node = input.required<ProgressNode>();
  readonly runtime = input.required<ScreenRuntime>();
  readonly scope = input<Scope>({});
  protected readonly id = `lc-progress-${ProgressComponent.next++}`;
  protected readonly label = computed(() => (this.node().label ? this.runtime().text(this.node().label, this.scope()) : ''));
  protected readonly color = computed(() => TONE_COLORS[this.node().tone ?? 'primary']);
  protected readonly percent = computed(() => {
    const value = this.number(this.node().value);
    const max = this.node().max === undefined ? 100 : this.number(this.node().max!);
    if (value === null || max === null || max <= 0) return null;
    return Math.round(Math.min(100, Math.max(0, (value / max) * 100)));
  });

  private number(raw: string | number): number | null {
    const value = typeof raw === 'number' ? raw : this.runtime().resolveValue(raw, this.scope());
    const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
    return Number.isFinite(n) ? n : null;
  }
}
