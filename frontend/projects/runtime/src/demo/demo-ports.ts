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

  override can(permission: string): boolean {
    return (DEMO_PROFILES[this.username()] ?? []).includes(permission);
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

interface Invoice { id: number; numero: string; cliente: string; tipo: string; importo: number; stato: 'bozza' | 'inviata' | 'pagata'; emessa: string; incassata: boolean }
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
  }));
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
      const filtered = this.orders.filter((o) => !stato || o.stato === stato);
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
      const stato = req.query?.['stato'];
      return this.page(this.invoices.filter((f) => !stato || f.stato === stato).map((f) => ({ ...f })), req.query);
    }
    if (path === '/api/fatture' && req.method === 'POST') {
      const body = req.body ?? {};
      if (!body['numero'] || !body['cliente']) throw new Error('400');
      const id = Math.max(...this.invoices.map((f) => f.id)) + 1;
      this.invoices.unshift({ id, numero: String(body['numero']), cliente: String(body['cliente']), tipo: String(body['tipo'] ?? 'attiva'), importo: Number(body['importo'] ?? 0), stato: 'bozza', emessa: '2026-10-07', incassata: false });
      return { id };
    }
    const send = /^\/api\/fatture\/(\d+)\/invia$/.exec(path);
    if (send && req.method === 'POST') {
      const invoice = this.invoices.find((f) => f.id === Number(send[1]));
      if (!invoice || invoice.stato !== 'bozza') throw new Error('409');
      invoice.stato = 'inviata';
      return {};
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
