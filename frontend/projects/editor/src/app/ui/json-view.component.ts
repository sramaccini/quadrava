import { ChangeDetectionStrategy, Component, inject, linkedSignal, signal } from '@angular/core';
import { I18n } from 'core';
import { NzButtonModule } from 'ng-zorro-antd/button';
import type { Json } from '../model/doc-ops';
import { DocumentState } from '../model/document-state';

/**
 * Il documento intero come JSON, modificabile a mano. Le modifiche si applicano con «Applica» (un solo passo di
 * annullamento); finché il testo non è JSON valido il documento non cambia.
 */
@Component({
  selector: 'ed-json-view',
  imports: [NzButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: flex; flex-direction: column; height: 100%; min-height: 0; padding: 12px; gap: 8px; }
    .bar { display: flex; align-items: center; gap: 8px; }
    .error { margin: 0; color: var(--lc-color-danger); font-size: 12px; }
    textarea {
      flex: 1; min-height: 0; width: 100%; resize: none; padding: 8px; border: 1px solid var(--lc-color-border); border-radius: var(--lc-radius);
      background: var(--lc-color-surface); color: inherit; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 12px; line-height: 1.5;
    }
    textarea:focus-visible { outline: 2px solid var(--lc-color-primary); outline-offset: -1px; }
  `,
  template: `
    <div class="bar">
      <button nz-button nzType="primary" nzSize="small" type="button" [disabled]="!dirty()" (click)="apply()">{{ i18n.t('ed.json.apply') }}</button>
      <button nz-button nzSize="small" type="button" [disabled]="!dirty()" (click)="revert()">{{ i18n.t('ed.json.revert') }}</button>
      @if (error(); as e) {
        <p class="error" role="alert">{{ i18n.t('ed.jsonInvalid', { e: e }) }}</p>
      }
    </div>
    <textarea [attr.aria-label]="i18n.t('ed.tabs.json')" [value]="text()" (input)="edit($any($event.target).value)" spellcheck="false"></textarea>
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
