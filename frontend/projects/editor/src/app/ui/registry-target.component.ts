import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, inject, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { I18n } from 'core';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzInputModule } from 'ng-zorro-antd/input';
import { RegistrySession } from '../model/registry-session';

/**
 * Contenuto della finestra che chiede l'applicazione del registro prima di «Salva in registro», quando non è ancora
 * stata scelta: l'elenco viene dal registro, ma si può scrivere anche un'applicazione nuova.
 */
@Component({
  selector: 'ed-registry-target',
  imports: [FormsModule, NzButtonModule, NzInputModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .field { display: flex; flex-direction: column; gap: 4px; }
    .hint { font-size: 12px; color: var(--lc-color-muted, #5d6b7a); }
    .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
  `,
  template: `
    <form ngNoForm (submit)="$event.preventDefault(); confirm()">
      <div class="field">
        <label for="registry-target-app">{{ i18n.t('ed.registry.app') }}</label>
        <input
          #appInput
          nz-input
          id="registry-target-app"
          list="registry-target-apps"
          spellcheck="false"
          aria-describedby="registry-target-hint"
          [ngModel]="appId()"
          (ngModelChange)="appId.set($event.trim())"
        />
        <datalist id="registry-target-apps">
          @for (a of session.apps(); track a.id) {
            <option [value]="a.id">{{ a.name }}</option>
          }
        </datalist>
        <span class="hint" id="registry-target-hint">{{ i18n.t('ed.saveRegistry.appHint') }}</span>
      </div>
      <div class="actions">
        <button nz-button type="button" (click)="cancelled.emit()">{{ i18n.t('ed.cancel') }}</button>
        <button nz-button nzType="primary" type="submit" [disabled]="!appId()">{{ i18n.t('ed.menu.saveRegistry') }}</button>
      </div>
    </form>
  `,
})
export class RegistryTargetComponent {
  readonly chosen = output<string>();
  readonly cancelled = output<void>();
  protected readonly session = inject(RegistrySession);
  protected readonly i18n = inject(I18n);
  protected readonly appId = signal(this.session.appId());
  private readonly appInput = viewChild.required<ElementRef<HTMLInputElement>>('appInput');

  constructor() {
    afterNextRender(() => this.appInput().nativeElement.focus());
  }

  protected confirm(): void {
    if (this.appId()) this.chosen.emit(this.appId());
  }
}
