import { HttpClient, HttpContext, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { DataClient, fieldErrorsOf, type DataRequest, type DataRequestOptions } from 'core';
import { DataError } from './errors';
import { LOWCODE_TRACE } from './interceptor';
import { isSameOriginRelative } from './trace';

/** Multipart body: every entry of the body is a text part (objects as JSON), the file is the `field` part. */
function toFormData(body: Record<string, unknown> | undefined, file: NonNullable<DataRequest['file']>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(body ?? {})) {
    if (value === null || value === undefined) continue;
    form.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
  }
  form.append(file.field, file.blob, file.name);
  return form;
}

function toParams(query: Record<string, unknown> | undefined): HttpParams {
  let params = new HttpParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === null || value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) {
      params = params.append(key, String(item));
    }
  }
  return params;
}

function abortError(): DOMException {
  return new DOMException('Richiesta annullata', 'AbortError');
}

/** Runs the REST calls of the data sources. Relative URLs only: the browser talks to the BFF, never to arbitrary hosts. */
@Injectable({ providedIn: 'root' })
export class HttpDataClient extends DataClient {
  private readonly http = inject(HttpClient);

  async request(request: DataRequest, options: DataRequestOptions = {}): Promise<unknown> {
    if (!isSameOriginRelative(request.url) || request.url.split(/[?#]/)[0].split('/').includes('..')) {
      throw new DataError(0);
    }
    const signal = options.signal;
    if (signal?.aborted) throw abortError();
    try {
      return await new Promise((resolve, reject) => {
        const subscription = this.http
          .request(request.method, request.url, {
            params: toParams(request.query),
            // For the HTTP span: the data source (instead of the URL) and the span the call starts from.
            context: new HttpContext().set(LOWCODE_TRACE, { source: options.source, parent: options.trace }),
            // With a file the request is multipart (the browser sets the Content-Type with the boundary by itself).
            body: request.method === 'GET' || request.method === 'DELETE' ? undefined : request.file ? toFormData(request.body, request.file) : request.body,
          })
          .subscribe({ next: resolve, error: reject, complete: () => resolve(null) });
        // Unsubscribing interrupts the HTTP call in progress.
        signal?.addEventListener(
          'abort',
          () => {
            subscription.unsubscribe();
            reject(abortError());
          },
          { once: true },
        );
      });
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') throw e;
      if (e instanceof HttpErrorResponse) {
        const problem = e.error as { correlationId?: unknown } | null;
        const fromBody = typeof problem?.correlationId === 'string' ? problem.correlationId : undefined;
        throw new DataError(e.status, fromBody ?? e.headers?.get('X-Correlation-Id') ?? undefined, fieldErrorsOf(e.error));
      }
      throw new DataError(0);
    }
  }
}
