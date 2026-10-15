import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, signal, untracked } from '@angular/core';
import { I18n } from 'core';
import { NzSpinModule } from 'ng-zorro-antd/spin';

/** Before showing the indicator: quick responses do not make it flash. */
export const BUSY_DELAY_MS = 300;
/** Once shown, the indicator stays at least this long (no flicker). */
export const BUSY_MIN_VISIBLE_MS = 400;
/** Beyond this wait the text becomes «Taking longer than usual…». */
export const BUSY_SLOW_MS = 8000;

/**
 * Indicator of work in progress, shared by all the components that read a data source: it wraps the content and,
 * if the wait lasts more than {@link BUSY_DELAY_MS}, shows a spinner over it. On the first load (`empty`)
 * it reserves a minimum height, so the page jumps little when the data arrives; on reloads the old content stays
 * visible, dimmed, and usable (for example the filters of a table). For screen readers the content has
 * `aria-busy` and a `status` region announces the wait. Colours and dimming from the theme (`--lc-busy-*`).
 */
@Component({
  selector: 'lc-busy',
  imports: [NzSpinModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: block; position: relative; }
    .content { transition: opacity 0.15s; }
    .on .content { opacity: var(--lc-busy-dim, 0.45); }
    .reserve .content { min-height: var(--lc-busy-min-height, 160px); }
    /* Over the content but without catching clicks: filters and scrolling stay usable. */
    .overlay { position: absolute; inset: 0; pointer-events: none; z-index: 2; }
    /* The spinner stays in view even while scrolling a long table: in the middle of the visible part, at most half a screen. */
    .spot {
      position: sticky; top: var(--lc-header-height, 0px); height: min(100%, 50vh);
      display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;
    }
    .label {
      font-size: 13px; color: var(--lc-color-on-surface);
      background: var(--lc-color-surface); padding: 2px 10px; border-radius: 999px;
      box-shadow: 0 1px 4px color-mix(in srgb, var(--lc-color-on-surface) 18%, transparent);
    }
    .sr { position: absolute; width: 1px; height: 1px; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
    @media (prefers-reduced-motion: reduce) {
      .content { transition: none; }
      .spot ::ng-deep .ant-spin-dot { animation: none; }
      .spot ::ng-deep .ant-spin-dot-item { animation: none; opacity: 1; }
    }
  `,
  template: `
    <div class="busy" [class.on]="visible()" [class.reserve]="busy() && empty()">
      <div class="content" [attr.aria-busy]="busy()"><ng-content /></div>
      @if (visible()) {
        <div class="overlay" aria-hidden="true">
          <div class="spot">
            <nz-spin nzSimple />
            <span class="label">{{ slow() ? i18n.t('lc.loadingSlow') : i18n.t('lc.loading') }}</span>
          </div>
        </div>
      }
      <!-- Always present (a live region inserted on the spot is not always read): only the text changes. -->
      <span class="sr" role="status">{{ visible() ? (slow() ? i18n.t('lc.loadingSlow') : i18n.t('lc.loading')) : '' }}</span>
    </div>
  `,
})
export class BusyComponent {
  /** There is work in progress. */
  readonly busy = input(false);
  /** There is no data to show yet (first load): a minimum height is reserved. */
  readonly empty = input(false);
  /** Shows the spinner right away, without the delay: for a wait requested by the user (for example «Refresh»). */
  readonly immediate = input(false);

  protected readonly i18n = inject(I18n);
  protected readonly visible = signal(false);
  protected readonly slow = signal(false);
  private timers: ReturnType<typeof setTimeout>[] = [];
  private shownAt = 0;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.clear());
    effect(() => {
      const busy = this.busy();
      untracked(() => (busy ? this.start() : this.stop()));
    });
    // A wait requested by the user is shown right away.
    effect(() => {
      if (this.immediate() && this.busy()) untracked(() => this.show());
    });
  }

  private start(): void {
    this.clear();
    if (this.visible()) {
      this.timers.push(setTimeout(() => this.slow.set(true), BUSY_SLOW_MS));
      return;
    }
    this.timers.push(
      setTimeout(() => this.show(), untracked(() => this.immediate()) ? 0 : BUSY_DELAY_MS),
      setTimeout(() => this.slow.set(true), BUSY_SLOW_MS),
    );
  }

  private show(): void {
    if (this.visible()) return;
    this.visible.set(true);
    this.shownAt = Date.now();
  }

  private stop(): void {
    this.clear();
    if (!this.visible()) {
      this.slow.set(false);
      return;
    }
    const hide = () => {
      this.visible.set(false);
      this.slow.set(false);
    };
    const remaining = BUSY_MIN_VISIBLE_MS - (Date.now() - this.shownAt);
    if (remaining > 0) this.timers.push(setTimeout(hide, remaining));
    else hide();
  }

  private clear(): void {
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }
}
