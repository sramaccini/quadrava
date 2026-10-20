import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, inject, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { I18n } from 'core';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzInputModule } from 'ng-zorro-antd/input';
import { RunProject, runtimeUrl } from '../model/run-project';

/**
 * Content of the dialog with the address of the runtime that «Run project» opens (remembered in this browser). The
 * runtime must list the origin of Studio among its `studio.origins` (runtime-config.json).
 */
@Component({
  selector: 'ed-runtime-address',
  imports: [FormsModule, NzButtonModule, NzInputModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .field { display: flex; flex-direction: column; gap: 4px; }
    .hint { font-size: 12px; color: var(--lc-color-muted, #5d6b7a); }
    .error { font-size: 12px; color: var(--lc-color-danger, #c62828); }
    .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
  `,
  template: `
    <form ngNoForm (submit)="$event.preventDefault(); confirm()">
      <div class="field">
        <label for="runtime-address">{{ i18n.t('ed.run.address') }}</label>
        <input
          #addressInput
          nz-input
          id="runtime-address"
          type="url"
          spellcheck="false"
          aria-describedby="runtime-address-hint"
          [attr.aria-invalid]="!valid()"
          [ngModel]="address()"
          (ngModelChange)="address.set($event)"
        />
        <span class="hint" id="runtime-address-hint">{{ i18n.t('ed.run.addressHint', { origin: origin }) }}</span>
        @if (!valid()) {
          <span class="error" role="alert">{{ i18n.t('ed.run.invalidAddress') }}</span>
        }
      </div>
      <div class="actions">
        <button nz-button type="button" (click)="cancelled.emit()">{{ i18n.t('ed.cancel') }}</button>
        <button nz-button nzType="primary" type="submit" [disabled]="!valid()">{{ i18n.t('ed.run.saveAndRun') }}</button>
      </div>
    </form>
  `,
})
export class RuntimeAddressComponent {
  readonly chosen = output<void>();
  readonly cancelled = output<void>();
  protected readonly i18n = inject(I18n);
  private readonly run = inject(RunProject);
  protected readonly origin = location.origin;
  protected readonly address = signal(this.run.address());
  private readonly addressInput = viewChild.required<ElementRef<HTMLInputElement>>('addressInput');

  constructor() {
    afterNextRender(() => this.addressInput().nativeElement.select());
  }

  protected valid(): boolean {
    return runtimeUrl(this.address(), this.origin) !== null;
  }

  protected confirm(): void {
    if (this.run.setAddress(this.address())) this.chosen.emit();
  }
}
