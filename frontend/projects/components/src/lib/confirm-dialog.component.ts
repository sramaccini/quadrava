import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, HostListener, inject, input, output } from '@angular/core';
import { CONTROL_STYLES, nextId } from './shared';

/** Finestra modale di conferma. Il focus parte su "Annulla": un Invio distratto non conferma. */
@Component({
  selector: 'lc-confirm-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    CONTROL_STYLES,
    `
      .backdrop {
        position: fixed; inset: 0; z-index: 1000; display: grid; place-items: center; padding: var(--lc-gap, 12px);
        background: color-mix(in srgb, var(--lc-color-on-surface, #1b2430) 45%, transparent);
      }
      .panel {
        width: min(440px, 100%); padding: calc(var(--lc-gap, 12px) * 1.5); border-radius: var(--lc-radius, 6px);
        background: var(--lc-color-surface, #fff); color: var(--lc-color-on-surface, #1b2430);
        border: 1px solid var(--lc-color-border, #d5dbe3); font-family: var(--lc-font-family, inherit); font-size: var(--lc-font-size, 14px);
      }
      p { margin: 0 0 calc(var(--lc-gap, 12px) * 1.5); overflow-wrap: anywhere; }
      .actions { display: flex; justify-content: flex-end; gap: var(--lc-gap, 12px); }
    `,
  ],
  template: `
    <div class="backdrop" (click)="decided.emit(false)">
      <div class="panel" role="dialog" aria-modal="true" [attr.aria-labelledby]="id" (click)="$event.stopPropagation()">
        <p [id]="id">{{ message() }}</p>
        <div class="actions">
          <button type="button" class="lc-btn secondary" data-action="cancel" (click)="decided.emit(false)">Annulla</button>
          <button type="button" class="lc-btn" data-action="confirm" (click)="decided.emit(true)">Conferma</button>
        </div>
      </div>
    </div>
  `,
})
export class ConfirmDialogComponent implements AfterViewInit {
  readonly message = input.required<string>();
  readonly decided = output<boolean>();
  protected readonly id = nextId('lc-confirm');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  ngAfterViewInit(): void {
    this.host.nativeElement.querySelector<HTMLElement>('[data-action=cancel]')?.focus();
  }

  @HostListener('document:keydown', ['$event'])
  protected onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.decided.emit(false);
    } else if (event.key === 'Tab') {
      // Il focus resta dentro la finestra: Tab passa tra i due pulsanti.
      const buttons = [...this.host.nativeElement.querySelectorAll<HTMLElement>('button')];
      const index = buttons.indexOf(document.activeElement as HTMLElement);
      const next = event.shiftKey ? (index <= 0 ? buttons.length - 1 : index - 1) : index === buttons.length - 1 ? 0 : index + 1;
      event.preventDefault();
      buttons[next]?.focus();
    }
  }
}
