import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { NavigationDefinition, ScreenDefinition, ThemeDefinition } from 'schema';
import { vi } from 'vitest';
import { PreviewApp } from './preview-app';
import { previewConfig } from './preview-config';
import { previewState, type FromPreview, type PreviewState } from './protocol';

describe('anteprima (dentro l’iframe)', () => {
  let fixture: ComponentFixture<PreviewApp>;
  let el: HTMLElement;
  let sent: FromPreview[];

  const screen: ScreenDefinition = {
    schemaVersion: '1.0',
    screen: 'prova',
    dataSources: { elenco: { type: 'rest', method: 'GET', url: '/api/elenco' } },
    components: [
      { id: 'pulsante', type: 'button', label: 'Avvisa', onClick: [{ toast: 'Fatto' }] },
      { id: 'tabella', type: 'table', source: 'elenco', columns: [{ field: 'nome', label: 'Nome' }] },
      {
        id: 'schede',
        type: 'tabs',
        tabs: [
          { label: 'Prima', components: [{ id: 'testo-1', type: 'text', text: 'Uno' }] },
          { label: 'Seconda', components: [{ id: 'testo-2', type: 'text', text: 'Due' }] },
        ],
      },
    ],
  } as ScreenDefinition;

  beforeEach(async () => {
    sent = [];
    if (typeof Element.prototype.scrollTo !== 'function') Element.prototype.scrollTo = () => undefined;
    vi.stubGlobal('fetch', async () => ({ ok: false, status: 404, json: async () => ({}) }));
    // In jsdom la finestra «padre» è la stessa: si registra quello che l'anteprima manda all'editor.
    vi.spyOn(window, 'postMessage').mockImplementation((message: unknown) => void sent.push(message as FromPreview));
    TestBed.configureTestingModule({ providers: previewConfig.providers });
    fixture = TestBed.createComponent(PreviewApp);
    el = fixture.nativeElement as HTMLElement;
    await settle();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.documentElement.removeAttribute('style');
    document.getElementById('lc-nz-dark-theme')?.remove();
    document.body.querySelectorAll('.cdk-overlay-container').forEach((n) => n.remove());
  });

  async function settle(): Promise<void> {
    for (let i = 0; i < 3; i++) {
      fixture.detectChanges();
      await fixture.whenStable();
    }
  }

  async function until(condition: () => boolean, label: string): Promise<void> {
    for (let i = 0; i < 60; i++) {
      await settle();
      if (condition()) return;
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error(`timeout: ${label}`);
  }

  async function deliver(state: Partial<PreviewState>, origin = location.origin): Promise<void> {
    window.dispatchEvent(new MessageEvent('message', { data: { type: 'lc-preview:state', state: previewState(state) }, origin, source: window }));
    await settle();
  }

  it('si dichiara pronta, disegna lo stato ricevuto e risponde con i dati di esempio', async () => {
    expect(sent).toContainEqual({ type: 'lc-preview:ready' });
    await deliver({ screen, samples: { elenco: [{ nome: 'Mario' }] } });
    await until(() => !!el.querySelector('lc-table tbody')?.textContent?.includes('Mario'), 'riga di esempio');
    expect(sent).toContainEqual({ type: 'lc-preview:event', event: { kind: 'request', text: 'GET /api/elenco → elenco' } });
  });

  it('ignora i messaggi che non vengono dall’editor della stessa origine', async () => {
    await deliver({ screen }, 'https://altro.example');
    expect(el.querySelector('lc-screen')).toBeNull();
  });

  it('Alt+clic, o un clic in modalità selezione, manda all’editor l’id del componente senza attivarlo', async () => {
    await deliver({ screen });
    await until(() => !!el.querySelector('lc-node[data-node-id="pulsante"] button'), 'pulsante');
    (el.querySelector('lc-node[data-node-id="pulsante"] button') as HTMLButtonElement).dispatchEvent(new MouseEvent('click', { bubbles: true, altKey: true }));
    await settle();
    expect(sent).toContainEqual({ type: 'lc-preview:select', id: 'pulsante' });
    expect(document.querySelector('.ant-message-notice')).toBeNull();
    await deliver({ screen, selectMode: true });
    (el.querySelector('lc-node[data-node-id="testo-1"] lc-text') as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(sent).toContainEqual({ type: 'lc-preview:select', id: 'testo-1' });
  });

  it('il nodo selezionato in una scheda nascosta fa aprire quella scheda', async () => {
    await deliver({ screen });
    await until(() => el.querySelector('.ant-tabs-tab-active')?.textContent?.trim() === 'Prima', 'prima scheda');
    await deliver({ screen, selectedId: 'testo-2' });
    await until(() => el.querySelector('.ant-tabs-tab-active')?.textContent?.trim() === 'Seconda', 'seconda scheda');
    // Ogni messaggio arriva clonato: una schermata uguale non si ridisegna, quindi la scheda resta quella aperta.
    await deliver({ screen: structuredClone(screen), selectedId: null });
    await settle();
    expect(el.querySelector('.ant-tabs-tab-active')?.textContent?.trim()).toBe('Seconda');
  });

  it('menu con il profilo simulato, traduzioni dell’editor, tema scuro con il suo foglio di stile', async () => {
    const navigation = {
      schemaVersion: '1.0',
      navigation: 'prova',
      useCases: [
        {
          id: 'caso',
          label: 'Caso',
          items: [
            { id: 'ordini', label: "{{ t('p.ordini', 'Ordini') }}", screen: 'ordini', requires: 'ordini.ordine.leggi' },
            { id: 'altro', label: 'Altro', screen: 'altro' },
          ],
        },
      ],
    } as NavigationDefinition;
    const theme = {
      schemaVersion: '1.0',
      theme: 'notte',
      mode: 'dark',
      tokens: { colors: { primary: '#6aa6ff', onPrimary: '#0b1220', background: '#0f141b', surface: '#1a222d', onSurface: '#e6ebf2', border: '#2a3442' } },
    } as ThemeDefinition;
    const menu = (): string => el.querySelector('lc-sidebar')?.textContent?.replace(/\s+/g, ' ') ?? '';
    await deliver({ navigation, theme, locale: 'en', translations: { en: { 'p.ordini': 'Orders' } } });
    await until(() => menu().includes('Orders'), 'voce tradotta');
    // Il menu da solo: nessuna schermata accanto.
    expect(el.querySelector('lc-screen')).toBeNull();
    expect(document.documentElement.style.getPropertyValue('--lc-color-background')).toBe('#0f141b');
    expect(document.getElementById('lc-nz-dark-theme')).not.toBeNull();
    await deliver({ navigation, theme, locale: 'en', granted: [] });
    await until(() => !menu().includes('Orders') && menu().includes('Altro'), 'voce senza permesso nascosta');
  });
});
