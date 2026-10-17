import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { Authorization, DataClient, I18n, Notifier, ScreenComponent, ScreenNavigator, UserProvider } from 'core';
import { NzI18nService } from 'ng-zorro-antd/i18n';
import type { NodeDefinition, ScreenDefinition } from 'schema';
import { provideLowcodeComponents } from './provide';

describe('language and translations in the components', () => {
  let i18n: I18n;

  async function render(components: NodeDefinition[], data: unknown = {}): Promise<{ fixture: ComponentFixture<ScreenComponent>; el: HTMLElement }> {
    TestBed.configureTestingModule({
      providers: [
        provideLowcodeComponents(),
        { provide: Authorization, useValue: { can: () => true } },
        { provide: UserProvider, useValue: { user: () => ({ username: 'mario' }) } },
        { provide: ScreenNavigator, useValue: { navigate: () => undefined } },
        { provide: Notifier, useValue: { toast: () => undefined } },
        { provide: DataClient, useValue: { request: async () => data } },
      ],
    });
    i18n = TestBed.inject(I18n);
    // Starts in Italian, so that every test sees the switch to English.
    i18n.setLocale('it');
    i18n.addMessages('it', { 'x.save': 'Salva', 'x.number': 'Numero', 'x.name': 'Nome', 'x.help': 'Aiuto' });
    i18n.addMessages('en', { 'x.save': 'Save', 'x.number': 'Number', 'x.name': 'Name', 'x.help': 'Help' });
    const fixture = TestBed.createComponent(ScreenComponent);
    fixture.componentRef.setInput('definition', {
      schemaVersion: '1.0',
      screen: 'p',
      title: "{{ t('x.save', 'Salva') }}",
      dataSources: { rows: { type: 'rest', method: 'GET', url: '/api/rows' } },
      components,
    } satisfies ScreenDefinition);
    await settle(fixture);
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
    for (let i = 0; i < 4; i++) {
      fixture.detectChanges();
      await fixture.whenStable();
    }
  }

  it('title, button, columns and fields change together with the language, without reloading', async () => {
    const { fixture, el } = await render(
      [
        { type: 'button', label: "{{ t('x.save', 'Salva') }}", onClick: [] },
        { type: 'table', source: 'rows', columns: [{ field: 'n', label: "{{ t('x.number', 'Numero') }}" }] },
        { type: 'form', fields: [{ name: 'name', type: 'text', label: "{{ t('x.name', 'Nome') }}" }], actions: [{ label: "{{ t('x.save', 'Salva') }}", onClick: [] }] } as NodeDefinition,
      ],
      { items: [{ n: 1 }], total: 1 },
    );
    expect(el.querySelector('h1')!.textContent).toContain('Salva');
    expect(el.querySelector('th')!.textContent).toContain('Numero');
    expect(el.querySelector('nz-form-label')!.textContent).toContain('Nome');
    i18n.setLocale('en');
    await settle(fixture);
    expect(el.querySelector('h1')!.textContent).toContain('Save');
    expect(el.querySelector('button')!.textContent).toContain('Save');
    expect(el.querySelector('th')!.textContent).toContain('Number');
    expect(el.querySelector('nz-form-label')!.textContent).toContain('Name');
    expect(el.textContent).not.toContain('Salva');
  });

  it('runtime texts and the NG-ZORRO language follow the active language', async () => {
    const { fixture, el } = await render([{ type: 'table', source: 'rows', columns: [{ field: 'n' }] }], { items: [], total: 0 });
    expect(el.textContent).toContain('Nessun risultato.');
    const nz = TestBed.inject(NzI18nService);
    expect(nz.getLocaleId()).toBe('it');
    i18n.setLocale('en');
    await settle(fixture);
    expect(el.textContent).toContain('No results.');
    expect(nz.getLocaleId()).toBe('en-gb');
  });

  it('a column without a label shows the field name', async () => {
    const { el } = await render([{ type: 'table', source: 'rows', columns: [{ field: 'amount' }] }], { items: [{ amount: 1 }], total: 1 });
    expect(el.querySelector('th')!.textContent).toContain('amount');
  });

  it('shown values (valueKey), options (optionKey) and validation messages follow the language', async () => {
    const { fixture, el } = await render(
      [
        { type: 'table', source: 'rows', columns: [{ field: 'status', valueKey: 'val.status' }, { field: 'kind', format: 'badge', valueKey: 'val.kind', badges: { a: 'success' } }] },
        {
          type: 'form',
          fields: [{ name: 'kind', type: 'select', options: ['a', 'b'], optionKey: 'val.kind', validate: { rule: '{{ false }}', message: "{{ t('x.error', 'Errore') }}" } }],
          actions: [{ label: 'Ok', onClick: [] }],
        } as NodeDefinition,
      ],
      { items: [{ status: 'draft', kind: 'a' }], total: 1 },
    );
    i18n.addMessages('it', { 'val.status.draft': 'Bozza', 'val.kind.a': 'Alfa', 'x.error': 'Errore' });
    i18n.addMessages('en', { 'val.status.draft': 'Draft', 'val.kind.a': 'Alpha', 'x.error': 'Error' });
    await settle(fixture);
    expect(el.querySelector('tbody')!.textContent).toContain('Bozza');
    expect(el.querySelector('tbody nz-tag')!.textContent).toContain('Alfa');
    i18n.setLocale('en');
    await settle(fixture);
    expect(el.querySelector('tbody')!.textContent).toContain('Draft');
    expect(el.querySelector('tbody nz-tag')!.textContent).toContain('Alpha');
    // A value without a translation stays the original one.
    expect(i18n.t('val.kind.zzz', {}, 'zzz')).toBe('zzz');
  });

  it('the "required" message of the form is translated', async () => {
    const { fixture, el } = await render([
      { type: 'form', fields: [{ name: 'n', type: 'text', label: 'Nome', required: true }], actions: [{ label: 'Invia', onClick: [] }] } as NodeDefinition,
    ]);
    i18n.setLocale('en');
    await settle(fixture);
    (el.querySelector('form button') as HTMLButtonElement).click();
    await settle(fixture);
    expect(el.textContent).toContain('Required field');
  });
});
