import type { FormNode } from 'schema';
import type { ScreenRuntime } from './screen-runtime';
import type { HttpMethod, Scope } from './types';

/*
 * Ports (interfaces towards the outside). The core knows nothing of HTTP, router, notifications or authentication:
 * the host application provides the implementations (real ones in the `services` library; fake ones in the demo and in tests).
 */

/** Source of the current user's permissions. The application is never the enforcement point: the back end checks again. */
export abstract class Authorization {
  abstract can(permission: string): boolean;
}

/** Data of the current user exposed to expressions as `user`. */
export abstract class UserProvider {
  abstract user(): Record<string, unknown>;
}

export interface DataRequest {
  method: HttpMethod;
  /** Relative URL, already resolved and with encoded values. */
  url: string;
  /** Query parameters (GET and DELETE). */
  query?: Record<string, unknown>;
  /** Body (POST, PUT, PATCH). */
  body?: Record<string, unknown>;
  /**
   * File to send together with the body in a multipart request: the client puts the file in the `field` part and every
   * entry of the body in a text part (objects as JSON).
   */
  file?: { field: string; name: string; type: string; blob: Blob };
}

/** Runs the REST calls. It must throw an error if the response is not successful. */
export abstract class DataClient {
  /**
   * `options.signal`: cancellation of an outdated read (the resolved request changed before the response). Whoever
   * honours it interrupts the call and rejects the promise; whoever ignores it just makes one more call, whose response the
   * runtime discards anyway.
   */
  abstract request(request: DataRequest, options?: DataRequestOptions): Promise<unknown>;
}

export interface DataRequestOptions {
  signal?: AbortSignal;
  /** Name of the data source: in traces it appears instead of the URL, which can contain data values. */
  source?: string;
  /** Span of the action or of the screen opening the call starts from: the HTTP span becomes its child. */
  trace?: SpanContext;
}

/** Screen change. */
export abstract class ScreenNavigator {
  abstract navigate(screen: string, params: Record<string, unknown>): void;
}

/** Messages to the user. */
export abstract class Notifier {
  abstract toast(message: string, kind?: 'info' | 'error'): void;
}

/** Receiver of the technical reports (expression and action errors). It never receives data values. */
export abstract class RuntimeDiagnostics {
  abstract report(event: { screen: string; source: string; error: string }): void;
}

/** Identity of a span (W3C Trace Context): `traceId` of 32 hex digits, `spanId` of 16. */
export interface SpanContext {
  traceId: string;
  spanId: string;
  /** Sampled trace: successful spans are sent only if true, failed ones always. */
  sampled: boolean;
}

/** Attributes of a span. Only names and codes from the definition or the protocol, never data values. */
export type SpanAttributes = Record<string, string | number | boolean>;

/** Open span: it is closed once with its outcome; later closings do nothing. */
export interface TraceSpan {
  readonly context: SpanContext;
  end(ok: boolean, attributes?: SpanAttributes): void;
}

/**
 * Receiver of the traces: screen opening, action, HTTP call. Optional: if missing nothing is traced.
 * It must never throw.
 */
export abstract class RuntimeTracer {
  abstract start(name: string, attributes: SpanAttributes, parent?: SpanContext): TraceSpan;
}

/** Asks the user to confirm before a sensitive action. Resolves true only if the user explicitly confirms. */
export abstract class Confirmation {
  abstract confirm(message: string): Promise<boolean>;
}

/** Request for a window with a form: the form (with the submit action) and the point of the screen it starts from. */
export interface FormDialogRequest {
  /** Title already resolved, to show as text. */
  title: string;
  form: FormNode;
  runtime: ScreenRuntime;
  scope: Scope;
}

/** Window with a form. Resolves true if the user submitted and the submit steps succeeded, false if they cancelled. */
export abstract class FormDialog {
  abstract open(request: FormDialogRequest): Promise<boolean>;
}

/**
 * Source of the definitions: screens, navigation and themes. In production the registry (the documents published in an
 * environment), in the demo the example files. It returns the JSON as it is: whoever uses it validates it. It throws
 * if the document is not there or cannot be loaded; the error has `status` (HTTP code, 0 if the source does not answer)
 * when the source knows it, so whoever shows the error can tell a missing document from a failure.
 */
export abstract class DefinitionSource {
  abstract screen(id: string): Promise<unknown>;
  abstract navigation(): Promise<unknown>;
  abstract theme(id: string): Promise<unknown>;
  /** Themes the user can choose from; the first one is the initial one. */
  abstract themes(): string[];
  /** Translation catalogue of one language: a key → text object. */
  abstract messages(locale: string): Promise<unknown>;
}
