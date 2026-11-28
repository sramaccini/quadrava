import { ChangeDetectionStrategy, Component, ElementRef, Injectable, afterNextRender, inject } from '@angular/core';
import { I18n, ShortcutHelp, type ShortcutHelpItem } from 'core';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NZ_MODAL_DATA, NzModalRef, NzModalService } from 'ng-zorro-antd/modal';
import { DialogOpener, returnFocus } from './dialog-focus';
import { nextId } from './shared';

interface HelpData {
  shortcuts: readonly ShortcutHelpItem[];
  titleId: string;
  close: () => void;
}

/** The modifiers by their name in the language of the user; a key is shown in capitals. */
const MODIFIER_KEYS: Readonly<Record<string, string>> = { ctrl: 'lc.key.ctrl', alt: 'lc.key.alt', shift: 'lc.key.shift', meta: 'lc.key.meta' };

/** Content of the window: one row per shortcut, its keys and what it does; the last row is `?` itself. */
@Component({
  selector: 'lc-shortcut-help',
  imports: [NzButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .title { margin: 0 0 16px; font-size: 16px; font-weight: 600; }
    dl { display: grid; grid-template-columns: max-content 1fr; gap: 8px 24px; margin: 0; align-items: baseline; }
    dt { white-space: nowrap; }
    dd { margin: 0; overflow-wrap: anywhere; }
    kbd {
      display: inline-block; min-width: 22px; padding: 1px 6px; text-align: center; font: inherit; font-size: 12px; line-height: 18px;
      border: 1px solid var(--lc-color-border, #d0d7de); border-bottom-width: 2px; border-radius: 4px; background: var(--lc-color-surface, #fafafa);
    }
    .plus { margin: 0 4px; color: var(--lc-color-muted, #5d6b7a); }
    .none { margin: 0 0 12px; color: var(--lc-color-muted, #5d6b7a); }
    .footer { display: flex; justify-content: flex-end; margin-top: 20px; }
  `,
  template: `
    <h2 class="title" [id]="data.titleId">{{ i18n.t('lc.shortcuts.title') }}</h2>
    @if (!data.shortcuts.length) {
      <p class="none">{{ i18n.t('lc.shortcuts.none') }}</p>
    }
    <dl>
      @for (shortcut of rows; track $index) {
        <dt>
          @for (part of shortcut.keys; track $index; let last = $last) {
            <kbd>{{ keyName(part) }}</kbd>
            @if (!last) {
              <span class="plus" aria-hidden="true">+</span>
            }
          }
        </dt>
        <dd>{{ shortcut.label }}</dd>
      }
    </dl>
    <div class="footer">
      <button nz-button type="button" (click)="data.close()">{{ i18n.t('lc.close') }}</button>
    </div>
  `,
})
export class ShortcutHelpComponent {
  protected readonly data = inject<HelpData>(NZ_MODAL_DATA);
  protected readonly i18n = inject(I18n);
  protected readonly rows: readonly ShortcutHelpItem[] = [...this.data.shortcuts, { keys: ['?'], label: this.i18n.t('lc.shortcuts.help') }];

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    afterNextRender(() => host.closest('[role="dialog"]')?.setAttribute('aria-labelledby', this.data.titleId));
  }

  protected keyName(part: string): string {
    const modifier = MODIFIER_KEYS[part];
    return modifier ? this.i18n.t(modifier) : part.toUpperCase();
  }
}

/** The list of shortcuts in an NG-ZORRO window: it closes with its button, Esc or the cross, and the focus goes back. */
@Injectable({ providedIn: 'root' })
export class DialogShortcutHelp extends ShortcutHelp {
  private readonly modal = inject(NzModalService);
  private readonly opener = inject(DialogOpener);

  override open(shortcuts: readonly ShortcutHelpItem[]): Promise<void> {
    return new Promise<void>((resolve) => {
      const previous = this.opener.current() ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
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
        nzContent: ShortcutHelpComponent,
        nzData: { shortcuts, titleId: nextId('lc-shortcuts-title'), close } satisfies HelpData,
        nzFooter: null,
        nzTitle: undefined,
        nzClosable: true,
        nzKeyboard: true,
        nzMaskClosable: true,
        nzCentered: true,
        nzWidth: '480px',
        nzWrapClassName: 'lc-shortcut-help',
      });
      ref.afterClose.subscribe(() => close());
    });
  }
}
