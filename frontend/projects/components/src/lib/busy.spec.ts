import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { BUSY_DELAY_MS, BUSY_MIN_VISIBLE_MS, BUSY_SLOW_MS, BusyComponent } from './busy.component';
import { provideLowcodeComponents } from './provide';
import { renderScreen } from './screen-testing';

@Component({
  imports: [BusyComponent],
  template: `<lc-busy [busy]="busy()" [empty]="empty()"><p class="data">rows</p></lc-busy>`,
})
class Host {
  readonly busy = signal(false);
  readonly empty = signal(false);
}

describe('Activity indicator (lc-busy)', () => {
  afterEach(() => vi.useRealTimers());

  async function mount() {
    vi.useFakeTimers();
    TestBed.configureTestingModule({ providers: [provideLowcodeComponents()] });
    const fixture = TestBed.createComponent(Host);
    const el = fixture.nativeElement as HTMLElement;
    const advance = async (ms: number) => {
      await vi.advanceTimersByTimeAsync(ms);
      fixture.detectChanges();
    };
    fixture.detectChanges();
    return { fixture, el, host: fixture.componentInstance, advance };
  }
  const overlay = (el: HTMLElement) => el.querySelector('lc-busy .overlay');
  const status = (el: HTMLElement) => el.querySelector('lc-busy [role="status"]')?.textContent?.trim();

  it('a fast response shows nothing; aria-busy follows the wait anyway', async () => {
    const { el, host, advance } = await mount();
    host.busy.set(true);
    await advance(BUSY_DELAY_MS - 50);
    expect(el.querySelector('.content')?.getAttribute('aria-busy')).toBe('true');
    expect(overlay(el)).toBeNull();
    host.busy.set(false);
    await advance(1000);
    expect(overlay(el)).toBeNull();
    expect(el.querySelector('.content')?.getAttribute('aria-busy')).toBe('false');
  });

  it('a real wait shows a spinner and an announcement, the content stays (dimmed); then it stays visible for the planned minimum', async () => {
    const { el, host, advance } = await mount();
    host.busy.set(true);
    await advance(BUSY_DELAY_MS);
    expect(overlay(el)?.querySelector('nz-spin')).not.toBeNull();
    expect(status(el)).toBe('Loading…');
    expect(el.querySelector('.busy')?.classList.contains('on')).toBe(true);
    expect(el.querySelector('.data')?.textContent).toBe('rows');
    host.busy.set(false);
    await advance(BUSY_MIN_VISIBLE_MS - 50);
    expect(overlay(el)).not.toBeNull();
    await advance(50);
    expect(overlay(el)).toBeNull();
    expect(status(el)).toBe('');
  });

  it('beyond the normal wait it says it is taking longer than usual', async () => {
    const { el, host, advance } = await mount();
    host.busy.set(true);
    await advance(BUSY_SLOW_MS);
    expect(status(el)).toBe('This is taking longer than usual…');
    expect(el.querySelector('.label')?.textContent?.trim()).toBe('This is taking longer than usual…');
  });

  it('on the first load it reserves the space, then releases it', async () => {
    const { el, host, advance } = await mount();
    host.empty.set(true);
    host.busy.set(true);
    await advance(0);
    expect(el.querySelector('.busy')?.classList.contains('reserve')).toBe(true);
    host.busy.set(false);
    host.empty.set(false);
    await advance(0);
    expect(el.querySelector('.busy')?.classList.contains('reserve')).toBe(false);
  });
});

describe('Activity indicator in components with a data source', () => {
  it('the datatable shows the spinner on the first load and keeps the rows while reloading', async () => {
    let release: (value: unknown) => void = () => undefined;
    const { el, settle, until, fixture } = await renderScreen({
      dataSources: { rows: { type: 'rest', method: 'GET', url: '/api/rows', params: { f: "{{ has(state.f) ? state.f : '' }}" } } },
      components: [{ type: 'dataTable', source: 'rows', columns: [{ field: 'name', label: 'Name' }] }],
      respond: () => new Promise((resolve) => (release = resolve)),
    });
    await until(() => !!el.querySelector('lc-data-table lc-busy .overlay'), 'spinner on the first load');
    expect(el.querySelector('lc-data-table lc-busy .busy')?.classList.contains('reserve')).toBe(true);
    // While loading, the table does not say «No results».
    expect(el.querySelector('lc-data-table .ant-table-placeholder')?.textContent?.trim() ?? '').toBe('');
    release([{ name: 'Anna' }]);
    await until(() => !el.querySelector('lc-data-table lc-busy .overlay'), 'spinner removed');
    expect(el.querySelector('lc-data-table tbody td')?.textContent?.trim()).toBe('Anna');

    // Reload: the rows stay, dimmed, with the spinner on top.
    fixture.componentInstance.runtime()!.state.update((s) => ({ ...s, f: 'x' }));
    await until(() => !!el.querySelector('lc-data-table lc-busy .busy.on'), 'reload');
    expect(el.querySelector('lc-data-table tbody td')?.textContent?.trim()).toBe('Anna');
    release([{ name: 'Bruno' }]);
    await until(() => el.querySelector('lc-data-table tbody td')?.textContent?.trim() === 'Bruno', 'new rows');
    await settle();
  });
});
