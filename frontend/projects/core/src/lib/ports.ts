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
  /**
   * `options.signal`: annullamento di una lettura superata (la richiesta risolta è cambiata prima della risposta). Chi lo
   * rispetta interrompe la chiamata e rifiuta la promessa; chi lo ignora fa solo una chiamata in più, la cui risposta il
   * runtime scarta comunque.
   */
  abstract request(request: DataRequest, options?: DataRequestOptions): Promise<unknown>;
}

export interface DataRequestOptions {
  signal?: AbortSignal;
  /** Nome del data source: nelle tracce compare al posto dell'URL, che può contenere valori di dati. */
  source?: string;
  /** Span dell'azione o dell'apertura di schermata da cui parte la chiamata: lo span HTTP ne diventa figlio. */
  trace?: SpanContext;
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

/** Identità di uno span (W3C Trace Context): `traceId` di 32 cifre esadecimali, `spanId` di 16. */
export interface SpanContext {
  traceId: string;
  spanId: string;
  /** Traccia campionata: gli span riusciti si inviano solo se è vera, quelli in errore sempre. */
  sampled: boolean;
}

/** Attributi di uno span. Solo nomi e codici della definizione o del protocollo, mai valori di dati. */
export type SpanAttributes = Record<string, string | number | boolean>;

/** Span aperto: si chiude una sola volta con l'esito; le chiusure successive non fanno nulla. */
export interface TraceSpan {
  readonly context: SpanContext;
  end(ok: boolean, attributes?: SpanAttributes): void;
}

/**
 * Destinatario delle tracce: apertura di schermata, azione, chiamata HTTP. Facoltativo: se manca non si traccia nulla.
 * Non deve mai lanciare errori.
 */
export abstract class RuntimeTracer {
  abstract start(name: string, attributes: SpanAttributes, parent?: SpanContext): TraceSpan;
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

/**
 * Fonte delle definizioni: schermate, navigazione e temi. In produzione il registro (i documenti pubblicati in un
 * ambiente), nella demo i file degli esempi. Restituisce il JSON così com'è: lo valida chi lo usa. Lancia un errore
 * se il documento non c'è o non si può caricare; l'errore ha `status` (codice HTTP, 0 se la fonte non risponde) quando
 * la fonte lo conosce, così chi mostra l'errore distingue un documento inesistente da un guasto.
 */
export abstract class DefinitionSource {
  abstract screen(id: string): Promise<unknown>;
  abstract navigation(): Promise<unknown>;
  abstract theme(id: string): Promise<unknown>;
  /** Temi tra cui l'utente può scegliere, il primo è quello iniziale. */
  abstract themes(): string[];
  /** Catalogo delle traduzioni di una lingua: un oggetto chiave → testo. */
  abstract messages(locale: string): Promise<unknown>;
}
