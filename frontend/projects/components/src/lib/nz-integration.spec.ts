import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { Authorization, DataClient, Notifier, ScreenComponent, ScreenNavigator, ThemeService, UserProvider, type DataRequest } from 'core';
import { NzMessageService } from 'ng-zorro-antd/message';
import type { NodeDefinition, ScreenDefinition, ThemeDefinition } from 'schema';
import { iconType, IconComponent } from './icon.component';
import { NzNotifier } from './notifier';
import { provideLowcodeComponents } from './provide';
import { openSelect, stubViewportHeight } from './select-testing';
import { parseIsoDate, toIsoDate } from './shared';
import { themeToNzVars } from './theme-bridge';

const theme = (mode: 'light' | 'dark'): ThemeDefinition => ({
  schemaVersion: '1.0',
  theme: 'prova',
  mode,
  tokens: { colors: { primary: '#1f5fbf', onPrimary: '#fff', background: mode === 'dark' ? '#141414' : '#f4f6f9', surface: '#fff', onSurface: '#111', border: '#ccc', danger: '#c62828', success: '#2e7d32' } },
});

describe('integrazione con NG-ZORRO', () => {
  let restore: () => void;
  beforeAll(() => (restore = stubViewportHeight()));
  afterAll(() => restore());

  let requests: DataRequest[];
  let toasts: string[];

  async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
    for (let i = 0; i < 4; i++) {
      fixture.detectChanges();
      await fixture.whenStable();
      await new Promise((r) => setTimeout(r, 5));
    }
  }

  async function render(components: NodeDefinition[], dataSources: ScreenDefinition['dataSources'] = {}, respond: (r: DataRequest) => unknown = () => ({})) {
    requests = [];
    toasts = [];
    TestBed.configureTestingModule({
      providers: [
        provideLowcodeComponents(),
        { provide: Authorization, useValue: { can: () => true } },
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

  afterEach(() => {
    document.body.querySelectorAll('.cdk-overlay-container').forEach((n) => n.remove());
    document.getElementById('lc-nz-dark-theme')?.remove();
    document.documentElement.removeAttribute('style');
  });

  describe('tema', () => {
    it('i colori del tema diventano le variabili di NG-ZORRO, con la scala del primario', () => {
      const vars = themeToNzVars(theme('light'));
      expect(vars['--ant-primary-color']).toBe('#1f5fbf');
      expect(vars['--ant-primary-color-outline']).toBe('rgba(31, 95, 191, 0.2)');
      expect(Object.keys(vars).filter((k) => /^--ant-primary-\d$/.test(k))).toHaveLength(7);
      expect(vars['--ant-success-color']).toBe('#2e7d32');
      expect(vars['--ant-error-color']).toBe('#c62828');
    });

    it('il tema scuro usa una scala diversa e il chiaro non cambia il primario', () => {
      expect(themeToNzVars(theme('dark'))['--ant-primary-1']).not.toBe(themeToNzVars(theme('light'))['--ant-primary-1']);
    });

    it('applicare un tema scuro carica lo stylesheet scuro; uno chiaro lo toglie', async () => {
      TestBed.configureTestingModule({ providers: [provideLowcodeComponents()] });
      const themes = TestBed.inject(ThemeService);
      themes.apply(theme('dark'));
      TestBed.tick();
      expect(document.documentElement.style.getPropertyValue('--ant-primary-color')).toBe('#1f5fbf');
      expect(document.getElementById('lc-nz-dark-theme')?.getAttribute('href')).toBe('nz-dark.css');
      themes.apply(theme('light'));
      TestBed.tick();
      expect(document.getElementById('lc-nz-dark-theme')).toBeNull();
    });
  });

  describe('icone e messaggi', () => {
    it('solo i nomi del set integrato mostrano un’icona; gli altri non caricano nulla', async () => {
      expect(iconType('home')).toBe('home');
      expect(iconType('file-plus')).toBe('file-add');
      expect(iconType('../../evil')).toBeNull();
      TestBed.configureTestingModule({ providers: [provideLowcodeComponents()] });
      const known = TestBed.createComponent(IconComponent);
      known.componentRef.setInput('name', 'home');
      known.detectChanges();
      expect(known.nativeElement.querySelector('[nz-icon], nz-icon')).not.toBeNull();
      const unknown = TestBed.createComponent(IconComponent);
      unknown.componentRef.setInput('name', 'sconosciuta');
      unknown.detectChanges();
      expect(unknown.nativeElement.querySelector('[nz-icon], nz-icon')).toBeNull();
    });

    it('il notificatore usa i messaggi di NG-ZORRO e non interpreta HTML', async () => {
      TestBed.configureTestingModule({ providers: [provideLowcodeComponents()] });
      const messages = TestBed.inject(NzMessageService);
      const info = vi.spyOn(messages, 'info');
      const error = vi.spyOn(messages, 'error');
      const notifier = TestBed.inject(NzNotifier);
      notifier.toast('Fatto');
      notifier.toast('<b>Guasto</b>', 'error');
      expect(info).toHaveBeenCalledWith('Fatto');
      expect(error).toHaveBeenCalledWith('&#60;b&#62;Guasto&#60;/b&#62;');
      TestBed.tick();
      await new Promise((r) => setTimeout(r, 10));
      TestBed.tick();
      const text = document.body.querySelector('.ant-message')?.textContent ?? '';
      expect(text).toContain('<b>Guasto</b>');
      expect(document.body.querySelector('.ant-message b')).toBeNull();
    });
  });

  describe('form', () => {
    const form: NodeDefinition = {
      type: 'form',
      fields: [
        { name: 'categoria', type: 'select', label: 'Categoria', options: ['privato', 'business'] },
        { name: 'data', type: 'date', label: 'Data' },
        { name: 'accetto', type: 'checkbox', label: 'Accetto' },
      ],
      initial: { data: '2026-10-07' },
      actions: [{ label: 'Invia', onClick: [{ toast: '{{form.categoria}}|{{form.data}}|{{form.accetto}}' }] }],
    };

    it('select, data e casella scrivono i valori nel form', async () => {
      const { fixture, el } = await render([form]);
      // la data iniziale compare nel selettore di date
      expect((el.querySelector('nz-date-picker input') as HTMLInputElement).value).toBe('2026-10-07');
      const options = await openSelect(el.querySelector('lc-form nz-select') as Element, () => settle(fixture));
      (options.find((o) => o.textContent?.trim() === 'business') as HTMLElement).click();
      await settle(fixture);
      (el.querySelector('lc-form label[nz-checkbox] input') as HTMLInputElement).click();
      await settle(fixture);
      (el.querySelector('lc-form .actions button') as HTMLButtonElement).click();
      for (let i = 0; i < 20 && toasts.length === 0; i++) await new Promise((r) => setTimeout(r, 5));
      expect(toasts).toEqual(['business|2026-10-07|true']);
    });

    it('le date si convertono senza fuso orario', () => {
      expect(toIsoDate(parseIsoDate('2026-10-07'))).toBe('2026-10-07');
      expect(parseIsoDate('2026-13-45')?.getMonth()).not.toBe(12);
      expect(parseIsoDate('non una data')).toBeNull();
      expect(toIsoDate(null)).toBeNull();
    });
  });

  describe('tabella con paginazione lato server', () => {
    it('mostra le pagine dal totale e chiede la pagina scelta', async () => {
      const { fixture, el } = await render(
        [{ type: 'table', source: 'dati', columns: [{ field: 'n', label: 'N' }] }],
        { dati: { type: 'rest', method: 'GET', url: '/api/dati', params: { page: '{{state.page}}' }, paging: 'server' } },
        (r) => ({ items: [{ n: Number(r.query?.['page'] ?? 0) }], total: 25, size: 10 }),
      );
      expect([...el.querySelectorAll('.ant-pagination-item')].map((i) => i.textContent?.trim())).toEqual(['1', '2', '3']);
      (el.querySelectorAll('.ant-pagination-item')[1] as HTMLElement).click();
      await settle(fixture);
      expect(requests.at(-1)?.query).toEqual({ page: 1 });
      expect(el.querySelector('.ant-pagination-item-active')?.textContent?.trim()).toBe('2');
    });
  });

  describe('sezione e testo', () => {
    it('la sezione ha titolo e contenuto; il testo ha titolo o corpo', async () => {
      const { el } = await render([{ type: 'section', title: 'Riepilogo', components: [{ type: 'text', text: 'Titolo', style: 'heading' }, { type: 'text', text: 'Corpo' }] }]);
      expect(el.querySelector('nz-card[role=region]')?.getAttribute('aria-label')).toBe('Riepilogo');
      expect(el.querySelector('.ant-card-head-title')?.textContent?.trim()).toBe('Riepilogo');
      expect(el.querySelector('h2')?.textContent?.trim()).toBe('Titolo');
      expect(el.querySelector('p')?.textContent?.trim()).toBe('Corpo');
    });
  });
});
