import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, inject } from '@angular/core';

/** A menu of NG-ZORRO (nz-dropdown), drawn in the overlay container, outside the page; it disappears when an item is chosen. */
const MENU = '.ant-dropdown';
/** The element that opens a menu of NG-ZORRO. */
const MENU_TRIGGER = '.ant-dropdown-trigger';
/** A dialog of NG-ZORRO. */
const DIALOG = '.ant-modal-wrap';
/** How long a disabled opener is waited for (its action is still running), in milliseconds. */
const ENABLE_WAIT = 10_000;

/**
 * Gives the focus back to `target` when a dialog closes. A button disabled while its action runs takes it as soon as it is
 * enabled again (for at most a few seconds); if in the meantime the focus went somewhere else, it is left there.
 */
export function returnFocus(target: HTMLElement | null): void {
  if (!target?.isConnected) return;
  const doc = target.ownerDocument;
  const view = doc.defaultView;
  const enabled = (): boolean => !(target as HTMLButtonElement).disabled;
  // Still on the body, or in the dialog that is closing (it stays in the page until its animation ends).
  const lost = (): boolean => {
    const active = doc.activeElement;
    return !active || active === doc.body || !active.isConnected || !!active.closest(DIALOG);
  };
  if (enabled()) {
    target.focus();
    return;
  }
  if (!view?.MutationObserver) return;
  const observer = new view.MutationObserver(() => {
    if (!target.isConnected) stop();
    else if (enabled()) {
      stop();
      if (lost()) target.focus();
    }
  });
  const timer = view.setTimeout(() => stop(), ENABLE_WAIT);
  function stop(): void {
    observer.disconnect();
    view?.clearTimeout(timer);
  }
  observer.observe(target, { attributes: true, attributeFilter: ['disabled'] });
}

/**
 * The control that opened a dialog, where the focus goes back when it closes. When the dialog opens the focus is not always
 * on it any more: the button is disabled while its action runs, and an item of a «⋯» menu disappears with the menu. So the
 * last control clicked (or activated from the keyboard) is remembered too, and for an item of a menu its trigger.
 */
@Injectable({ providedIn: 'root' })
export class DialogOpener {
  private readonly doc = inject(DOCUMENT);
  private last: HTMLElement | null = null;
  private menuTrigger: HTMLElement | null = null;

  constructor() {
    const remember = (event: Event): void => {
      const target = event.target instanceof Element ? event.target : null;
      const control = target?.closest<HTMLElement>('button, a[href], [role="menuitem"], li.ant-dropdown-menu-item, [tabindex]');
      if (!control) return;
      if (control.closest(MENU)) {
        // An item of a menu: the focus goes back to the button that opened the menu.
        this.last = this.menuTrigger;
        return;
      }
      if (control.matches(MENU_TRIGGER)) this.menuTrigger = control;
      this.last = control;
    };
    this.doc.addEventListener('click', remember, true);
    inject(DestroyRef).onDestroy(() => this.doc.removeEventListener('click', remember, true));
  }

  /** The opener of a dialog that is opening now: the element with the focus, or else the last control used. */
  current(): HTMLElement | null {
    const active = this.doc.activeElement as HTMLElement | null;
    if (active && active !== this.doc.body && !active.closest(MENU)) return active;
    return this.last?.isConnected ? this.last : null;
  }
}
