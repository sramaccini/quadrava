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
  theme: 'test',
  mode,
  tokens: { colors: { primary: '#1f5fbf', onPrimary: '#fff', background: mode === 'dark' ? '#141414' : '#f4f6f9', surface: '#fff', onSurface: '#111', border: '#ccc', danger: '#c62828', success: '#2e7d32' } },
});

describe('integration with NG-ZORRO', () => {
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
    fixture.componentRef.setInput('definition', { schemaVersion: '1.0', screen: 'test', dataSources, components } satisfies ScreenDefinition);
    await settle(fixture);
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  afterEach(() => {
    document.body.querySelectorAll('.cdk-overlay-container').forEach((n) => n.remove());
    document.getElementById('lc-nz-dark-theme')?.remove();
    document.documentElement.removeAttribute('style');
  });

  describe('theme', () => {
    it('theme colours become NG-ZORRO variables, with the primary scale', () => {
      const vars = themeToNzVars(theme('light'));
      expect(vars['--ant-primary-color']).toBe('#1f5fbf');
      expect(vars['--ant-primary-color-outline']).toBe('rgba(31, 95, 191, 0.2)');
      expect(Object.keys(vars).filter((k) => /^--ant-primary-\d$/.test(k))).toHaveLength(7);
      expect(vars['--ant-success-color']).toBe('#2e7d32');
      expect(vars['--ant-error-color']).toBe('#c62828');
    });

    it('the dark theme uses a different scale and the light one does not change the primary', () => {
      expect(themeToNzVars(theme('dark'))['--ant-primary-1']).not.toBe(themeToNzVars(theme('light'))['--ant-primary-1']);
    });

    it('applying a dark theme loads the dark stylesheet; a light one removes it', async () => {
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

  describe('icons and messages', () => {
    it('only names of the built-in set show an icon; the others load nothing', async () => {
      expect(iconType('home')).toBe('home');
      expect(iconType('file-plus')).toBe('file-add');
      expect(iconType('../../evil')).toBeNull();
      TestBed.configureTestingModule({ providers: [provideLowcodeComponents()] });
      const known = TestBed.createComponent(IconComponent);
      known.componentRef.setInput('name', 'home');
      known.detectChanges();
      expect(known.nativeElement.querySelector('[nz-icon], nz-icon')).not.toBeNull();
      const unknown = TestBed.createComponent(IconComponent);
      unknown.componentRef.setInput('name', 'unknown');
      unknown.detectChanges();
      expect(unknown.nativeElement.querySelector('[nz-icon], nz-icon')).toBeNull();
    });

    it('the notifier uses NG-ZORRO messages and does not interpret HTML', async () => {
      TestBed.configureTestingModule({ providers: [provideLowcodeComponents()] });
      const messages = TestBed.inject(NzMessageService);
      const info = vi.spyOn(messages, 'info');
      const error = vi.spyOn(messages, 'error');
      const notifier = TestBed.inject(NzNotifier);
      notifier.toast('Done');
      notifier.toast('<b>Broken</b>', 'error');
      expect(info).toHaveBeenCalledWith('Done');
      expect(error).toHaveBeenCalledWith('&#60;b&#62;Broken&#60;/b&#62;');
      TestBed.tick();
      await new Promise((r) => setTimeout(r, 10));
      TestBed.tick();
      const text = document.body.querySelector('.ant-message')?.textContent ?? '';
      expect(text).toContain('<b>Broken</b>');
      expect(document.body.querySelector('.ant-message b')).toBeNull();
    });
  });

  describe('form', () => {
    const form: NodeDefinition = {
      type: 'form',
      fields: [
        { name: 'category', type: 'select', label: 'Category', options: ['private', 'business'] },
        { name: 'data', type: 'date', label: 'Date' },
        { name: 'accepted', type: 'checkbox', label: 'I accept' },
      ],
      initial: { data: '2026-10-07' },
      actions: [{ label: 'Send', onClick: [{ toast: '{{form.category}}|{{form.data}}|{{form.accepted}}' }] }],
    };

    it('select, date and checkbox write their values into the form', async () => {
      const { fixture, el } = await render([form]);
      // the initial date appears in the date picker
      expect((el.querySelector('nz-date-picker input') as HTMLInputElement).value).toBe('07/10/2026');
      const options = await openSelect(el.querySelector('lc-form nz-select') as Element, () => settle(fixture));
      (options.find((o) => o.textContent?.trim() === 'business') as HTMLElement).click();
      await settle(fixture);
      (el.querySelector('lc-form label[nz-checkbox] input') as HTMLInputElement).click();
      await settle(fixture);
      (el.querySelector('lc-form .actions button') as HTMLButtonElement).click();
      for (let i = 0; i < 20 && toasts.length === 0; i++) await new Promise((r) => setTimeout(r, 5));
      expect(toasts).toEqual(['business|2026-10-07|true']);
    });

    it('dates are converted without time zone', () => {
      expect(toIsoDate(parseIsoDate('2026-10-07'))).toBe('2026-10-07');
      expect(parseIsoDate('2026-13-45')?.getMonth()).not.toBe(12);
      expect(parseIsoDate('not a date')).toBeNull();
      expect(toIsoDate(null)).toBeNull();
    });
  });

  describe('table with server-side paging', () => {
    it('shows the pages from the total and asks for the chosen page', async () => {
      const { fixture, el } = await render(
        [{ type: 'table', source: 'data', columns: [{ field: 'n', label: 'N' }] }],
        { data: { type: 'rest', method: 'GET', url: '/api/data', params: { page: '{{state.page}}' }, paging: 'server' } },
        (r) => ({ items: [{ n: Number(r.query?.['page'] ?? 0) }], total: 25, size: 10 }),
      );
      expect([...el.querySelectorAll('.ant-pagination-item')].map((i) => i.textContent?.trim())).toEqual(['1', '2', '3']);
      (el.querySelectorAll('.ant-pagination-item')[1] as HTMLElement).click();
      await settle(fixture);
      expect(requests.at(-1)?.query).toEqual({ page: 1 });
      expect(el.querySelector('.ant-pagination-item-active')?.textContent?.trim()).toBe('2');
    });
  });

  describe('section and text', () => {
    it('the section has a title and content; the text has a heading or body style', async () => {
      const { el } = await render([{ type: 'section', title: 'Summary', components: [{ type: 'text', text: 'Title', style: 'heading' }, { type: 'text', text: 'Body' }] }]);
      expect(el.querySelector('nz-card[role=region]')?.getAttribute('aria-label')).toBe('Summary');
      expect(el.querySelector('.ant-card-head-title')?.textContent?.trim()).toBe('Summary');
      expect(el.querySelector('h2')?.textContent?.trim()).toBe('Title');
      expect(el.querySelector('p')?.textContent?.trim()).toBe('Body');
    });
  });
});
