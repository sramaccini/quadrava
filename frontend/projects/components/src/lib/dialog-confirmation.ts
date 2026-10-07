import { DOCUMENT } from '@angular/common';
import { ApplicationRef, EnvironmentInjector, Injectable, createComponent, inject } from '@angular/core';
import { Confirmation } from 'core';
import { ConfirmDialogComponent } from './confirm-dialog.component';

/** Conferma con una finestra modale sopra la pagina. Una sola finestra alla volta: una seconda richiesta viene rifiutata. */
@Injectable({ providedIn: 'root' })
export class DialogConfirmation extends Confirmation {
  private readonly appRef = inject(ApplicationRef);
  private readonly injector = inject(EnvironmentInjector);
  private readonly doc = inject(DOCUMENT);
  private open = false;

  confirm(message: string): Promise<boolean> {
    if (this.open) return Promise.resolve(false);
    this.open = true;
    return new Promise<boolean>((resolve) => {
      const host = this.doc.createElement('div');
      this.doc.body.appendChild(host);
      const previous = this.doc.activeElement as HTMLElement | null;
      const ref = createComponent(ConfirmDialogComponent, { environmentInjector: this.injector, hostElement: host });
      ref.setInput('message', message);
      const finish = (result: boolean): void => {
        if (!this.open) return;
        this.open = false;
        this.appRef.detachView(ref.hostView);
        ref.destroy();
        host.remove();
        previous?.focus?.();
        resolve(result);
      };
      ref.instance.decided.subscribe(finish);
      this.appRef.attachView(ref.hostView);
      ref.changeDetectorRef.detectChanges();
    });
  }
}
