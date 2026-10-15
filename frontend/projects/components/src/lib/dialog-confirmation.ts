import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, Injectable, inject } from '@angular/core';
import { Confirmation, I18n } from 'core';
import { NZ_MODAL_DATA, NzModalService } from 'ng-zorro-antd/modal';

/** Content of the window: the message is always text (nzContent as a string would be interpreted as HTML). */
@Component({
  selector: 'lc-confirm-message',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `:host { overflow-wrap: anywhere; white-space: pre-line; }`,
  template: `{{ data.message }}`,
})
export class ConfirmMessageComponent {
  protected readonly data = inject<{ message: string }>(NZ_MODAL_DATA);
}

/**
 * Confirmation with an NG-ZORRO modal window over the page. The focus starts on "Cancel" (a careless Enter does not confirm),
 * Esc and a click on the backdrop cancel. One window at a time: a second request is refused.
 */
@Injectable({ providedIn: 'root' })
export class DialogConfirmation extends Confirmation {
  private readonly modal = inject(NzModalService);
  private readonly doc = inject(DOCUMENT);
  private readonly i18n = inject(I18n);
  private open = false;

  confirm(message: string): Promise<boolean> {
    if (this.open) return Promise.resolve(false);
    this.open = true;
    return new Promise<boolean>((resolve) => {
      const previous = this.doc.activeElement as HTMLElement | null;
      let settled = false;
      const finish = (result: boolean): void => {
        if (settled) return;
        settled = true;
        this.open = false;
        previous?.focus?.();
        resolve(result);
      };
      const ref = this.modal.confirm({
        nzContent: ConfirmMessageComponent,
        nzData: { message },
        nzOkText: this.i18n.t('lc.confirm'),
        nzCancelText: this.i18n.t('lc.cancel'),
        nzAutofocus: 'cancel',
        nzKeyboard: true,
        nzMaskClosable: true,
        nzClosable: false,
        nzCentered: true,
        nzOnOk: () => finish(true),
        nzOnCancel: () => finish(false),
      });
      // Closed in another way (for example with Esc or a click on the backdrop): it is a cancellation.
      ref.afterClose.subscribe(() => finish(false));
    });
  }
}
