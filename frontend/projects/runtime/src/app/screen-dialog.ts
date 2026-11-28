import { ChangeDetectionStrategy, Component, Injectable, inject } from '@angular/core';
import { ScreenDialog, ScreenDialogHost, type ScreenDialogRequest } from 'core';
import { VIEW_WIDTHS } from 'components';
import { NZ_MODAL_DATA, NzModalRef, NzModalService } from 'ng-zorro-antd/modal';
import { ScreenView } from './pages/screen-view.component';

interface ScreenDialogData {
  request: ScreenDialogRequest;
  done: () => void;
}

/** The screens inside the window close it, as done, with the `close` step. */
class WindowHost extends ScreenDialogHost {
  constructor(private readonly data: ScreenDialogData) {
    super();
  }

  override close(): void {
    this.data.done();
  }
}

/** Content of the window: the screen, loaded and checked as by the router, with its title as the title of the window. */
@Component({
  selector: 'app-screen-dialog',
  imports: [ScreenView],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: ScreenDialogHost, useFactory: () => new WindowHost(inject<ScreenDialogData>(NZ_MODAL_DATA)) }],
  styles: `:host { display: block; margin: -24px; --lc-content-padding: 20px; }`,
  template: `<lc-screen-view [name]="data.request.screen" [params]="data.request.params" />`,
})
export class ScreenDialogComponent {
  protected readonly data = inject<ScreenDialogData>(NZ_MODAL_DATA);
}

/**
 * The `openScreen` step in an NG-ZORRO window: true when a `close` step of the screen closes it, false when the user
 * does (the cross, Esc, a click outside). The focus goes back where it was.
 */
@Injectable({ providedIn: 'root' })
export class DialogScreen extends ScreenDialog {
  private readonly modal = inject(NzModalService);

  override open(request: ScreenDialogRequest): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      let settled = false;
      let ref: NzModalRef | null = null;
      const finish = (done: boolean): void => {
        if (settled) return;
        settled = true;
        ref?.close();
        if (previous?.isConnected) previous.focus();
        resolve(done);
      };
      ref = this.modal.create({
        nzContent: ScreenDialogComponent,
        nzData: { request, done: () => finish(true) } satisfies ScreenDialogData,
        nzFooter: null,
        nzTitle: undefined,
        nzClosable: true,
        nzKeyboard: true,
        nzMaskClosable: false,
        nzCentered: true,
        nzWidth: VIEW_WIDTHS[request.size],
        nzWrapClassName: 'app-screen-dialog',
      });
      ref.afterClose.subscribe(() => finish(false));
    });
  }
}
