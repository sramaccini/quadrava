import { Injectable, signal } from '@angular/core';
import { Authorization, DataClient, Notifier, RuntimeDiagnostics, ScreenNavigator, UserProvider, type DataRequest } from 'core';

/** Profili della demo: i permessi sono quelli che in produzione darebbe il servizio di autorizzazione. */
export const DEMO_PROFILES: Record<string, string[]> = {
  operatore: ['ordini.leggi'],
  responsabile: ['ordini.leggi', 'ordini.approva', 'ordini.scrivi'],
  amministratore: ['ordini.leggi', 'ordini.approva', 'ordini.scrivi', 'ordini.iban.leggi', 'ordini.iban.scrivi'],
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

export interface Toast {
  id: number;
  message: string;
  kind: 'info' | 'error';
}

@Injectable({ providedIn: 'root' })
export class DemoNotifier extends Notifier {
  readonly toasts = signal<Toast[]>([]);
  private next = 1;

  toast(message: string, kind: 'info' | 'error' = 'info'): void {
    const id = this.next++;
    this.toasts.update((all) => [...all, { id, message, kind }]);
    setTimeout(() => this.toasts.update((all) => all.filter((t) => t.id !== id)), 4000);
  }
}

@Injectable({ providedIn: 'root' })
export class DemoNavigator extends ScreenNavigator {
  readonly target = signal<{ screen: string; params: Record<string, unknown> }>({ screen: 'ordini-elenco', params: {} });

  navigate(screen: string, params: Record<string, unknown>): void {
    this.target.set({ screen, params });
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
    throw new Error(`404 ${req.method} ${req.url}`);
  }

  private view(o: Order): Record<string, unknown> {
    return { ...o, _perm: { update: o.stato !== 'approvato' } };
  }
}
