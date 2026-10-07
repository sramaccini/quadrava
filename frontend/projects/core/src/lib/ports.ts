import type { HttpMethod } from './types';

/*
 * Porte (interfacce verso l'esterno). Il core non conosce HTTP, router, notifiche o autenticazione:
 * l'applicazione ospite fornisce le implementazioni (reali, nella libreria `services`; finte, nella demo e nei test).
 */

/** Fonte dei permessi dell'utente corrente. L'applicazione non è mai il punto di enforcement: il backend ricontrolla. */
export abstract class Authorization {
  abstract can(permission: string): boolean;
}

/** Dati dell'utente corrente esposti alle espressioni come `user`. */
export abstract class UserProvider {
  abstract user(): Record<string, unknown>;
}

export interface DataRequest {
  method: HttpMethod;
  /** URL relativo già risolto e con i valori codificati. */
  url: string;
  /** Parametri di query (GET e DELETE). */
  query?: Record<string, unknown>;
  /** Corpo (POST, PUT, PATCH). */
  body?: Record<string, unknown>;
}

/** Esegue le chiamate REST. Deve lanciare un errore se la risposta non è di successo. */
export abstract class DataClient {
  abstract request(request: DataRequest): Promise<unknown>;
}

/** Cambio di schermata. */
export abstract class ScreenNavigator {
  abstract navigate(screen: string, params: Record<string, unknown>): void;
}

/** Messaggi all'utente. */
export abstract class Notifier {
  abstract toast(message: string, kind?: 'info' | 'error'): void;
}

/** Destinatario delle segnalazioni tecniche (errori di espressioni e di azioni). Non riceve mai valori di dati. */
export abstract class RuntimeDiagnostics {
  abstract report(event: { screen: string; source: string; error: string }): void;
}
