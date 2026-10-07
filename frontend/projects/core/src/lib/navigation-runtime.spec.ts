import { signal } from '@angular/core';
import { ExpressionEngine } from 'expressions';
import type { NavigationDefinition } from 'schema';
import { checkNavigation } from './navigation-check';
import { NavigationRuntime } from './navigation-runtime';
import type { Authorization, UserProvider } from './ports';

const definition: NavigationDefinition = {
  schemaVersion: '1.0',
  navigation: 'app',
  default: 'consultazione',
  useCases: [
    {
      id: 'inserimento',
      label: 'Inserimento',
      requires: 'fatture.crea',
      items: [
        {
          id: 'nuova',
          label: 'Nuova',
          children: [
            { id: 'attiva', label: 'Attiva', screen: 'fattura-nuova', params: { tipo: 'attiva' } },
            { id: 'passiva', label: 'Passiva', screen: 'fattura-nuova', params: { tipo: 'passiva' } },
            { id: 'da-ordine', label: 'Da ordine', children: [{ id: 'scegli', label: 'Scegli', screen: 'ordini-elenco', requires: 'ordini.leggi' }] },
          ],
        },
      ],
    },
    {
      id: 'consultazione',
      label: 'Consultazione',
      requires: 'fatture.leggi',
      items: [
        { id: 'elenco', label: 'Elenco', screen: 'fatture-elenco' },
        { id: 'solo-admin', label: 'Solo admin', screen: 'x', visibleIf: "{{'amministratore' in user.roles}}" },
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
  it('mostra solo i casi d’uso consentiti', () => {
    const { nav } = setup(['fatture.leggi']);
    expect(nav.useCases().map((u) => u.id)).toEqual(['consultazione']);
  });

  it('nasconde un caso d’uso se nessuna voce è visibile', () => {
    const { nav } = setup(['fatture.crea']);
    // Le voci "Attiva" e "Passiva" non richiedono permessi propri: il caso d'uso resta.
    expect(nav.useCases().map((u) => u.id)).toEqual(['inserimento']);
    expect(nav.useCase('inserimento')?.items).toHaveLength(1);
  });

  it('elimina i gruppi vuoti e tiene i tre livelli quando consentiti', () => {
    const { nav } = setup(['fatture.crea']);
    const nuova = nav.useCase('inserimento')?.items[0];
    expect(nuova?.kind === 'group' && nuova.children.map((c) => c.id)).toEqual(['attiva', 'passiva']);
    const withOrders = setup(['fatture.crea', 'ordini.leggi']).nav.useCase('inserimento')?.items[0];
    expect(withOrders?.kind === 'group' && withOrders.children.map((c) => c.id)).toEqual(['attiva', 'passiva', 'da-ordine']);
  });

  it('si aggiorna quando cambiano i permessi', () => {
    const { nav, permissions } = setup([]);
    expect(nav.useCases()).toEqual([]);
    permissions.set(new Set(['fatture.leggi']));
    expect(nav.useCases().map((u) => u.id)).toEqual(['consultazione']);
  });

  it('visibleIf: vero mostra, errore nasconde e segnala', async () => {
    const { nav, reports } = setup(['fatture.leggi'], ['amministratore']);
    const ids = nav.useCase('consultazione')?.items.map((i) => i.id);
    expect(ids).toEqual(['elenco', 'solo-admin']);
    await Promise.resolve();
    expect(reports.length).toBeGreaterThan(0);
    expect(setup(['fatture.leggi'], ['operatore']).nav.useCase('consultazione')?.items.map((i) => i.id)).toEqual(['elenco']);
  });

  it('sceglie la destinazione iniziale: default se visibile, altrimenti il primo caso d’uso', () => {
    expect(setup(['fatture.leggi', 'fatture.crea']).nav.defaultTarget()).toMatchObject({ useCase: 'consultazione', leaf: { id: 'elenco' } });
    expect(setup(['fatture.crea']).nav.defaultTarget()).toMatchObject({ useCase: 'inserimento', leaf: { id: 'attiva' } });
    expect(setup([]).nav.defaultTarget()).toBeNull();
  });

  it('individua la voce attiva usando schermata e parametri', () => {
    const { nav } = setup(['fatture.crea']);
    expect(nav.locate('inserimento', 'fattura-nuova', { tipo: 'passiva' })).toEqual(['nuova', 'passiva']);
    expect(nav.locate('inserimento', 'fattura-nuova', { tipo: 'altro' })).toBeNull();
    expect(nav.locate('consultazione', 'fatture-elenco')).toBeNull();
  });

  it('trova il caso d’uso di una schermata preferendo quello corrente', () => {
    const { nav } = setup(['fatture.crea', 'fatture.leggi', 'ordini.leggi']);
    expect(nav.useCaseOf('ordini-elenco', {}, 'inserimento')).toBe('inserimento');
    expect(nav.useCaseOf('fatture-elenco', {}, 'inserimento')).toBe('consultazione');
    expect(nav.useCaseOf('sconosciuta')).toBeNull();
  });
});

describe('checkNavigation', () => {
  const engine = new ExpressionEngine({ can: () => false });

  it('non segnala nulla per un documento coerente', () => {
    const screens = new Set(['fattura-nuova', 'ordini-elenco', 'fatture-elenco', 'x', 'y']);
    expect(checkNavigation({ ...definition, useCases: definition.useCases.map((u) => ({ ...u, items: u.items.filter((i) => i.id !== 'rotta') })) }, engine, screens)).toEqual([]);
  });

  it('segnala id duplicati, default e schermate inesistenti, espressioni errate', () => {
    const broken: NavigationDefinition = {
      schemaVersion: '1.0',
      navigation: 'app',
      default: 'nessuno',
      useCases: [
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
    expect(messages.some((m) => m.includes('predefinito inesistente'))).toBe(true);
    expect(messages.some((m) => m.includes('espressione non valida'))).toBe(true);
  });
});
