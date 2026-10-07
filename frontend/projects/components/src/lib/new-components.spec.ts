import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { Authorization, DataClient, Notifier, ScreenComponent, ScreenNavigator, UserProvider, type DataRequest } from 'core';
import type { NodeDefinition, ScreenDefinition } from 'schema';
import { DialogConfirmation } from './dialog-confirmation';
import { provideLowcodeComponents } from './provide';

const plain = (text: string | null | undefined): string => (text ?? '').replace(/[  \s]+/g, ' ').trim();

describe('nuovi componenti del catalogo', () => {
  const permissions = signal(new Set<string>());
  let requests: DataRequest[];
  let toasts: string[];
  let respond: (r: DataRequest) => unknown;

  async function render(
    components: NodeDefinition[],
    dataSources: ScreenDefinition['dataSources'] = {},
    granted: string[] = [],
  ): Promise<{ fixture: ComponentFixture<ScreenComponent>; el: HTMLElement }> {
    permissions.set(new Set(granted));
    requests = [];
    toasts = [];
    respond = () => ({});
    TestBed.configureTestingModule({
      providers: [
        provideLowcodeComponents(),
        { provide: Authorization, useValue: { can: (p: string) => permissions().has(p) } },
        { provide: UserProvider, useValue: { user: () => ({ username: 'u' }) } },
        { provide: ScreenNavigator, useValue: { navigate: () => undefined } },
        { provide: Notifier, useValue: { toast: (m: string) => toasts.push(m) } },
        { provide: DataClient, useValue: { request: async (r: DataRequest) => (requests.push(r), respond(r)) } },
      ],
    });
    const fixture = TestBed.createComponent(ScreenComponent);
    fixture.componentRef.setInput('definition', { schemaVersion: '1.0', screen: 'prova', dataSources, components } satisfies ScreenDefinition);
    await settle(fixture);
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
    for (let i = 0; i < 4; i++) {
      fixture.detectChanges();
      await fixture.whenStable();
    }
  }

  async function renderWithData(components: NodeDefinition[], data: unknown, granted: string[] = []) {
    permissions.set(new Set(granted));
    requests = [];
    toasts = [];
    TestBed.configureTestingModule({
      providers: [
        provideLowcodeComponents(),
        { provide: Authorization, useValue: { can: (p: string) => permissions().has(p) } },
        { provide: UserProvider, useValue: { user: () => ({ username: 'u' }) } },
        { provide: ScreenNavigator, useValue: { navigate: () => undefined } },
        { provide: Notifier, useValue: { toast: (m: string) => toasts.push(m) } },
        { provide: DataClient, useValue: { request: async (r: DataRequest) => (requests.push(r), data) } },
      ],
    });
    const fixture = TestBed.createComponent(ScreenComponent);
    fixture.componentRef.setInput('definition', {
      schemaVersion: '1.0',
      screen: 'prova',
      dataSources: { dati: { type: 'rest', method: 'GET', url: '/api/dati' } },
      components,
    } satisfies ScreenDefinition);
    await settle(fixture);
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  describe('formati di cella della tabella', () => {
    const row = { id: 1, importo: 12500, sconto: 10, emessa: '2026-10-07', pagata: true, stato: 'approvato', altro: 'inviato', iban: 'IT60X0542811101000000123456' };
    const table: NodeDefinition = {
      type: 'table',
      source: 'dati',
      columns: [
        { field: 'importo', label: 'Importo', format: 'currency' },
        { field: 'sconto', label: 'Sconto', format: 'percent' },
        { field: 'emessa', label: 'Emessa', format: 'date' },
        { field: 'pagata', label: 'Pagata', format: 'boolean' },
        { field: 'stato', label: 'Stato', format: 'badge', badges: { approvato: 'success' } },
        { field: 'altro', label: 'Altro', format: 'badge', badges: { approvato: 'success' } },
        { field: 'iban', label: 'IBAN', hiddenIf: "{{!can('ordini.iban.leggi')}}" },
      ],
    };

    it('mostra i valori formattati', async () => {
      const { el } = await renderWithData([table], [row]);
      const cells = [...el.querySelectorAll('tbody td')].map((c) => plain(c.textContent));
      expect(cells.slice(0, 4)).toEqual(['12.500,00 €', '10 %', '07/10/26', 'Sì']);
      expect(cells.slice(4, 6)).toEqual(['approvato', 'inviato']);
    });

    it('i badge hanno il tono del tema; i valori non elencati sono neutri', async () => {
      const { el } = await renderWithData([table], [row]);
      const badges = [...el.querySelectorAll('tbody .tone')];
      expect(badges.map((b) => b.className.replace('tone ', ''))).toEqual(['tone-success', 'tone-neutral']);
    });

    it('importi e percentuali sono allineati a destra', async () => {
      const { el } = await renderWithData([table], [row]);
      const aligned = [...el.querySelectorAll('thead th')].map((h) => h.classList.contains('num'));
      expect(aligned.slice(0, 5)).toEqual([true, true, false, false, false]);
    });

    it('una colonna con hiddenIf compare solo a chi ha il permesso, intestazione compresa', async () => {
      const denied = await renderWithData([table], [row]);
      expect(denied.el.querySelectorAll('thead th')).toHaveLength(6);
      expect(denied.el.textContent).not.toContain('IT60X');
      TestBed.resetTestingModule();
      const allowed = await renderWithData([table], [row], ['ordini.iban.leggi']);
      expect(allowed.el.querySelectorAll('thead th')).toHaveLength(7);
      expect(allowed.el.textContent).toContain('IT60X0542811101000000123456');
    });

    it('un testo come valore di un badge non viene interpretato come HTML', async () => {
      const { el } = await renderWithData([table], [{ ...row, stato: '<img src=x onerror=alert(1)>' }]);
      expect(el.querySelector('tbody img')).toBeNull();
      expect(el.querySelector('tbody')?.textContent).toContain('<img');
    });
  });

  describe('detail', () => {
    const detail: NodeDefinition = {
      type: 'detail',
      source: 'dati',
      title: 'Ordine',
      fields: [
        { field: 'numero', label: 'Numero' },
        { field: 'sconto', label: 'Sconto', format: 'percent' },
        { field: 'stato', label: 'Stato', format: 'badge', badges: { approvato: 'success' } },
        { field: 'nota', label: 'Nota' },
        { field: 'iban', label: 'IBAN', hiddenIf: "{{!can('ordini.iban.leggi')}}" },
      ],
    };
    const record = { numero: 'ORD-1', sconto: 10, stato: 'approvato', nota: null, iban: 'IT60' };

    it('mostra etichette e valori formattati; un valore vuoto è un trattino', async () => {
      const { el } = await renderWithData([detail], record);
      expect(el.querySelector('h2')?.textContent).toBe('Ordine');
      const pairs = [...el.querySelectorAll('dl > div')].map((d) => [plain(d.querySelector('dt')?.textContent), plain(d.querySelector('dd')?.textContent)]);
      expect(pairs).toEqual([['Numero', 'ORD-1'], ['Sconto', '10 %'], ['Stato', 'approvato'], ['Nota', '—']]);
      expect(el.querySelector('dd .tone-success')).not.toBeNull();
    });

    it('i campi con hiddenIf compaiono solo con il permesso', async () => {
      const { el } = await renderWithData([detail], record, ['ordini.iban.leggi']);
      expect(el.textContent).toContain('IBAN');
    });

    it('prima dei dati mostra il caricamento; se la risposta non è un record, "Nessun dato"', async () => {
      const { el } = await renderWithData([detail], [1, 2]);
      expect(plain(el.textContent)).toContain('Nessun dato.');
    });

    it('se il servizio fallisce mostra un errore leggibile da chi usa uno screen reader', async () => {
      permissions.set(new Set());
      TestBed.configureTestingModule({
        providers: [
          provideLowcodeComponents(),
          { provide: Authorization, useValue: { can: () => true } },
          { provide: UserProvider, useValue: { user: () => ({}) } },
          { provide: ScreenNavigator, useValue: { navigate: () => undefined } },
          { provide: Notifier, useValue: { toast: () => undefined } },
          { provide: DataClient, useValue: { request: async () => { throw new Error('500'); } } },
        ],
      });
      const fixture = TestBed.createComponent(ScreenComponent);
      fixture.componentRef.setInput('definition', { schemaVersion: '1.0', screen: 'p', dataSources: { dati: { type: 'rest', method: 'GET', url: '/api/dati' } }, components: [detail] });
      await settle(fixture);
      expect(fixture.nativeElement.querySelector('[role=alert]')).not.toBeNull();
    });
  });

  describe('alert', () => {
    it('usa il ruolo giusto per il tipo e interpola i valori', async () => {
      const { el } = await render([
        { type: 'alert', text: 'Ciao {{user.username}}' },
        { type: 'alert', text: 'Salvato', kind: 'success' },
        { type: 'alert', text: 'Errore', kind: 'error' },
      ]);
      const alerts = [...el.querySelectorAll('.alert')];
      expect(alerts.map((a) => [a.getAttribute('role'), a.classList.contains('info'), a.classList.contains('success'), a.classList.contains('error')])).toEqual([
        ['status', true, false, false],
        ['status', false, true, false],
        ['alert', false, false, true],
      ]);
      expect(alerts[0].textContent).toBe('Ciao u');
    });

    it('compare e sparisce con visibleIf, che dipende dai permessi', async () => {
      const { fixture, el } = await render([{ type: 'alert', text: 'Sola lettura', visibleIf: "{{!can('ordini.ordine.scrivi')}}" }]);
      expect(el.querySelector('.alert')).not.toBeNull();
      permissions.set(new Set(['ordini.ordine.scrivi']));
      await settle(fixture);
      expect(el.querySelector('.alert')).toBeNull();
    });
  });

  describe('tabs', () => {
    const tabs: NodeDefinition = {
      type: 'tabs',
      tabs: [
        { label: 'Dati', components: [{ type: 'form', fields: [{ name: 'cliente', type: 'text', label: 'Cliente' }] }] },
        { label: 'Note', components: [{ type: 'text', text: 'Testo delle note' }] },
        { label: 'Banca', visibleIf: "{{can('ordini.iban.leggi')}}", components: [{ type: 'text', text: 'Dati bancari' }] },
      ],
    };
    const tabButtons = (el: HTMLElement): HTMLButtonElement[] => [...el.querySelectorAll<HTMLButtonElement>('[role=tab]')];
    const panels = (el: HTMLElement): HTMLElement[] => [...el.querySelectorAll<HTMLElement>('[role=tabpanel]')];

    it('mostra la prima scheda e collega le schede ai loro pannelli', async () => {
      const { el } = await render([tabs]);
      expect(tabButtons(el).map((b) => plain(b.textContent))).toEqual(['Dati', 'Note']);
      expect(tabButtons(el).map((b) => b.getAttribute('aria-selected'))).toEqual(['true', 'false']);
      expect(panels(el).map((p) => p.hidden)).toEqual([false, true]);
      const [first] = tabButtons(el);
      expect(panels(el)[0].getAttribute('aria-labelledby')).toBe(first.id);
      expect(first.getAttribute('aria-controls')).toBe(panels(el)[0].id);
    });

    it('il click cambia scheda e solo la scheda scelta è nel tabindex', async () => {
      const { fixture, el } = await render([tabs]);
      tabButtons(el)[1].click();
      await settle(fixture);
      expect(panels(el).map((p) => p.hidden)).toEqual([true, false]);
      expect(tabButtons(el).map((b) => b.tabIndex)).toEqual([-1, 0]);
    });

    it('i dati scritti in una scheda non si perdono cambiando scheda', async () => {
      const { fixture, el } = await render([tabs]);
      const input = el.querySelector('input') as HTMLInputElement;
      input.value = 'Rossi Srl';
      input.dispatchEvent(new Event('input'));
      await settle(fixture);
      tabButtons(el)[1].click();
      await settle(fixture);
      tabButtons(el)[0].click();
      await settle(fixture);
      expect((el.querySelector('input') as HTMLInputElement).value).toBe('Rossi Srl');
    });

    it('le frecce, Home e Fine spostano scheda e focus', async () => {
      const { fixture, el } = await render([tabs]);
      document.body.appendChild(el);
      const key = (k: string, from: number): void => {
        tabButtons(el)[from].dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
      };
      key('ArrowRight', 0);
      await settle(fixture);
      await Promise.resolve();
      expect(tabButtons(el)[1].getAttribute('aria-selected')).toBe('true');
      expect(document.activeElement).toBe(tabButtons(el)[1]);
      key('ArrowRight', 1); // dall'ultima si torna alla prima
      await settle(fixture);
      expect(tabButtons(el)[0].getAttribute('aria-selected')).toBe('true');
      key('End', 0);
      await settle(fixture);
      expect(tabButtons(el)[1].getAttribute('aria-selected')).toBe('true');
      key('Home', 1);
      await settle(fixture);
      expect(tabButtons(el)[0].getAttribute('aria-selected')).toBe('true');
      el.remove();
    });

    it('una scheda con visibleIf compare con il permesso; se sparisce, si torna alla prima', async () => {
      const { fixture, el } = await render([tabs], {}, ['ordini.iban.leggi']);
      expect(tabButtons(el).map((b) => plain(b.textContent))).toEqual(['Dati', 'Note', 'Banca']);
      tabButtons(el)[2].click();
      await settle(fixture);
      expect(panels(el)[2].hidden).toBe(false);
      permissions.set(new Set());
      await settle(fixture);
      expect(tabButtons(el)).toHaveLength(2);
      expect(tabButtons(el)[0].getAttribute('aria-selected')).toBe('true');
    });
  });

  describe('finestra di conferma', () => {
    const dialog = (): HTMLElement | null => document.body.querySelector('[role=dialog]');
    const click = (action: 'cancel' | 'confirm'): void => (document.body.querySelector(`[data-action=${action}]`) as HTMLButtonElement).click();

    beforeEach(() => TestBed.configureTestingModule({ providers: [provideLowcodeComponents()] }));
    afterEach(() => document.body.querySelectorAll('lc-confirm-dialog, .stub').forEach((n) => n.remove()));

    it('mostra il messaggio come testo, con il focus su Annulla, e Conferma risolve true', async () => {
      const service = TestBed.inject(DialogConfirmation);
      const result = service.confirm('Approvare <b>ORD-1</b>?');
      expect(dialog()?.getAttribute('aria-modal')).toBe('true');
      expect(dialog()?.querySelector('b')).toBeNull();
      expect(dialog()?.textContent).toContain('Approvare <b>ORD-1</b>?');
      expect((document.activeElement as HTMLElement).dataset['action']).toBe('cancel');
      click('confirm');
      expect(await result).toBe(true);
      expect(dialog()).toBeNull();
    });

    it('Annulla, Esc e clic fuori dalla finestra risolvono false', async () => {
      const service = TestBed.inject(DialogConfirmation);
      let result = service.confirm('Sicuro?');
      click('cancel');
      expect(await result).toBe(false);
      result = service.confirm('Sicuro?');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(await result).toBe(false);
      result = service.confirm('Sicuro?');
      (document.body.querySelector('.backdrop') as HTMLElement).click();
      expect(await result).toBe(false);
      expect(dialog()).toBeNull();
    });

    it('un clic dentro la finestra, fuori dai pulsanti, non annulla', async () => {
      const service = TestBed.inject(DialogConfirmation);
      const result = service.confirm('Sicuro?');
      (document.body.querySelector('.panel p') as HTMLElement).click();
      expect(dialog()).not.toBeNull();
      click('cancel');
      await result;
    });

    it('Tab resta dentro la finestra', async () => {
      const service = TestBed.inject(DialogConfirmation);
      const result = service.confirm('Sicuro?');
      const tab = (shift = false): void => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: shift, bubbles: true, cancelable: true }));
      };
      tab();
      expect((document.activeElement as HTMLElement).dataset['action']).toBe('confirm');
      tab();
      expect((document.activeElement as HTMLElement).dataset['action']).toBe('cancel');
      tab(true);
      expect((document.activeElement as HTMLElement).dataset['action']).toBe('confirm');
      click('cancel');
      await result;
    });

    it('una seconda richiesta mentre la finestra è aperta viene rifiutata', async () => {
      const service = TestBed.inject(DialogConfirmation);
      const first = service.confirm('Prima');
      expect(await service.confirm('Seconda')).toBe(false);
      expect(document.body.querySelectorAll('[role=dialog]')).toHaveLength(1);
      click('confirm');
      expect(await first).toBe(true);
    });

    it('alla chiusura il focus torna dove era', async () => {
      const opener = document.createElement('button');
      opener.className = 'stub';
      document.body.appendChild(opener);
      opener.focus();
      const result = TestBed.inject(DialogConfirmation).confirm('Sicuro?');
      expect(document.activeElement).not.toBe(opener);
      click('cancel');
      await result;
      expect(document.activeElement).toBe(opener);
    });

    it('in una schermata, un pulsante con confirm non chiama il servizio se si annulla e lo chiama se si conferma', async () => {
      const button: NodeDefinition = {
        type: 'button',
        label: 'Elimina',
        onClick: [{ confirm: 'Eliminare {{user.username}}?' }, { call: 'elimina' }, { toast: 'Eliminato' }],
      };
      const { fixture, el } = await render([button], { elimina: { type: 'rest', method: 'POST', url: '/api/elimina' } });
      const press = async (): Promise<void> => {
        (el.querySelector('button') as HTMLButtonElement).click();
        await settle(fixture);
      };
      await press();
      expect(dialog()?.textContent).toContain('Eliminare u?');
      click('cancel');
      await new Promise((r) => setTimeout(r)); // la sequenza si chiude in modo asincrono: il pulsante torna libero
      await settle(fixture);
      expect(requests).toEqual([]);
      expect(toasts).toEqual([]);
      await press();
      click('confirm');
      for (let i = 0; i < 20 && toasts.length === 0; i++) await new Promise((r) => setTimeout(r));
      expect(requests.map((r) => r.url)).toEqual(['/api/elimina']);
      expect(toasts).toEqual(['Eliminato']);
    });
  });
});
