import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { Authorization, DataClient, I18n, Notifier, ScreenComponent, ScreenNavigator, UserProvider } from 'core';
import { NzI18nService } from 'ng-zorro-antd/i18n';
import type { NodeDefinition, ScreenDefinition } from 'schema';
import { provideLowcodeComponents } from './provide';

describe('lingua e traduzioni nei componenti', () => {
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
    i18n.addMessages('it', { 'x.salva': 'Salva', 'x.numero': 'Numero', 'x.nome': 'Nome', 'x.aiuto': 'Aiuto' });
    i18n.addMessages('en', { 'x.salva': 'Save', 'x.numero': 'Number', 'x.nome': 'Name', 'x.aiuto': 'Help' });
    const fixture = TestBed.createComponent(ScreenComponent);
    fixture.componentRef.setInput('definition', {
      schemaVersion: '1.0',
      screen: 'p',
      title: "{{ t('x.salva', 'Salva') }}",
      dataSources: { righe: { type: 'rest', method: 'GET', url: '/api/righe' } },
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

  it('titolo, pulsante, colonne e campi cambiano insieme alla lingua, senza ricaricare', async () => {
    const { fixture, el } = await render(
      [
        { type: 'button', label: "{{ t('x.salva', 'Salva') }}", onClick: [] },
        { type: 'table', source: 'righe', columns: [{ field: 'n', label: "{{ t('x.numero', 'Numero') }}" }] },
        { type: 'form', fields: [{ name: 'nome', type: 'text', label: "{{ t('x.nome', 'Nome') }}" }], actions: [{ label: "{{ t('x.salva', 'Salva') }}", onClick: [] }] } as NodeDefinition,
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

  it('le scritte del runtime e la lingua di NG-ZORRO seguono la lingua attiva', async () => {
    const { fixture, el } = await render([{ type: 'table', source: 'righe', columns: [{ field: 'n' }] }], { items: [], total: 0 });
    expect(el.textContent).toContain('Nessun risultato.');
    const nz = TestBed.inject(NzI18nService);
    expect(nz.getLocaleId()).toBe('it');
    i18n.setLocale('en');
    await settle(fixture);
    expect(el.textContent).toContain('No results.');
    expect(nz.getLocaleId()).toBe('en-gb');
  });

  it('una colonna senza etichetta mostra il nome del campo', async () => {
    const { el } = await render([{ type: 'table', source: 'righe', columns: [{ field: 'importo' }] }], { items: [{ importo: 1 }], total: 1 });
    expect(el.querySelector('th')!.textContent).toContain('importo');
  });
});
