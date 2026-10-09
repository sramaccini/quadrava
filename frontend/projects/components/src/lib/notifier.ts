import { Injectable, inject } from '@angular/core';
import { Notifier } from 'core';
import { NzMessageService } from 'ng-zorro-antd/message';

/** I messaggi di NG-ZORRO interpretano le stringhe come HTML: il testo (che può contenere valori dei dati) va reso innocuo. */
function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** Messaggi all'utente con i messaggi di NG-ZORRO (compaiono in alto e spariscono da soli). Il testo viene sempre mostrato com'è, mai interpretato come HTML. */
@Injectable({ providedIn: 'root' })
export class NzNotifier extends Notifier {
  private readonly messages = inject(NzMessageService);

  toast(message: string, kind: 'info' | 'error' = 'info'): void {
    if (kind === 'error') this.messages.error(escapeHtml(message));
    else this.messages.info(escapeHtml(message));
  }
}
