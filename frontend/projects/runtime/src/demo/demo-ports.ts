import { Injectable, inject, signal } from '@angular/core';
import { Authorization, DataClient, RuntimeDiagnostics, UserProvider, type DataRequest, type DataRequestOptions } from 'core';
import { DemoBackend } from './demo-backend';

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

/** Velocità della rete simulata nella demo: ritardo di ogni risposta in millisecondi. */
export const NETWORK_SPEEDS = { normale: 200, lenta: 1500, moltoLenta: 9000 } as const;
export type NetworkSpeed = keyof typeof NETWORK_SPEEDS;
const NETWORK_KEY = 'lc.demo.rete';

/**
 * Rete simulata della demo: con «lenta» e «molto lenta» si vedono gli indicatori di attività (e, oltre otto secondi,
 * il messaggio «Ci vuole più del solito…»). Vale per la scheda del browser (sessionStorage), poi torna normale.
 */
@Injectable({ providedIn: 'root' })
export class DemoNetwork {
  readonly speed = signal<NetworkSpeed>(DemoNetwork.stored());

  set(speed: NetworkSpeed): void {
    this.speed.set(speed);
    try {
      sessionStorage.setItem(NETWORK_KEY, speed);
    } catch {
      // Memoria della sessione non disponibile: vale solo fino al ricaricamento.
    }
  }

  latency(): number {
    return NETWORK_SPEEDS[this.speed()];
  }

  private static stored(): NetworkSpeed {
    try {
      const value = sessionStorage.getItem(NETWORK_KEY);
      return value && value in NETWORK_SPEEDS ? (value as NetworkSpeed) : 'normale';
    } catch {
      return 'normale';
    }
  }
}

/** DataClient della demo senza servizi: il backend in memoria nel browser, con il ritardo della rete simulata. */
@Injectable({ providedIn: 'root' })
export class MockDataClient extends DataClient {
  static readonly PAGE_SIZE = DemoBackend.PAGE_SIZE;
  private readonly backend = new DemoBackend();
  private readonly network = inject(DemoNetwork);

  async request(req: DataRequest, options: DataRequestOptions = {}): Promise<unknown> {
    await new Promise((resolve) => setTimeout(resolve, this.network.latency()));
    // Come una rete vera: una lettura annullata durante l'attesa non arriva al backend.
    if (options.signal?.aborted) throw new DOMException('Richiesta annullata', 'AbortError');
    return this.backend.handle(req);
  }
}
