import { HttpErrorResponse, HttpEvent, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { Injector, inject } from '@angular/core';
import { tap } from 'rxjs';
import { HttpAuthorization } from './authorization';
import { HttpSession } from './session';
import { isSameOriginRelative, newTraceparent } from './trace';

/**
 * Per le chiamate alla stessa origine: aggiunge `traceparent`, osserva `X-Permissions-Version`
 * (se cambia, ricarica i permessi) e su 401 rimanda al login.
 */
export const lowcodeHttpInterceptor: HttpInterceptorFn = (req, next) => {
  if (!isSameOriginRelative(req.url)) return next(req);
  const injector = inject(Injector);
  const traced = req.headers.has('traceparent') ? req : req.clone({ setHeaders: { traceparent: newTraceparent().header } });
  return next(traced).pipe(
    tap({
      next: (event: HttpEvent<unknown>) => {
        if (event instanceof HttpResponse) {
          const version = event.headers.get('X-Permissions-Version');
          if (version) injector.get(HttpAuthorization).observeVersion(version);
        }
      },
      error: (error: unknown) => {
        if (error instanceof HttpErrorResponse && error.status === 401) injector.get(HttpSession).markExpired();
      },
    }),
  );
};
