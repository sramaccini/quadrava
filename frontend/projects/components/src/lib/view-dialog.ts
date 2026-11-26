import { ChangeDetectionStrategy, Component, ElementRef, Injectable, afterNextRender, inject } from '@angular/core';
import { NodeHostComponent, ViewDialog, type ViewDialogRequest } from 'core';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NZ_MODAL_DATA, NzModalRef, NzModalService } from 'ng-zorro-antd/modal';
import { DialogOpener, returnFocus } from './dialog-focus';
import { nextId } from './shared';

interface ViewData {
  request: ViewDialogRequest;
  titleId: string;
  close: () => void;
}

/** Width of the window for each size. */
export const VIEW_WIDTHS: Record<ViewDialogRequest['size'], string> = {
  small: '520px',
  medium: '720px',
  large: '960px',
  full: 'calc(100vw - 48px)',
};

/** Content of the window: title as text (a string title of the modal would be interpreted as HTML), the nodes, Close. */
@Component({
  selector: 'lc-view-dialog',
  imports: [NodeHostComponent, NzButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .title { margin: 0 0 16px; font-size: 16px; font-weight: 600; overflow-wrap: anywhere; }
    .body { display: flex; flex-direction: column; gap: 16px; }
    .footer { display: flex; justify-content: flex-end; margin-top: 16px; }
  `,
  template: `
    <h2 class="title" [id]="data.titleId">{{ data.request.title }}</h2>
    <div class="body">
      @for (child of data.request.components; track $index) {
        <lc-node [node]="child" [runtime]="data.request.runtime" [scope]="data.request.scope" />
      }
    </div>
    <div class="footer">
      <button nz-button type="button" (click)="data.close()">{{ data.request.closeLabel }}</button>
    </div>
  `,
})
export class ViewDialogComponent {
  protected readonly data = inject<ViewData>(NZ_MODAL_DATA);

  constructor() {
    // The window takes its name from the title (for screen readers).
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    afterNextRender(() => host.closest('[role="dialog"]')?.setAttribute('aria-labelledby', this.data.titleId));
  }
}

/**
 * Windows with components on the NG-ZORRO modal. The window closes with its button, Esc or the cross; then the
 * sequence goes on and the focus goes back where it was. The nodes inside can open form windows of their own.
 */
@Injectable({ providedIn: 'root' })
export class DialogView extends ViewDialog {
  private readonly modal = inject(NzModalService);
  private readonly opener = inject(DialogOpener);

  override open(request: ViewDialogRequest): Promise<void> {
    return new Promise<void>((resolve) => {
      const previous = this.opener.current();
      let settled = false;
      let ref: NzModalRef | null = null;
      const close = (): void => {
        if (settled) return;
        settled = true;
        ref?.close();
        returnFocus(previous);
        resolve();
      };
      ref = this.modal.create({
        nzContent: ViewDialogComponent,
        nzData: { request, titleId: nextId('lc-view-title'), close } satisfies ViewData,
        nzFooter: null,
        nzTitle: undefined,
        nzClosable: true,
        nzKeyboard: true,
        nzMaskClosable: true,
        nzCentered: true,
        nzWidth: VIEW_WIDTHS[request.size],
        nzWrapClassName: 'lc-view-dialog',
      });
      ref.afterClose.subscribe(() => close());
    });
  }
}
