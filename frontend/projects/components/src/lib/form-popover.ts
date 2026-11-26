import { FocusTrapFactory } from '@angular/cdk/a11y';
import { Overlay } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injectable, InjectionToken, Injector, afterNextRender, inject } from '@angular/core';
import { FormPopover, I18n, type PopoverRequest } from 'core';
import { NzButtonModule } from 'ng-zorro-antd/button';
import type { Tone } from 'schema';
import { DialogOpener, returnFocus } from './dialog-focus';
import { DialogForm } from './dialog-form';
import { FormComponent } from './form.component';
import { IconComponent } from './icon.component';
import { nextId } from './shared';

interface PopoverData {
  request: PopoverRequest;
  titleId: string;
  finish: (result: boolean) => void;
}

const POPOVER_DATA = new InjectionToken<PopoverData>('POPOVER_DATA');

/** Colour of the icon of the title: the text colours of the theme bridge, readable on the surfaces. */
const ICON_COLORS: Record<Tone, string> = {
  neutral: 'var(--lc-color-muted)',
  primary: 'var(--lc-text-primary, var(--lc-color-primary))',
  success: 'var(--lc-text-success, var(--lc-color-success))',
  danger: 'var(--lc-text-error, var(--lc-color-danger))',
};

/**
 * Content of the panel: icon and title as text, the form, the cross. The cross comes last in the page, so that the focus
 * starts on the first field and the cross is the last stop of the Tab key; it is drawn at the top right.
 */
@Component({
  selector: 'lc-form-popover',
  imports: [FormComponent, IconComponent, NzButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'dialog', 'aria-modal': 'true', '[attr.aria-labelledby]': 'data.titleId' },
  styles: `
    :host {
      position: relative; display: block; box-sizing: border-box; width: 360px; max-width: calc(100vw - 16px); padding: 16px;
      background: var(--lc-color-surface); color: var(--lc-color-on-surface); border: 1px solid var(--lc-color-border);
      border-radius: var(--lc-radius, 6px); box-shadow: 0 6px 16px color-mix(in srgb, var(--lc-color-on-surface) 18%, transparent);
    }
    .head { display: flex; align-items: center; gap: 8px; margin: 0 32px 12px 0; }
    .title { margin: 0; font-size: 15px; font-weight: 600; overflow-wrap: anywhere; }
    .close { position: absolute; top: 10px; inset-inline-end: 10px; }
    lc-form ::ng-deep form { max-width: none; }
  `,
  template: `
    <div class="head">
      @if (data.request.icon) {
        <lc-icon [name]="data.request.icon" [style.color]="iconColor" />
      }
      <h2 class="title" [id]="data.titleId">{{ data.request.title }}</h2>
    </div>
    <lc-form [node]="data.request.form" [runtime]="data.request.runtime" [scope]="data.request.scope" (completed)="$event && data.finish(true)" />
    <button nz-button nzType="text" class="close" type="button" [attr.aria-label]="i18n.t('lc.close')" (click)="data.finish(false)">
      <lc-icon name="close" />
    </button>
  `,
})
export class FormPopoverComponent {
  protected readonly data = inject(POPOVER_DATA);
  protected readonly i18n = inject(I18n);
  protected readonly iconColor = ICON_COLORS[this.data.request.tone];

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    // The focus stays in the panel while it is open (Tab and Shift+Tab cycle inside it).
    const trap = inject(FocusTrapFactory).create(host);
    inject(DestroyRef).onDestroy(() => trap.destroy());
    afterNextRender(() => {
      const field = host.querySelector<HTMLElement>('input:not([type="hidden"]), textarea, select, [contenteditable="true"]');
      (field ?? host.querySelector<HTMLElement>('button.close'))?.focus();
    });
  }
}

/**
 * Small panels with a form on the CDK overlay, under the control that ran the step (or the «…» button of a menu item), as
 * the «Flag added» of the issue trackers. The panel closes when the submit steps succeed (true) or with the cross, Esc or
 * a click outside (false); then the focus goes back to the control. Without a control to point at it opens as a form
 * window. One panel at a time.
 */
@Injectable({ providedIn: 'root' })
export class PopoverForm extends FormPopover {
  private readonly overlay = inject(Overlay);
  private readonly injector = inject(Injector);
  private readonly opener = inject(DialogOpener);
  private readonly dialog = inject(DialogForm);
  private showing = false;

  override open(request: PopoverRequest): Promise<boolean> {
    const anchor = this.opener.current();
    if (!anchor) return this.dialog.open({ title: request.title, form: request.form, runtime: request.runtime, scope: request.scope });
    if (this.showing) return Promise.resolve(false);
    this.showing = true;
    return new Promise<boolean>((resolve) => {
      const ref = this.overlay.create({
        hasBackdrop: true,
        backdropClass: 'cdk-overlay-transparent-backdrop',
        panelClass: 'lc-popover-panel',
        scrollStrategy: this.overlay.scrollStrategies.reposition(),
        positionStrategy: this.overlay
          .position()
          .flexibleConnectedTo(anchor)
          .withViewportMargin(8)
          .withPush(true)
          .withPositions([
            { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 8 },
            { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 8 },
            { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom', offsetY: -8 },
            { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -8 },
          ]),
      });
      let settled = false;
      const finish = (result: boolean): void => {
        if (settled) return;
        settled = true;
        this.showing = false;
        ref.dispose();
        returnFocus(anchor);
        resolve(result);
      };
      const data: PopoverData = { request, titleId: nextId('lc-popover-title'), finish };
      const injector = Injector.create({ providers: [{ provide: POPOVER_DATA, useValue: data }], parent: this.injector });
      ref.attach(new ComponentPortal(FormPopoverComponent, null, injector));
      ref.backdropClick().subscribe(() => finish(false));
      ref.keydownEvents().subscribe((event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          finish(false);
        }
      });
      ref.detachments().subscribe(() => finish(false));
    });
  }
}
