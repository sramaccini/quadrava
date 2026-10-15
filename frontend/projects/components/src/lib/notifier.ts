import { Injectable, inject } from '@angular/core';
import { Notifier } from 'core';
import { NzMessageService } from 'ng-zorro-antd/message';

/** NG-ZORRO messages interpret strings as HTML: the text (which can contain data values) must be made harmless. */
function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** Messages to the user with NG-ZORRO messages (they appear at the top and disappear by themselves). The text is always shown as it is, never interpreted as HTML. */
@Injectable({ providedIn: 'root' })
export class NzNotifier extends Notifier {
  private readonly messages = inject(NzMessageService);

  toast(message: string, kind: 'info' | 'error' = 'info'): void {
    if (kind === 'error') this.messages.error(escapeHtml(message));
    else this.messages.info(escapeHtml(message));
  }
}
