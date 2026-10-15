import { ChangeDetectionStrategy, Component, inject, input, linkedSignal, output, signal } from '@angular/core';
import { I18n } from 'core';
import { JsonHighlightDirective } from './code-highlight';
import type { Json } from '../model/doc-ops';

/**
 * Text area for a JSON value (lists of columns, fields, steps…). The value applies when leaving the field
 * (or with Ctrl+Enter), so reformatting does not disturb while typing; if the text is not valid JSON it stays as it is
 * with the error message. With `allowExpression` it also accepts a single `{{ }}` expression as text.
 */
@Component({
  selector: 'ed-json-field',
  imports: [JsonHighlightDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: block; }
    .ed-code textarea { field-sizing: content; max-height: 420px; }
    .error { margin: 4px 0 0; color: var(--lc-color-danger); font-size: 12px; }
  `,
  template: `
    <div class="ed-code">
    <textarea
      [edJsonHighlight]="text()"
      [rows]="minRows()"
      [attr.id]="fieldId()"
      [attr.aria-invalid]="error() ? true : null"
      [attr.aria-describedby]="error() ? fieldId() + '-error' : null"
      [value]="text()"
      (input)="text.set($any($event.target).value); dirty.set(true)"
      (blur)="commit()"
      (keydown.control.enter)="commit()"
      spellcheck="false"
    ></textarea>
    </div>
    @if (error(); as e) {
      <p class="error" [id]="fieldId() + '-error'" role="alert">{{ i18n.t('ed.jsonInvalid', { e: e }) }}</p>
    }
  `,
})
export class JsonFieldComponent {
  protected readonly i18n = inject(I18n);
  readonly value = input<Json | undefined>();
  readonly fieldId = input<string>('');
  readonly allowExpression = input(false);
  readonly minRows = input(3);
  readonly valueChange = output<Json | undefined>();

  protected readonly text = linkedSignal(() => format(this.value()));
  protected readonly dirty = signal(false);
  protected readonly error = linkedSignal<Json | undefined, string | null>({ source: () => this.value(), computation: () => null });

  protected commit(): void {
    if (!this.dirty()) return;
    const raw = this.text().trim();
    if (raw === '') {
      this.finish(undefined);
      return;
    }
    if (this.allowExpression() && /^\{\{[\s\S]+\}\}$/.test(raw)) {
      this.finish(raw);
      return;
    }
    try {
      this.finish(JSON.parse(raw) as Json);
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : String(e));
    }
  }

  private finish(value: Json | undefined): void {
    this.dirty.set(false);
    this.error.set(null);
    this.valueChange.emit(value);
    // Reformat even if the value does not change (for example after only adding spaces).
    this.text.set(format(value));
  }
}

function format(value: Json | undefined): string {
  if (value === undefined) return '';
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2);
}
