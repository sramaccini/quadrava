import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { BUSY_DELAY_MS, BUSY_MIN_VISIBLE_MS, BUSY_SLOW_MS, BusyComponent } from './busy.component';
import { provideLowcodeComponents } from './provide';
import { renderScreen } from './screen-testing';

@Component({
  imports: [BusyComponent],
  template: `<lc-busy [busy]="busy()" [empty]="empty()"><p class="dati">righe</p></lc-busy>`,
})
class Host {
  readonly busy = signal(false);
  readonly empty = signal(false);
}

describe('Indicatore di attività (lc-busy)', () => {
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

  it('una risposta veloce non mostra nulla; aria-busy segue comunque l’attesa', async () => {
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

  it('un’attesa vera mostra spinner e annuncio, il contenuto resta (attenuato); poi resta visibile il minimo previsto', async () => {
    const { el, host, advance } = await mount();
    host.busy.set(true);
    await advance(BUSY_DELAY_MS);
    expect(overlay(el)?.querySelector('nz-spin')).not.toBeNull();
    expect(status(el)).toBe('Caricamento…');
    expect(el.querySelector('.busy')?.classList.contains('on')).toBe(true);
    expect(el.querySelector('.dati')?.textContent).toBe('righe');
    host.busy.set(false);
    await advance(BUSY_MIN_VISIBLE_MS - 50);
    expect(overlay(el)).not.toBeNull();
    await advance(50);
    expect(overlay(el)).toBeNull();
    expect(status(el)).toBe('');
  });

  it('oltre l’attesa normale dice che ci vuole più del solito', async () => {
    const { el, host, advance } = await mount();
    host.busy.set(true);
    await advance(BUSY_SLOW_MS);
    expect(status(el)).toBe('Ci vuole più del solito…');
    expect(el.querySelector('.label')?.textContent?.trim()).toBe('Ci vuole più del solito…');
  });

  it('al primo caricamento riserva lo spazio, poi lo rilascia', async () => {
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

describe('Indicatore di attività nei componenti con data source', () => {
  it('la datatable mostra lo spinner al primo caricamento e nella ricarica tiene le righe', async () => {
    let release: (value: unknown) => void = () => undefined;
    const { el, settle, until, fixture } = await renderScreen({
      dataSources: { righe: { type: 'rest', method: 'GET', url: '/api/righe', params: { f: "{{ has(state.f) ? state.f : '' }}" } } },
      components: [{ type: 'dataTable', source: 'righe', columns: [{ field: 'nome', label: 'Nome' }] }],
      respond: () => new Promise((resolve) => (release = resolve)),
    });
    await until(() => !!el.querySelector('lc-data-table lc-busy .overlay'), 'spinner al primo caricamento');
    expect(el.querySelector('lc-data-table lc-busy .busy')?.classList.contains('reserve')).toBe(true);
    // Durante il caricamento la tabella non dice «Nessun risultato».
    expect(el.querySelector('lc-data-table .ant-table-placeholder')?.textContent?.trim() ?? '').toBe('');
    release([{ nome: 'Anna' }]);
    await until(() => !el.querySelector('lc-data-table lc-busy .overlay'), 'spinner tolto');
    expect(el.querySelector('lc-data-table tbody td')?.textContent?.trim()).toBe('Anna');

    // Ricarica: le righe restano, attenuate, con lo spinner sopra.
    fixture.componentInstance.runtime()!.state.update((s) => ({ ...s, f: 'x' }));
    await until(() => !!el.querySelector('lc-data-table lc-busy .busy.on'), 'ricarica');
    expect(el.querySelector('lc-data-table tbody td')?.textContent?.trim()).toBe('Anna');
    release([{ nome: 'Bruno' }]);
    await until(() => el.querySelector('lc-data-table tbody td')?.textContent?.trim() === 'Bruno', 'nuove righe');
    await settle();
  });
});
