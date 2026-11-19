import { HttpContextToken, HttpErrorResponse, HttpEvent, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { Injector, inject } from '@angular/core';
import { I18n, type SpanAttributes, type SpanContext } from 'core';
import { finalize, tap } from 'rxjs';
import { HttpAuthorization } from './authorization';
import { LC_SERVICES_CONFIG } from './config';
import { HttpSession, RECENT_LOGIN_REQUIRED } from './session';
import { baggage, isSameOriginRelative, traceparent } from './trace';
import { HttpTracer } from './tracer';

/**
 * Trace context of a request: the data source making it, the span (action, opening) it starts from and the context for
 * the audit of the services (screen, action).
 */
export const LC_TRACE = new HttpContextToken<{ source?: string; parent?: SpanContext; baggage?: Readonly<Record<string, string>> }>(() => ({}));

/**
 * For calls to the same origin: opens the HTTP span and puts its identity in `traceparent` (the services continue
 * the same trace) and the screen and action of the call in `baggage`, sends the language chosen by the user in `Accept-Language`
 * (the browser would send its own), watches `X-Permissions-Version` (if it changes, reloads the permissions) and on 401 redirects to the login.
 * Sends to telemetry are not traced: they would generate more spans.
 */
export const lcHttpInterceptor: HttpInterceptorFn = (req, next) => {
  if (!isSameOriginRelative(req.url)) return next(req);
  const injector = inject(Injector);
  const config = injector.get(LC_SERVICES_CONFIG);
  const untraced = req.headers.has('traceparent') || req.url.startsWith(`${config.telemetryBase}/`);
  const { source, parent, baggage: context } = req.context.get(LC_TRACE);
  // For data-source calls the name, not the URL: path and query may contain data values.
  const attributes: SpanAttributes = source ? { 'http.request.method': req.method, 'lc.datasource': source } : { 'http.request.method': req.method, 'url.path': req.url.split(/[?#]/)[0] };
  const span = untraced ? null : injector.get(HttpTracer).start('http.client', attributes, parent, 'client');
  const audit = req.headers.has('baggage') ? null : baggage(context);
  const language = req.headers.has('Accept-Language') ? null : injector.get(I18n, null)?.locale();
  const headers: Record<string, string> = {
    ...(span ? { traceparent: traceparent(span.context) } : {}),
    ...(audit ? { baggage: audit } : {}),
    ...(language ? { 'Accept-Language': language } : {}),
  };
  const traced = Object.keys(headers).length ? req.clone({ setHeaders: headers }) : req;
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
        if (error instanceof HttpErrorResponse && error.status === 401) {
          const session = injector.get(HttpSession);
          const decide = (body: unknown) => {
            const maxAge = recentLoginAge(body);
            if (maxAge === null) session.markExpired();
            else void session.reauthenticate(maxAge);
          };
          // A download receives the Problem as a Blob: read first, then decided as for any other call.
          if (error.error instanceof Blob) void error.error.text().then(decide, () => decide(null));
          else decide(error.error);
        }
      },
    }),
    // Call cancelled (read superseded, screen left): not an error.
    finalize(() => span?.end(true, { 'lc.cancelled': true })),
  );
};

/**
 * The `maxAge` of a 401 that asks for a recent login (Problem `urn:problem:authz:recent-login-required`), 0 when it has
 * none; null for any other 401, which is an expired session. The body may arrive parsed or as text (a download's Blob
 * is read as text before).
 */
export function recentLoginAge(body: unknown): number | null {
  let problem: unknown = body;
  if (typeof body === 'string') {
    try {
      problem = JSON.parse(body);
    } catch {
      return null;
    }
  }
  if (problem === null || typeof problem !== 'object' || (problem as { type?: unknown }).type !== RECENT_LOGIN_REQUIRED) return null;
  const age = (problem as { maxAge?: unknown }).maxAge;
  return typeof age === 'number' && Number.isInteger(age) && age >= 0 ? age : 0;
}
