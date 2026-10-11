import { Injectable, signal } from '@angular/core';
import { Authorization, DataClient, RuntimeDiagnostics, UserProvider, type DataRequest } from 'core';

/** Profili della demo: i permessi sono quelli che in produzione darebbe il servizio di autorizzazione. */
export const DEMO_PROFILES: Record<string, string[]> = {
  // Inserisce e consulta fatture e vede gli ordini: due casi d'uso.
  operatore: ['vetrina.componenti.leggi', 'fatture.fattura.leggi', 'fatture.fattura.crea', 'ordini.ordine.leggi'],
  // Aggiunge pacchetti, revisione spese e approvazione ordini: tutti e quattro i casi d'uso.
  responsabile: ['vetrina.componenti.leggi', 'fatture.fattura.leggi', 'fatture.fattura.crea', 'ordini.ordine.leggi', 'ordini.ordine.approva', 'ordini.ordine.scrivi', 'pacchetti.pacchetto.leggi', 'pacchetti.pacchetto.crea', 'spese.spesa.leggi', 'spese.spesa.revisiona'],
  amministratore: [
    'vetrina.componenti.leggi', 'fatture.fattura.leggi', 'fatture.fattura.crea', 'ordini.ordine.leggi', 'ordini.ordine.approva', 'ordini.ordine.scrivi', 'ordini.iban.leggi', 'ordini.iban.scrivi',
    'pacchetti.pacchetto.leggi', 'pacchetti.pacchetto.crea', 'spese.spesa.leggi', 'spese.spesa.revisiona',
  ],
};

/** Autorizzazione finta, basata su signal: cambiando profilo la schermata si ridisegna. */
@Injectable({ providedIn: 'root' })
export class DemoSession extends Authorization implements UserProvider {
  readonly username = signal('operatore');
  /** Falso dopo l'uscita: nessun permesso finché non si accede di nuovo. */
  readonly loggedIn = signal(true);

  logout(): void {
    this.loggedIn.set(false);
  }

  login(): void {
    this.loggedIn.set(true);
  }

  override can(permission: string): boolean {
    return this.loggedIn() && (DEMO_PROFILES[this.username()] ?? []).includes(permission);
  }

  user(): Record<string, unknown> {
    return { username: this.username(), roles: [this.username()] };
  }
}

@Injectable({ providedIn: 'root' })
export class DemoDiagnostics extends RuntimeDiagnostics {
  readonly events = signal<{ screen: string; source: string; error: string }[]>([]);

  report(event: { screen: string; source: string; error: string }): void {
    console.warn('[lowcode]', event.screen, event.source, event.error);
    this.events.update((all) => [...all.slice(-49), event]);
  }
}

interface Invoice { id: number; numero: string; cliente: string; tipo: string; importo: number; stato: 'bozza' | 'inviata' | 'pagata'; emessa: string; incassata: boolean; righe: number; aliquota: number }
interface Package { id: number; nome: string; descrizione: string; creato: string }
interface Expense { id: number; descrizione: string; dipendente: string; importo: number; stato: 'da-revisionare' | 'approvata' | 'respinta' }

interface Order {
  id: number;
  numero: string;
  cliente: string;
  stato: 'bozza' | 'inviato' | 'approvato';
  tipo: 'privato' | 'business';
  sconto: number;
  iban: string;
}

/** Ordinamento lato server della demo: parametri `sort` (campo) e `dir` (`asc` o `desc`). */
function sortBy<T extends object>(rows: T[], query: DataRequest['query']): T[] {
  const field = query?.['sort'];
  if (typeof field !== 'string' || !field) return rows;
  const sign = query?.['dir'] === 'desc' ? -1 : 1;
  const value = (row: T): unknown => (row as Record<string, unknown>)[field];
  return [...rows].sort((a, b) => {
    const x = value(a);
    const y = value(b);
    return sign * (typeof x === 'number' && typeof y === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? ''), 'it', { numeric: true }));
  });
}

/** Backend finto in memoria: stessa forma delle risposte REST attese dal catalogo (items/total/size, _perm). */
@Injectable({ providedIn: 'root' })
export class MockDataClient extends DataClient {
  static readonly PAGE_SIZE = 8;
  private readonly orders: Order[] = Array.from({ length: 21 }, (_, i) => ({
    id: i + 1,
    numero: `ORD-${String(i + 1).padStart(4, '0')}`,
    cliente: ['Rossi Srl', 'Bianchi SpA', 'Verdi & C.', 'Neri Group'][i % 4],
    stato: (['bozza', 'inviato', 'approvato'] as const)[i % 3],
    tipo: i % 2 ? 'business' : 'privato',
    sconto: i % 2 ? 10 : 0,
    iban: `IT60X0542811101${String(i).padStart(12, '0')}`,
  }));

  private readonly invoices: Invoice[] = Array.from({ length: 14 }, (_, i) => ({
    id: 100 + i,
    numero: `FT-2026-${String(i + 1).padStart(3, '0')}`,
    cliente: ['Rossi Srl', 'Bianchi SpA', 'Verdi & C.', 'Neri Group'][i % 4],
    tipo: i % 3 === 2 ? 'passiva' : 'attiva',
    importo: 250 + i * 135,
    stato: (['bozza', 'inviata', 'pagata'] as const)[i % 3],
    emessa: `2026-09-${String(i + 1).padStart(2, '0')}`,
    incassata: i % 3 === 2,
    righe: 1 + (i % 5),
    aliquota: i % 4 === 3 ? 10 : 22,
  }));
  /** Anagrafica clienti per i campi lookup: si cerca per nome o città. */
  private readonly clients = [
    'Rossi Srl|Milano', 'Bianchi SpA|Torino', 'Verdi & C.|Bologna', 'Neri Group|Roma', 'Rossetti SpA|Firenze', 'Bruni Logistica|Verona',
    'Colombo Impianti|Bergamo', 'Ferrari Ricambi|Modena', 'Esposito Food|Napoli', 'Romano Tessuti|Prato', 'Ricci Consulting|Genova',
    'Marino Edilizia|Bari', 'Greco Trasporti|Palermo', 'Gallo Energia|Padova', 'Conti Software|Trento',
  ].map((entry, i) => ({ id: i + 1, nome: entry.split('|')[0], citta: entry.split('|')[1] }));
  private attachments = 0;
  private readonly packages: Package[] = [
    { id: 1, nome: 'Chiusura settembre', descrizione: 'Fatture attive del mese', creato: '2026-10-01' },
    { id: 2, nome: 'Fornitori Q3', descrizione: 'Fatture passive del trimestre', creato: '2026-09-28' },
  ];
  private readonly expenses: Expense[] = Array.from({ length: 12 }, (_, i) => ({
    id: 500 + i,
    descrizione: ['Treno Milano-Roma', 'Hotel', 'Cena con cliente', 'Taxi', 'Materiale ufficio'][i % 5],
    dipendente: ['M. Conti', 'L. Fabbri', 'S. Greco'][i % 3],
    importo: 18 + i * 21,
    stato: (['da-revisionare', 'da-revisionare', 'approvata', 'respinta'] as const)[i % 4],
  }));

  async request(req: DataRequest): Promise<unknown> {
    await new Promise((resolve) => setTimeout(resolve, 200));
    const path = req.url.split('?')[0];

    if (req.method === 'GET' && path === '/api/ordini') {
      const stato = req.query?.['stato'];
      const page = Number(req.query?.['page'] ?? 0);
      const filtered = sortBy(this.orders.filter((o) => !stato || o.stato === stato), req.query);
      const size = MockDataClient.PAGE_SIZE;
      return { items: filtered.slice(page * size, page * size + size).map((o) => this.view(o)), total: filtered.length, size };
    }
    const detail = /^\/api\/ordini\/(\d+)$/.exec(path);
    if (detail) {
      const order = this.orders.find((o) => o.id === Number(detail[1]));
      if (!order) throw new Error('404');
      if (req.method === 'GET') return this.view(order);
      if (req.method === 'PUT') {
        const body = req.body ?? {};
        Object.assign(order, { cliente: body['cliente'] ?? order.cliente, tipo: body['tipo'] ?? order.tipo, sconto: body['sconto'] ?? order.sconto });
        return this.view(order);
      }
    }
    const approva = /^\/api\/ordini\/(\d+)\/approva$/.exec(path);
    if (approva && req.method === 'POST') {
      const order = this.orders.find((o) => o.id === Number(approva[1]));
      if (!order || order.stato !== 'inviato') throw new Error('409');
      order.stato = 'approvato';
      return {};
    }
    if (path === '/api/vetrina/segnala' && req.method === 'POST') return {};
    if (path === '/api/vetrina/errore') throw new Error('500');
    const other = this.handleBilling(req, path);
    if (other !== undefined) return other;
    throw new Error(`404 ${req.method} ${req.url}`);
  }

  private page<T>(rows: T[], query: DataRequest['query']): { items: T[]; total: number; size: number } {
    const size = MockDataClient.PAGE_SIZE;
    const page = Number(query?.['page'] ?? 0);
    return { items: rows.slice(page * size, page * size + size), total: rows.length, size };
  }

  /** Fatture, pacchetti e spese: i dati dei casi d'uso di esempio. */
  private handleBilling(req: DataRequest, path: string): unknown {
    if (path === '/api/fatture' && req.method === 'GET') {
      // stato: un valore o un elenco (selezione multipla); tipo: attiva o passiva.
      const stato = req.query?.['stato'];
      const stati = Array.isArray(stato) ? stato : stato ? [stato] : [];
      const tipo = req.query?.['tipo'];
      const cliente = req.query?.['cliente'];
      const match = (f: Invoice): boolean => (stati.length === 0 || stati.includes(f.stato)) && (!tipo || f.tipo === tipo) && (!cliente || f.cliente === cliente);
      return this.page(this.invoices.filter(match).map((f) => ({ ...f })), req.query);
    }
    if (path === '/api/fatture' && req.method === 'POST') {
      const body = req.body ?? {};
      if (!body['numero'] || !body['cliente']) throw new Error('400');
      const id = Math.max(...this.invoices.map((f) => f.id)) + 1;
      this.invoices.unshift({ id, numero: String(body['numero']), cliente: String(body['cliente']), tipo: String(body['tipo'] ?? 'attiva'), importo: Number(body['importo'] ?? 0), stato: 'bozza', emessa: '2026-10-07', incassata: false, righe: 1, aliquota: 22 });
      return { id };
    }
    if (path === '/api/fatture/invia' && req.method === 'POST') {
      const ids = Array.isArray(req.body?.['ids']) ? (req.body['ids'] as unknown[]) : [];
      const drafts = this.invoices.filter((f) => ids.includes(f.id) && f.stato === 'bozza');
      if (drafts.length !== ids.length) throw new Error('409');
      drafts.forEach((f) => (f.stato = 'inviata'));
      return { inviate: drafts.length };
    }
    const send = /^\/api\/fatture\/(\d+)\/invia$/.exec(path);
    if (send && req.method === 'POST') {
      const invoice = this.invoices.find((f) => f.id === Number(send[1]));
      if (!invoice || invoice.stato !== 'bozza') throw new Error('409');
      invoice.stato = 'inviata';
      return {};
    }
    if (path === '/api/allegati' && req.method === 'POST') {
      // Un vero servizio salverebbe il contenuto; qui basta verificare che sia base64 e rispondere con un id.
      const content = req.body?.['content'];
      if (typeof content !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(content)) throw new Error('400');
      this.attachments += 1;
      return { id: this.attachments };
    }
    if (path === '/api/clienti' && req.method === 'GET') {
      // Ricerca senza distinzione tra maiuscole e minuscole su nome e città; al massimo 8 risultati.
      const q = String(req.query?.['q'] ?? '').toLowerCase();
      return this.clients.filter((c) => !q || c.nome.toLowerCase().includes(q) || c.citta.toLowerCase().includes(q)).slice(0, 8);
    }
    if (path === '/api/pacchetti' && req.method === 'GET') return this.packages.map((p) => ({ ...p }));
    if (path === '/api/pacchetti' && req.method === 'POST') {
      const body = req.body ?? {};
      if (!body['nome']) throw new Error('400');
      this.packages.unshift({ id: this.packages.length + 1, nome: String(body['nome']), descrizione: String(body['descrizione'] ?? ''), creato: '2026-10-07' });
      return {};
    }
    if (path === '/api/spese' && req.method === 'GET') {
      const stato = req.query?.['stato'];
      const match = (e: Expense): boolean => !stato || (stato === 'revisionata' ? e.stato !== 'da-revisionare' : e.stato === stato);
      return this.page(this.expenses.filter(match).map((e) => ({ ...e })), req.query);
    }
    const review = /^\/api\/spese\/(\d+)\/revisiona$/.exec(path);
    if (review && req.method === 'POST') {
      const expense = this.expenses.find((e) => e.id === Number(review[1]));
      const esito = req.body?.['esito'];
      if (!expense || expense.stato !== 'da-revisionare' || (esito !== 'approvata' && esito !== 'respinta')) throw new Error('409');
      expense.stato = esito;
      return {};
    }
    return undefined;
  }

  private view(o: Order): Record<string, unknown> {
    return { ...o, _perm: { update: o.stato !== 'approvato' } };
  }
}
