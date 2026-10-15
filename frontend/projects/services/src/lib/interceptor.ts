import { HttpContextToken, HttpErrorResponse, HttpEvent, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { Injector, inject } from '@angular/core';
import type { SpanAttributes, SpanContext } from 'core';
import { finalize, tap } from 'rxjs';
import { HttpAuthorization } from './authorization';
import { LOWCODE_SERVICES_CONFIG } from './config';
import { HttpSession } from './session';
import { isSameOriginRelative, traceparent } from './trace';
import { HttpTracer } from './tracer';

/** Contesto di traccia di una richiesta: il data source che la fa e lo span (azione, apertura) da cui parte. */
export const LOWCODE_TRACE = new HttpContextToken<{ source?: string; parent?: SpanContext }>(() => ({}));

/**
 * Per le chiamate alla stessa origine: apre lo span HTTP e ne mette l'identità in `traceparent` (i servizi continuano
 * la stessa traccia), osserva `X-Permissions-Version` (se cambia, ricarica i permessi) e su 401 rimanda al login.
 * Gli invii alla telemetria non si tracciano: genererebbero altri span.
 */
export const lowcodeHttpInterceptor: HttpInterceptorFn = (req, next) => {
  if (!isSameOriginRelative(req.url)) return next(req);
  const injector = inject(Injector);
  const config = injector.get(LOWCODE_SERVICES_CONFIG);
  const untraced = req.headers.has('traceparent') || req.url.startsWith(`${config.telemetryBase}/`);
  const { source, parent } = req.context.get(LOWCODE_TRACE);
  // Per le chiamate dei data source il nome, non l'URL: percorso e query possono contenere valori di dati.
  const attributes: SpanAttributes = source ? { 'http.request.method': req.method, 'lowcode.datasource': source } : { 'http.request.method': req.method, 'url.path': req.url.split(/[?#]/)[0] };
  const span = untraced ? null : injector.get(HttpTracer).start('http.client', attributes, parent, 'client');
  const traced = span ? req.clone({ setHeaders: { traceparent: traceparent(span.context) } }) : req;
  return next(traced).pipe(
    tap({
      next: (event: HttpEvent<unknown>) => {
        if (event instanceof HttpResponse) {
          span?.end(true, { 'http.response.status_code': event.status });
          const version = event.headers.get('X-Permissions-Version');
          if (version) injector.get(HttpAuthorization).observeVersion(version);
        }
      },
      error: (error: unknown) => {
        span?.end(false, { 'http.response.status_code': error instanceof HttpErrorResponse ? error.status : 0 });
        if (error instanceof HttpErrorResponse && error.status === 401) injector.get(HttpSession).markExpired();
      },
    }),
    // Chiamata annullata (lettura superata, schermata lasciata): non è un errore.
    finalize(() => span?.end(true, { 'lowcode.cancelled': true })),
  );
};
