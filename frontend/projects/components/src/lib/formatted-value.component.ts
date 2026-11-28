import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { FormattedValue } from 'core';
import { safeImageSrc } from './display.component';

/**
 * The text of a formatted value. A value with a `title` (the `relative` format: «3 days ago») shows it as a tooltip
 * and gives it to screen readers too, so the exact date is never only on hover. An `image` value is a small picture,
 * with the name of the file as its text; an address that is not allowed shows nothing.
 */
@Component({
  selector: 'lc-formatted-value',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .thumb { display: block; height: 32px; max-width: 64px; object-fit: cover; border-radius: 4px; }
    .visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  `,
  template: `
    @if (value().image !== undefined) {
      @if (src(); as s) {
        <img class="thumb" [src]="s" [alt]="value().text" loading="lazy" />
      }
    } @else if (value().title; as title) {
      <span [title]="title">{{ value().text }}</span><span class="visually-hidden"> ({{ title }})</span>
    } @else {
      {{ value().text }}
    }
  `,
})
export class FormattedValueComponent {
  readonly value = input.required<FormattedValue>();
  /** The address of an image cell, when it is allowed (same application, https or an embedded image). */
  protected readonly src = computed(() => safeImageSrc(this.value().image ?? ''));
}
