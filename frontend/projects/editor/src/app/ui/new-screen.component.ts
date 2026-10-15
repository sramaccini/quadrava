import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, inject, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { I18n } from 'core';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzInputModule } from 'ng-zorro-antd/input';
import { SCREEN_ID, screenIdFrom } from '../model/templates';

export interface NewScreen {
  title: string;
  screen: string;
}

/**
 * Content of the «New screen» dialog: title and identifier. The identifier follows the title until it
 * is changed by hand; emptied, it follows it again. «Create» stays off while the title is missing or the identifier is not
 * in kebab-case.
 */
@Component({
  selector: 'ed-new-screen',
  imports: [FormsModule, NzButtonModule, NzInputModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .replace { margin: 0 0 16px; color: var(--lc-color-muted); }
    .field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; }
    .hint { font-size: 12px; color: var(--lc-color-muted); }
    .error { font-size: 12px; color: var(--lc-color-danger); }
    .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
  `,
  template: `
    <form ngNoForm (submit)="$event.preventDefault(); submit()">
      <p class="replace">{{ i18n.t('ed.newScreen.replace') }}</p>
      <div class="field">
        <label for="new-screen-title">{{ i18n.t('ed.newScreen.name') }}</label>
        <input #titleInput nz-input id="new-screen-title" maxlength="200" [ngModel]="title()" (ngModelChange)="title.set($event)" />
      </div>
      <div class="field">
        <label for="new-screen-id">{{ i18n.t('ed.newScreen.id') }}</label>
        <input
          nz-input
          id="new-screen-id"
          maxlength="60"
          spellcheck="false"
          [ngModel]="screenId()"
          (ngModelChange)="typedId.set($event.trim() || null)"
          [attr.aria-invalid]="!idValid()"
          aria-describedby="new-screen-id-hint"
        />
        @if (screenId() && !idValid()) {
          <span class="error" id="new-screen-id-hint">{{ i18n.t('ed.newScreen.idInvalid') }}</span>
        } @else {
          <span class="hint" id="new-screen-id-hint">{{ i18n.t('ed.newScreen.idHint') }}</span>
        }
      </div>
      <div class="actions">
        <button nz-button type="button" (click)="cancelled.emit()">{{ i18n.t('ed.cancel') }}</button>
        <button nz-button nzType="primary" type="submit" [disabled]="!canCreate()">{{ i18n.t('ed.newScreen.create') }}</button>
      </div>
    </form>
  `,
})
export class NewScreenComponent {
  readonly created = output<NewScreen>();
  readonly cancelled = output<void>();
  protected readonly i18n = inject(I18n);
  protected readonly title = signal('');
  protected readonly typedId = signal<string | null>(null);
  protected readonly screenId = computed(() => this.typedId() ?? screenIdFrom(this.title()));
  protected readonly idValid = computed(() => SCREEN_ID.test(this.screenId()));
  protected readonly canCreate = computed(() => this.title().trim() !== '' && this.idValid());
  private readonly titleInput = viewChild.required<ElementRef<HTMLInputElement>>('titleInput');

  constructor() {
    afterNextRender(() => this.titleInput().nativeElement.focus());
  }

  protected submit(): void {
    if (this.canCreate()) this.created.emit({ title: this.title().trim(), screen: this.screenId() });
  }
}
