import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { FormattedValue } from 'core';

/**
 * The text of a formatted value. A value with a `title` (the `relative` format: «3 days ago») shows it as a tooltip
 * and gives it to screen readers too, so the exact date is never only on hover.
 */
@Component({
  selector: 'lc-formatted-value',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  `,
  template: `
    @if (value().title; as title) {
      <span [title]="title">{{ value().text }}</span><span class="visually-hidden"> ({{ title }})</span>
    } @else {
      {{ value().text }}
    }
  `,
})
export class FormattedValueComponent {
  readonly value = input.required<FormattedValue>();
}
