import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injectable, afterNextRender, computed, effect, inject, signal, viewChild } from '@angular/core';
import { DataClient, I18n, FilePreview, isDownloadedFile, type PreviewFile } from 'core';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NZ_MODAL_DATA, NzModalRef, NzModalService } from 'ng-zorro-antd/modal';
import { BusyComponent } from './busy.component';
import { DialogOpener, returnFocus } from './dialog-focus';
import { IconComponent } from './icon.component';
import { nextId } from './shared';

interface PreviewData {
  files: readonly PreviewFile[];
  start: number;
  titleId: string;
  close: () => void;
}

/**
 * Content of the window: the name of the file, its position in the list, previous and next (also with the arrow keys),
 * download, and the file. An image is drawn from its address. A PDF is read through the `DataClient` (the session of the
 * user, the same checks as every call) and shown from a copy in memory whose type is forced to PDF: whatever the
 * service sent, the frame can only open it as a PDF, never as a page of the application.
 */
@Component({
  selector: 'lc-file-preview',
  imports: [BusyComponent, IconComponent, NzButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(keydown)': 'key($event)' },
  styles: `
    :host { display: flex; flex-direction: column; gap: 12px; height: calc(100vh - 96px); }
    .bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .title { flex: 1 1 auto; min-width: 0; margin: 0; font-size: 16px; font-weight: 600; overflow-wrap: anywhere; }
    .position { color: var(--lc-color-muted, #5d6b7a); white-space: nowrap; }
    .stage { flex: 1 1 auto; min-height: 0; display: flex; align-items: center; justify-content: center; }
    .stage lc-busy { width: 100%; height: 100%; }
    img { max-width: 100%; max-height: 100%; object-fit: contain; }
    /* The height of the page less the bar: the box of lc-busy around it does not stretch. */
    iframe { display: block; width: 100%; height: calc(100vh - 160px); border: 1px solid var(--lc-color-border, #d0d7de); border-radius: var(--lc-radius, 6px); }
    .error { color: var(--lc-text-error, #c62828); }
    a[nz-button] lc-icon, button lc-icon { margin: 0; }
  `,
  template: `
    <div class="bar">
      <h2 class="title" [id]="data.titleId">{{ file().name }}</h2>
      @if (data.files.length > 1) {
        <span class="position">{{ i18n.t('lc.preview.position', { n: index() + 1, total: data.files.length }) }}</span>
        <button nz-button type="button" [attr.aria-label]="i18n.t('lc.preview.previous')" [title]="i18n.t('lc.preview.previous')" (click)="move(-1)"><lc-icon name="left" /></button>
        <button nz-button type="button" [attr.aria-label]="i18n.t('lc.preview.next')" [title]="i18n.t('lc.preview.next')" (click)="move(1)"><lc-icon name="right" /></button>
      }
      <a nz-button [href]="file().url" [attr.download]="file().name" [attr.aria-label]="i18n.t('lc.preview.download', { name: file().name })" [title]="i18n.t('lc.preview.download', { name: file().name })"><lc-icon name="download" /></a>
      <button nz-button type="button" (click)="data.close()">{{ i18n.t('lc.close') }}</button>
    </div>
    <div class="stage">
      @if (file().kind === 'image') {
        <img [src]="file().url" [alt]="file().name" />
      } @else if (failed()) {
        <p class="error" role="alert">{{ i18n.t('lc.preview.failed') }}</p>
      } @else {
        <lc-busy [busy]="!pdf()">
          <iframe #frame [title]="file().name"></iframe>
        </lc-busy>
      }
    </div>
  `,
})
export class FilePreviewComponent {
  protected readonly data = inject<PreviewData>(NZ_MODAL_DATA);
  protected readonly i18n = inject(I18n);
  private readonly client = inject(DataClient);
  protected readonly index = signal(this.data.start);
  protected readonly file = computed(() => this.data.files[this.index()]);
  /** Address in memory of the PDF shown, and whether reading it failed. */
  protected readonly pdf = signal<string | null>(null);
  protected readonly failed = signal(false);
  private readonly frame = viewChild<ElementRef<HTMLIFrameElement>>('frame');

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    afterNextRender(() => host.closest('[role="dialog"]')?.setAttribute('aria-labelledby', this.data.titleId));
    // A PDF is read again at every change of file; the copy of the previous one is released.
    effect((onCleanup) => {
      const file = this.file();
      this.pdf.set(null);
      this.failed.set(false);
      if (file.kind !== 'pdf') return;
      const controller = new AbortController();
      let address: string | null = null;
      onCleanup(() => {
        controller.abort();
        if (address) URL.revokeObjectURL(address);
      });
      this.client
        .request({ method: 'GET', url: file.url }, { download: true, signal: controller.signal })
        .then((answer) => {
          if (controller.signal.aborted) return;
          if (!isDownloadedFile(answer)) throw new Error('not a file');
          address = URL.createObjectURL(new Blob([answer.blob], { type: 'application/pdf' }));
          this.pdf.set(address);
        })
        .catch(() => {
          if (!controller.signal.aborted) this.failed.set(true);
        });
    });
    // The frame takes the address in memory as its source (an address the page made itself, of type PDF).
    effect(() => {
      const frame = this.frame()?.nativeElement;
      const address = this.pdf();
      if (frame && address && frame.src !== address) frame.src = address;
    });
    inject(DestroyRef).onDestroy(() => {
      const address = this.pdf();
      if (address) URL.revokeObjectURL(address);
    });
  }

  /** The previous or next file, going round at the ends. */
  protected move(step: number): void {
    const total = this.data.files.length;
    this.index.update((i) => (i + step + total) % total);
  }

  protected key(event: KeyboardEvent): void {
    if (this.data.files.length < 2 || event.target instanceof HTMLInputElement) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      this.move(event.key === 'ArrowLeft' ? -1 : 1);
    }
  }
}

/** The files in an NG-ZORRO window as large as the page: it closes with its button, Esc or the cross. */
@Injectable({ providedIn: 'root' })
export class DialogFilePreview extends FilePreview {
  private readonly modal = inject(NzModalService);
  private readonly opener = inject(DialogOpener);

  override open(files: readonly PreviewFile[], start: number): Promise<void> {
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
        nzContent: FilePreviewComponent,
        nzData: { files, start, titleId: nextId('lc-preview-title'), close } satisfies PreviewData,
        nzFooter: null,
        nzTitle: undefined,
        nzClosable: false,
        nzKeyboard: true,
        nzMaskClosable: true,
        nzCentered: true,
        nzWidth: 'calc(100vw - 32px)',
        nzWrapClassName: 'lc-file-preview',
      });
      ref.afterClose.subscribe(() => close());
    });
  }
}
