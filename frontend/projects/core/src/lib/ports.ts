import type { FormNode } from 'schema';
import type { ScreenRuntime } from './screen-runtime';
import type { HttpMethod, Scope } from './types';

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
  /**
   * File da inviare insieme al corpo in una richiesta multipart: il client mette il file nella parte `field` e ogni
   * voce del corpo in una parte di testo (gli oggetti come JSON).
   */
  file?: { field: string; name: string; type: string; blob: Blob };
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

/** Chiede conferma all'utente prima di un'azione delicata. Risolve true solo se l'utente conferma esplicitamente. */
export abstract class Confirmation {
  abstract confirm(message: string): Promise<boolean>;
}

/** Richiesta di una finestra con un form: il form (con l'azione di invio) e il punto della schermata da cui parte. */
export interface FormDialogRequest {
  /** Titolo già risolto, da mostrare come testo. */
  title: string;
  form: FormNode;
  runtime: ScreenRuntime;
  scope: Scope;
}

/** Finestra con un form. Risolve true se l'utente ha inviato e i passi di invio sono riusciti, false se ha annullato. */
export abstract class FormDialog {
  abstract open(request: FormDialogRequest): Promise<boolean>;
}
