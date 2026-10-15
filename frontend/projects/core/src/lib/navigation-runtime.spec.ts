import { signal } from '@angular/core';
import { ExpressionEngine } from 'expressions';
import type { NavigationDefinition } from 'schema';
import { checkNavigation } from './navigation-check';
import { NavigationRuntime } from './navigation-runtime';
import { I18n } from './i18n';
import type { Authorization, UserProvider } from './ports';

const definition: NavigationDefinition = {
  schemaVersion: '1.0',
  navigation: 'app',
  default: 'consultazione',
  areas: [
    {
      id: 'inserimento',
      label: 'Inserimento',
      requires: 'fatture.fattura.crea',
      items: [
        {
          id: 'nuova',
          label: 'Nuova',
          children: [
            { id: 'attiva', label: 'Attiva', screen: 'fattura-nuova', params: { tipo: 'attiva' } },
            { id: 'passiva', label: 'Passiva', screen: 'fattura-nuova', params: { tipo: 'passiva' } },
            { id: 'da-ordine', label: 'Da ordine', children: [{ id: 'scegli', label: 'Scegli', screen: 'ordini-elenco', requires: 'ordini.ordine.leggi' }] },
          ],
        },
      ],
    },
    {
      id: 'consultazione',
      label: 'Consultazione',
      requires: 'fatture.fattura.leggi',
      items: [
        { id: 'elenco', label: 'Elenco', screen: 'fatture-elenco' },
        { id: 'solo-admin', label: 'Solo admin', screen: 'x', visibleIf: "{{'administrator' in user.roles}}" },
        { id: 'rotta', label: 'Rotta', screen: 'y', visibleIf: '{{user.inesistente == 1}}' },
      ],
    },
  ],
};

function setup(initial: string[], roles: string[] = []) {
  const permissions = signal(new Set(initial));
  const reports: string[] = [];
  const authorization = { can: (p: string) => permissions().has(p) } as Authorization;
  const userProvider = { user: () => ({ roles }) } as UserProvider;
  const nav = new NavigationRuntime(definition, { authorization, userProvider, diagnostics: { report: (e) => reports.push(e.source) } });
  return { nav, permissions, reports };
}

describe('NavigationRuntime', () => {
  it('mostra solo le aree consentiti', () => {
    const { nav } = setup(['fatture.fattura.leggi']);
    expect(nav.areas().map((u) => u.id)).toEqual(['consultazione']);
  });

  it('nasconde un’area se nessuna voce è visibile', () => {
    const { nav } = setup(['fatture.fattura.crea']);
    // Le voci "Attiva" e "Passiva" non richiedono permessi propri: l’area resta.
    expect(nav.areas().map((u) => u.id)).toEqual(['inserimento']);
    expect(nav.area('inserimento')?.items).toHaveLength(1);
  });

  it('elimina i gruppi vuoti e tiene i tre livelli quando consentiti', () => {
    const { nav } = setup(['fatture.fattura.crea']);
    const nuova = nav.area('inserimento')?.items[0];
    expect(nuova?.kind === 'group' && nuova.children.map((c) => c.id)).toEqual(['attiva', 'passiva']);
    const withOrders = setup(['fatture.fattura.crea', 'ordini.ordine.leggi']).nav.area('inserimento')?.items[0];
    expect(withOrders?.kind === 'group' && withOrders.children.map((c) => c.id)).toEqual(['attiva', 'passiva', 'da-ordine']);
  });

  it('si aggiorna quando cambiano i permessi', () => {
    const { nav, permissions } = setup([]);
    expect(nav.areas()).toEqual([]);
    permissions.set(new Set(['fatture.fattura.leggi']));
    expect(nav.areas().map((u) => u.id)).toEqual(['consultazione']);
  });

  it('visibleIf: vero mostra, errore nasconde e segnala', async () => {
    const { nav, reports } = setup(['fatture.fattura.leggi'], ['administrator']);
    const ids = nav.area('consultazione')?.items.map((i) => i.id);
    expect(ids).toEqual(['elenco', 'solo-admin']);
    await Promise.resolve();
    expect(reports.length).toBeGreaterThan(0);
    expect(setup(['fatture.fattura.leggi'], ['operator']).nav.area('consultazione')?.items.map((i) => i.id)).toEqual(['elenco']);
  });

  it('sceglie la destinazione iniziale: default se visibile, altrimenti la prima area', () => {
    expect(setup(['fatture.fattura.leggi', 'fatture.fattura.crea']).nav.defaultTarget()).toMatchObject({ area: 'consultazione', leaf: { id: 'elenco' } });
    expect(setup(['fatture.fattura.crea']).nav.defaultTarget()).toMatchObject({ area: 'inserimento', leaf: { id: 'attiva' } });
    expect(setup([]).nav.defaultTarget()).toBeNull();
  });

  it('costruisce il percorso di etichette per le briciole di pane', () => {
    const { nav } = setup(['fatture.fattura.crea']);
    expect(nav.trail('inserimento', 'fattura-nuova', { tipo: 'passiva' })).toEqual(['Inserimento', 'Nuova', 'Passiva']);
    expect(nav.trail('inserimento', 'fattura-nuova', { tipo: 'altro' })).toBeNull();
  });

  it('individua la voce attiva usando schermata e parametri', () => {
    const { nav } = setup(['fatture.fattura.crea']);
    expect(nav.locate('inserimento', 'fattura-nuova', { tipo: 'passiva' })).toEqual(['nuova', 'passiva']);
    expect(nav.locate('inserimento', 'fattura-nuova', { tipo: 'altro' })).toBeNull();
    expect(nav.locate('consultazione', 'fatture-elenco')).toBeNull();
  });

  it('trova l’area di una schermata preferendo quella corrente', () => {
    const { nav } = setup(['fatture.fattura.crea', 'fatture.fattura.leggi', 'ordini.ordine.leggi']);
    expect(nav.areaOf('ordini-elenco', {}, 'inserimento')).toBe('inserimento');
    expect(nav.areaOf('fatture-elenco', {}, 'inserimento')).toBe('consultazione');
    expect(nav.areaOf('sconosciuta')).toBeNull();
  });
});

describe('checkNavigation', () => {
  const engine = new ExpressionEngine({ can: () => false });

  it('non segnala nulla per un documento coerente', () => {
    const screens = new Set(['fattura-nuova', 'ordini-elenco', 'fatture-elenco', 'x', 'y']);
    expect(checkNavigation({ ...definition, areas: definition.areas.map((u) => ({ ...u, items: u.items.filter((i) => i.id !== 'rotta') })) }, engine, screens)).toEqual([]);
  });

  it('segnala id duplicati, default e schermate inesistenti, espressioni errate', () => {
    const broken: NavigationDefinition = {
      schemaVersion: '1.0',
      navigation: 'app',
      default: 'nessuno',
      areas: [
        {
          id: 'uc',
          label: 'Uc',
          items: [
            { id: 'a', label: 'A', screen: 'esiste' },
            { id: 'a', label: 'A2', screen: 'manca' },
            { id: 'b', label: 'B', screen: 'esiste', visibleIf: '{{can(1)}}' },
          ],
        },
      ],
    };
    const messages = checkNavigation(broken, engine, new Set(['esiste'])).map((i) => i.message);
    expect(messages.some((m) => m.includes('duplicato'))).toBe(true);
    expect(messages.some((m) => m.includes('schermata inesistente'))).toBe(true);
    expect(messages.some((m) => m.includes('predefinita inesistente'))).toBe(true);
    expect(messages.some((m) => m.includes('espressione non valida'))).toBe(true);
  });
});

describe('NavigationRuntime: etichette tradotte', () => {
  it('valuta t() nelle etichette e segue il cambio di lingua', () => {
    const i18n = new I18n();
    i18n.addMessages('it', { 'nav.a': 'Alfa' });
    i18n.addMessages('en', { 'nav.a': 'Alpha' });
    const def: NavigationDefinition = {
      schemaVersion: '1.0',
      navigation: 'n',
      areas: [{ id: 'u', label: "{{ t('nav.u', 'Caso') }}", items: [{ id: 'a', label: "{{ t('nav.a', 'A') }}", screen: 's' }] }],
    };
    const nav = new NavigationRuntime(def, {
      authorization: { can: () => true } as Authorization,
      userProvider: { user: () => ({}) } as UserProvider,
      i18n,
    });
    expect(nav.areas()[0].label).toBe('Caso');
    expect(nav.areas()[0].items[0].label).toBe('Alfa');
    i18n.setLocale('en');
    expect(nav.areas()[0].items[0].label).toBe('Alpha');
    expect(nav.trail('u', 's')).toEqual(['Caso', 'Alpha']);
  });
});
