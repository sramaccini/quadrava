import { ChangeDetectionStrategy, Component, inject, linkedSignal, signal } from '@angular/core';
import { I18n } from 'core';
import { NzButtonModule } from 'ng-zorro-antd/button';
import type { Json } from '../model/doc-ops';
import { JsonHighlightDirective } from './code-highlight';
import { DocumentState } from '../model/document-state';

/**
 * The whole document as JSON, editable by hand. Changes apply with «Apply» (a single undo
 * step); until the text is valid JSON the document does not change.
 */
@Component({
  selector: 'ed-json-view',
  imports: [JsonHighlightDirective, NzButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: flex; flex-direction: column; height: 100%; min-height: 0; padding: 12px; gap: 8px; }
    .bar { display: flex; align-items: center; gap: 8px; }
    .error { margin: 0; color: var(--lc-color-danger); font-size: 12px; }
    .ed-code { flex: 1; }
    .ed-code textarea { flex: 1; min-height: 0; }
  `,
  template: `
    <div class="bar">
      <button nz-button nzType="primary" nzSize="small" type="button" [disabled]="!dirty()" (click)="apply()">{{ i18n.t('ed.json.apply') }}</button>
      <button nz-button nzSize="small" type="button" [disabled]="!dirty()" (click)="revert()">{{ i18n.t('ed.json.revert') }}</button>
      @if (error(); as e) {
        <p class="error" role="alert">{{ i18n.t('ed.jsonInvalid', { e: e }) }}</p>
      }
    </div>
    <div class="ed-code">
      <textarea [edJsonHighlight]="text()" [attr.aria-label]="i18n.t('ed.tabs.json')" [value]="text()" (input)="edit($any($event.target).value)" spellcheck="false"></textarea>
    </div>
  `,
})
export class JsonViewComponent {
  protected readonly store = inject(DocumentState);
  protected readonly i18n = inject(I18n);
  protected readonly text = linkedSignal(() => JSON.stringify(this.store.doc(), null, 2));
  protected readonly dirty = linkedSignal<Json, boolean>({ source: () => this.store.doc(), computation: () => false });
  protected readonly error = signal<string | null>(null);

  protected edit(value: string): void {
    this.text.set(value);
    this.dirty.set(true);
  }

  protected apply(): void {
    try {
      const parsed = JSON.parse(this.text()) as Json;
      this.error.set(null);
      this.store.apply(parsed);
      this.dirty.set(false);
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : String(e));
    }
  }

  protected revert(): void {
    this.error.set(null);
    this.text.set(JSON.stringify(this.store.doc(), null, 2));
    this.dirty.set(false);
  }
}
