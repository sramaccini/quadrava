import type { DataRequest } from 'core';
import { movementArchive, searchMovements } from './demo-search';

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

/**
 * Backend della demo, in memoria: stessa forma delle risposte REST attese dal catalogo (items/total/size, _perm).
 * Non dipende da Angular: lo usa il browser (MockDataClient, demo senza servizi) e il server di esempio
 * (tools/demo-api.mjs, dietro il BFF). Un errore si segnala lanciando `Error('<stato HTTP>')`; una richiesta che non
 * corrisponde a nulla restituisce `undefined` (404 per il server).
 */
export class DemoBackend {
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
  private reports = 0;
  /** Attività del kanban della vetrina: lo stato cambia con /api/attivita/{id}/sposta. */
  private readonly tasks: { id: number; titolo: string; chi: string; stato: string }[] = [
    { id: 1, titolo: 'Preventivo Rossi Srl', chi: 'Anna', stato: 'da-fare' },
    { id: 2, titolo: 'Contratto Bianchi SpA', chi: 'Luca', stato: 'da-fare' },
    { id: 3, titolo: 'Fattura FT-2026-012', chi: 'Anna', stato: 'in-corso' },
    { id: 4, titolo: 'Sollecito Verdi & C.', chi: 'Marta', stato: 'in-corso' },
    { id: 5, titolo: 'Ordine 1001 spedito', chi: 'Luca', stato: 'fatto' },
  ];
  /** Movimenti per la datatable: 60 righe deterministiche su tre conti e sei categorie, da luglio a ottobre 2026. */
  private readonly movements = Array.from({ length: 60 }, (_, i) => {
    const categorie = ['Affitti', 'Utenze', 'Stipendi', 'Incassi clienti', 'Fornitori', 'Spese varie'];
    const categoria = categorie[(i * 7) % categorie.length];
    const entrata = categoria === 'Incassi clienti';
    const base = { Affitti: 1800, Utenze: 240, Stipendi: 3100, 'Incassi clienti': 2600, Fornitori: 950, 'Spese varie': 75 }[categoria] ?? 100;
    const importo = Math.round((base + ((i * 37) % 11) * (base / 20)) * 100) / 100;
    const mese = 7 + (i % 4);
    const giorno = 1 + ((i * 5) % 27);
    return {
      id: 1000 + i,
      data: `2026-${String(mese).padStart(2, '0')}-${String(giorno).padStart(2, '0')}`,
      conto: ['Banca Intesa', 'Banca Sella', 'Cassa'][i % 3 === 2 && categoria !== 'Spese varie' ? 0 : i % 3],
      categoria,
      descrizione: `${categoria} ${['luglio', 'agosto', 'settembre', 'ottobre'][mese - 7]} n. ${i + 1}`,
      importo: entrata ? importo : -importo,
      stato: i % 9 === 4 ? 'da-verificare' : 'registrato',
    };
  });
  private readonly contacts: { id: number; nome: string; email: string; ruolo: string }[] = [
    { id: 1, nome: 'Anna Conti', email: 'anna.conti@example.com', ruolo: 'acquisti' },
    { id: 2, nome: 'Luca Fabbri', email: 'luca.fabbri@example.com', ruolo: 'amministrazione' },
  ];
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

  async handle(req: DataRequest): Promise<unknown> {
    const path = req.url.split('?')[0];

    if (req.method === 'GET' && path === '/api/ordini') {
      const stato = req.query?.['stato'];
      const page = Number(req.query?.['page'] ?? 0);
      const filtered = sortBy(this.orders.filter((o) => !stato || o.stato === stato), req.query);
      const size = DemoBackend.PAGE_SIZE;
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
    // Una segnalazione restituisce il suo protocollo (i passi seguenti lo leggono con `as`).
    if (path === '/api/vetrina/segnala' && req.method === 'POST') return { protocollo: `PR-${String(++this.reports).padStart(4, '0')}`, ricevuta: true };
    // Sempre in conflitto: per provare onError con error.status.
    if (path === '/api/vetrina/conflitto' && req.method === 'POST') throw new Error('409');
    if (path === '/api/vetrina/errore') throw new Error('500');
    const other = this.handleBilling(req, path);
    if (other !== undefined) return other;
    throw new Error(`404 ${req.method} ${req.url}`);
  }

  private page<T>(rows: T[], query: DataRequest['query']): { items: T[]; total: number; size: number } {
    const size = DemoBackend.PAGE_SIZE;
    const page = Number(query?.['page'] ?? 0);
    return { items: rows.slice(page * size, page * size + size), total: rows.length, size };
  }

  /** Fatture, pacchetti e spese: i dati delle aree di esempio. */
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
    if (path === '/api/scadenze' && req.method === 'GET') {
      // Scadenze finte per qualunque mese AAAA-MM: sempre gli stessi giorni, con stati diversi.
      const mese = String(req.query?.['mese'] ?? '');
      if (!/^\d{4}-\d{2}$/.test(mese)) return [];
      const voci: [number, string, string][] = [
        [3, 'Affitto ufficio', 'pagata'], [8, 'F24 contributi', 'da-pagare'], [8, 'Fornitore Bruni', 'scaduta'], [8, 'Leasing auto', 'da-pagare'],
        [8, 'Assicurazione', 'pagata'], [12, 'Utenze', 'da-pagare'], [15, 'Stipendi', 'da-pagare'], [22, 'Fornitore Colombo', 'scaduta'], [28, 'IVA trimestrale', 'da-pagare'],
      ];
      return voci.map(([giorno, titolo, stato], i) => ({ id: i + 1, data: `${mese}-${String(giorno).padStart(2, '0')}`, titolo, stato, importo: 150 + i * 220 }));
    }
    if (path === '/api/categorie' && req.method === 'GET') {
      const leaf = (id: string, nome: string, voci: number): Record<string, unknown> => ({ id, nome, voci, figli: [] });
      return [
        { id: 'acq', nome: 'Acquisti', voci: 42, figli: [leaf('acq-can', 'Cancelleria', 12), leaf('acq-inf', 'Informatica', 18), leaf('acq-arr', 'Arredi', 12)] },
        { id: 'ser', nome: 'Servizi', voci: 27, figli: [leaf('ser-con', 'Consulenze', 9), { id: 'ser-man', nome: 'Manutenzione', voci: 18, figli: [leaf('ser-man-imp', 'Impianti', 11), leaf('ser-man-edi', 'Edifici', 7)] }] },
        { id: 'per', nome: 'Personale', voci: 35, figli: [{ id: 'per-tra', nome: 'Trasferte', voci: 25, figli: [leaf('per-tra-tre', 'Treni', 10), leaf('per-tra-hot', 'Hotel', 15)] }, leaf('per-for', 'Formazione', 10)] },
      ];
    }
    if (path === '/api/movimenti/ricerca' && req.method === 'POST') return searchMovements(movementArchive(), req.body);
    const verify = /^\/api\/movimenti\/(\d+)\/verifica$/.exec(path);
    if (verify && req.method === 'POST') {
      const row = movementArchive().find((m) => m['id'] === Number(verify[1]));
      if (!row) throw new Error('404');
      row['stato'] = 'registrato';
      return {};
    }
    if (path === '/api/movimenti' && req.method === 'GET') {
      // Con quanti=N (fino a 50.000) un archivio sintetico più grande, per provare la datatable con molti dati.
      const quanti = Math.min(50000, Number(req.query?.['quanti'] ?? 0));
      if (quanti > 0) return Array.from({ length: quanti }, (_, i) => ({ ...this.movements[i % this.movements.length], id: 100000 + i, descrizione: `Movimento ${i + 1}` }));
      return this.movements.map((m) => ({ ...m }));
    }
    if (path === '/api/vendite-mensili' && req.method === 'GET') {
      // Dodici mesi del 2026 con un andamento stagionale riconoscibile.
      return Array.from({ length: 12 }, (_, i) => {
        const attive = 9000 + Math.round(4000 * Math.sin((i + 1) / 2)) + i * 600;
        const passive = 6000 + Math.round(2500 * Math.cos(i / 2)) + i * 300;
        // Margine in punti percentuali, con una cifra decimale.
        return { mese: `2026-${String(i + 1).padStart(2, '0')}`, attive, passive, margine: Math.round(((attive - passive) / attive) * 1000) / 10 };
      });
    }
    if (path === '/api/fatture-per-stato' && req.method === 'GET') {
      const count = (stato: string): number => this.invoices.filter((f) => f.stato === stato).length;
      return ['bozza', 'inviata', 'pagata'].map((stato) => ({ stato, numero: count(stato) }));
    }
    if (path === '/api/riepilogo' && req.method === 'GET') {
      const attive = this.invoices.filter((f) => f.tipo === 'attiva');
      const sum = (rows: Invoice[]): number => rows.reduce((t, f) => t + f.importo, 0);
      return {
        fatturato: sum(attive),
        daIncassare: sum(attive.filter((f) => f.stato === 'inviata')),
        aperte: this.invoices.filter((f) => f.stato !== 'pagata').length,
        totale: this.invoices.length,
        clienti: new Set(this.invoices.map((f) => f.cliente)).size,
        crescita: 12.5,
      };
    }
    if (path === '/api/articoli' && req.method === 'GET') {
      const articoli = [
        ['CAR-A4', 'Risma carta A4'], ['CAR-A3', 'Risma carta A3'], ['GRA-01', 'Graffette'], ['PEN-BL', 'Penne blu'], ['PEN-RO', 'Penne rosse'],
        ['MAT-HB', 'Matite HB'], ['EVI-GI', 'Evidenziatori gialli'], ['CAR-RA', 'Raccoglitori ad anelli'], ['TON-01', 'Toner stampante'], ['BUS-A4', 'Buste A4'],
      ].map(([codice, nome]) => ({ codice, nome }));
      const id = req.query?.['id'];
      if (id !== undefined) return articoli.filter((a) => a.codice === id);
      const q = String(req.query?.['q'] ?? '').toLowerCase();
      return articoli.filter((a) => !q || a.nome.toLowerCase().includes(q)).slice(0, 6);
    }
    if (path === '/api/contatti' && req.method === 'GET') return this.contacts.map((c) => ({ ...c }));
    if (path === '/api/contatti' && req.method === 'POST') {
      const body = req.body ?? {};
      if (!body['nome'] || !String(body['email'] ?? '').includes('@')) throw new Error('400');
      const id = Math.max(0, ...this.contacts.map((c) => c.id)) + 1;
      this.contacts.push({ id, nome: String(body['nome']), email: String(body['email']), ruolo: String(body['ruolo'] ?? 'acquisti') });
      return { id };
    }
    const contact = /^\/api\/contatti\/(\d+)$/.exec(path);
    if (contact && req.method === 'PUT') {
      const found = this.contacts.find((c) => c.id === Number(contact[1]));
      const body = req.body ?? {};
      if (!found || !body['nome'] || !String(body['email'] ?? '').includes('@')) throw new Error('400');
      Object.assign(found, { nome: String(body['nome']), email: String(body['email']), ruolo: String(body['ruolo'] ?? found.ruolo) });
      return { ...found };
    }
    if (path === '/api/allegati' && req.method === 'POST') {
      // Un vero servizio salverebbe il file; qui basta verificare che sia arrivato (come file o in base64) e rispondere con un id.
      if (req.file) {
        if (!(req.file.blob instanceof Blob) || req.file.blob.size !== req.body?.['size']) throw new Error('400');
      } else {
        const content = req.body?.['content'];
        if (typeof content !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(content)) throw new Error('400');
      }
      this.attachments += 1;
      return { id: this.attachments };
    }
    if (path === '/api/attivita' && req.method === 'GET') return this.tasks.map((t) => ({ ...t }));
    if (path === '/api/menu/contatori' && req.method === 'GET') {
      // Contatori del menu: fatture in bozza, spese da revisionare, attività non concluse.
      return {
        bozze: this.invoices.filter((f) => f.stato === 'bozza').length,
        'da-revisionare': this.expenses.filter((s) => s.stato === 'da-revisionare').length,
        'vetrina-attivita': this.tasks.filter((t) => t.stato !== 'fatto').length,
      };
    }
    const move = /^\/api\/attivita\/(\d+)\/sposta$/.exec(path);
    if (move && req.method === 'POST') {
      const task = this.tasks.find((t) => t.id === Number(move[1]));
      const stato = req.body?.['stato'];
      if (!task) throw new Error('404');
      if (typeof stato !== 'string' || !['da-fare', 'in-corso', 'fatto'].includes(stato)) throw new Error('400');
      task.stato = stato;
      return {};
    }
    if (path === '/api/eventi' && req.method === 'GET') {
      return [
        { data: '2026-10-01T09:15', titolo: 'Ordine 1001 ricevuto', nota: 'Dal portale clienti', esito: 'ok' },
        { data: '2026-10-02T11:40', titolo: 'Ordine 1001 approvato', nota: 'Da Luca, responsabile', esito: 'ok' },
        { data: '2026-10-03T16:05', titolo: 'Spedizione in ritardo', nota: 'Il corriere segnala un giorno di ritardo', esito: 'ko' },
        { data: '2026-10-05T10:00', titolo: 'Ordine 1001 consegnato', esito: 'ok' },
      ];
    }
    if (path === '/api/clienti' && req.method === 'GET') {
      // Ricerca senza distinzione tra maiuscole e minuscole su nome e città; al massimo 8 risultati.
      // Con id: la riga di quel cliente (per mostrare il testo di un valore già scelto).
      const id = req.query?.['id'];
      if (id !== undefined) return this.clients.filter((c) => String(c.id) === String(id));
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
