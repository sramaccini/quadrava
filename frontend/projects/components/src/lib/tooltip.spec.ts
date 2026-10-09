import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { Authorization, DataClient, Notifier, ScreenComponent, ScreenNavigator, UserProvider } from 'core';
import type { NodeDefinition, ScreenDefinition } from 'schema';
import { provideLowcodeComponents } from './provide';

describe('tooltip opzionale', () => {
  async function render(components: NodeDefinition[]): Promise<{ fixture: ComponentFixture<ScreenComponent>; el: HTMLElement }> {
    TestBed.configureTestingModule({
      providers: [
        provideLowcodeComponents(),
        { provide: Authorization, useValue: { can: () => true } },
        { provide: UserProvider, useValue: { user: () => ({ username: 'mario' }) } },
        { provide: ScreenNavigator, useValue: { navigate: () => undefined } },
        { provide: Notifier, useValue: { toast: () => undefined } },
        { provide: DataClient, useValue: { request: async () => ({}) } },
      ],
    });
    const fixture = TestBed.createComponent(ScreenComponent);
    fixture.componentRef.setInput('definition', { schemaVersion: '1.0', screen: 'prova', components } satisfies ScreenDefinition);
    for (let i = 0; i < 4; i++) {
      fixture.detectChanges();
      await fixture.whenStable();
    }
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  async function overlayText(fixture: ComponentFixture<unknown>): Promise<string> {
    for (let i = 0; i < 40; i++) {
      fixture.detectChanges();
      const tip = document.querySelector('.ant-tooltip-inner');
      if (tip) return tip.textContent ?? '';
      await new Promise((r) => setTimeout(r, 25));
    }
    return '';
  }

  afterEach(() => document.querySelectorAll('.cdk-overlay-container').forEach((e) => (e.innerHTML = '')));

  it('mostra il testo con le espressioni risolte, senza interpretare HTML', async () => {
    const { fixture, el } = await render([
      { type: 'button', label: 'Salva', tooltip: 'Ciao {{user.username}} <b>x</b>', onClick: [] },
    ]);
    el.querySelector('.tip')!.dispatchEvent(new MouseEvent('mouseenter'));
    expect(await overlayText(fixture)).toBe('Ciao mario <b>x</b>');
    expect(document.querySelector('.ant-tooltip-inner b')).toBeNull();
  });

  it('senza tooltip non aggiunge involucri', async () => {
    const { el } = await render([{ type: 'text', text: 'Ciao' }]);
    expect(el.querySelector('.tip')).toBeNull();
  });

  it('un tooltip che si risolve in vuoto non viene mostrato', async () => {
    const { el } = await render([{ type: 'text', text: 'Ciao', tooltip: '{{ "" }}' }]);
    expect(el.querySelector('.tip')).toBeNull();
  });

  it('le etichette di campo mostrano l’icona di aiuto', async () => {
    const { el } = await render([
      { type: 'form', fields: [{ name: 'n', type: 'text', label: 'Nome', tooltip: 'Il nome' }], actions: [] } as NodeDefinition,
    ]);
    expect(el.querySelector('nz-form-label [nz-icon], nz-form-label .anticon')).not.toBeNull();
  });
});
