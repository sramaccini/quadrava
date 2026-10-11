import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, Injectable, afterNextRender, inject } from '@angular/core';
import { FormDialog, I18n, type FormDialogRequest } from 'core';
import { NZ_MODAL_DATA, NzModalRef, NzModalService } from 'ng-zorro-antd/modal';
import { FormComponent } from './form.component';
import { nextId } from './shared';

interface DialogData {
  request: FormDialogRequest;
  titleId: string;
  finish: (result: boolean) => void;
}

/** Contenuto della finestra: titolo come testo (un titolo stringa del modal sarebbe interpretato come HTML) e il form. */
@Component({
  selector: 'lc-dialog-form',
  imports: [FormComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .title { margin: 0 0 16px; font-size: 16px; font-weight: 600; overflow-wrap: anywhere; }
    lc-form ::ng-deep form { max-width: none; }
  `,
  template: `
    <h2 class="title" [id]="data.titleId">{{ data.request.title }}</h2>
    <lc-form
      [node]="data.request.form"
      [runtime]="data.request.runtime"
      [scope]="data.request.scope"
      [cancelLabel]="i18n.t('lc.cancel')"
      (completed)="$event && data.finish(true)"
      (cancelled)="data.finish(false)"
    />
  `,
})
export class DialogFormComponent {
  protected readonly data = inject<DialogData>(NZ_MODAL_DATA);
  protected readonly i18n = inject(I18n);

  constructor() {
    // La finestra prende il nome dal titolo (per gli screen reader).
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    afterNextRender(() => host.closest('[role="dialog"]')?.setAttribute('aria-labelledby', this.data.titleId));
  }
}

/**
 * Finestre con form sul modal di NG-ZORRO. La finestra si chiude quando i passi di invio riescono (risultato true)
 * o quando l'utente annulla (pulsante, Esc, croce: risultato false); se i passi falliscono resta aperta, con i dati
 * inseriti. Una sola finestra alla volta; alla chiusura il focus torna dove era.
 */
@Injectable({ providedIn: 'root' })
export class DialogForm extends FormDialog {
  private readonly modal = inject(NzModalService);
  private readonly doc = inject(DOCUMENT);
  private showing = false;

  override open(request: FormDialogRequest): Promise<boolean> {
    if (this.showing) return Promise.resolve(false);
    this.showing = true;
    return new Promise<boolean>((resolve) => {
      const previous = this.doc.activeElement as HTMLElement | null;
      let settled = false;
      let ref: NzModalRef | null = null;
      const finish = (result: boolean): void => {
        if (settled) return;
        settled = true;
        this.showing = false;
        ref?.close();
        previous?.focus?.();
        resolve(result);
      };
      const titleId = nextId('lc-dialog-title');
      ref = this.modal.create({
        nzContent: DialogFormComponent,
        nzData: { request, titleId, finish } satisfies DialogData,
        nzFooter: null,
        nzTitle: undefined,
        nzClosable: true,
        nzKeyboard: true,
        nzMaskClosable: false,
        nzCentered: true,
        nzWidth: request.form.columns && request.form.columns > 1 ? 720 : 520,
        nzWrapClassName: 'lc-dialog-form',
      });
      ref.afterClose.subscribe(() => finish(false));
    });
  }
}
