import { HttpClient, HttpContext, HttpErrorResponse, HttpEventType, HttpParams, HttpResponse, type HttpEvent } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { DataClient, fieldErrorsOf, fileNameFromDisposition, type DataRequest, type DataRequestOptions, type DownloadedFile } from 'core';
import { DataError } from './errors';
import { LC_TRACE } from './interceptor';
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

/** The body of an error answer: a download receives it as a Blob, read here as JSON (a Problem) when it is one. */
async function errorBody(body: unknown): Promise<unknown> {
  if (!(body instanceof Blob)) return body;
  try {
    return JSON.parse(await body.text());
  } catch {
    return null;
  }
}

function abortError(): DOMException {
  return new DOMException('Request cancelled', 'AbortError');
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
      if (options.download) return await this.file(request, options);
      if (request.file && options.onProgress) return await this.upload(request, options, options.onProgress);
      return await new Promise((resolve, reject) => {
        const subscription = this.http
          .request(request.method, request.url, {
            params: toParams(request.query),
            // For the HTTP span: the data source (instead of the URL) and the span the call starts from; for the audit, the screen and action.
            context: new HttpContext().set(LC_TRACE, { source: options.source, parent: options.trace, baggage: options.baggage }),
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
        const body = await errorBody(e.error);
        const problem = body as { correlationId?: unknown } | null;
        const fromBody = typeof problem?.correlationId === 'string' ? problem.correlationId : undefined;
        throw new DataError(e.status, fromBody ?? e.headers?.get('X-Correlation-Id') ?? undefined, fieldErrorsOf(body));
      }
      throw new DataError(0);
    }
  }

  /**
   * A file sent with its progress: the events of the upload go to `onProgress`. Only the XMLHttpRequest backend of
   * `HttpClient` reports them; with `withFetch()` the upload has no progress and the field shows it as of unknown length.
   */
  private upload(request: DataRequest, options: DataRequestOptions, onProgress: (sent: number, total: number) => void): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const subscription = this.http
        .request(request.method, request.url, {
          params: toParams(request.query),
          context: new HttpContext().set(LC_TRACE, { source: options.source, parent: options.trace, baggage: options.baggage }),
          body: toFormData(request.body, request.file!),
          observe: 'events',
          reportProgress: true,
        })
        .subscribe({
          next: (event: HttpEvent<unknown>) => {
            if (event.type === HttpEventType.UploadProgress) onProgress(event.loaded, event.total ?? 0);
            else if (event.type === HttpEventType.Response) resolve(event.body);
          },
          error: reject,
          complete: () => resolve(null),
        });
      options.signal?.addEventListener(
        'abort',
        () => {
          subscription.unsubscribe();
          reject(abortError());
        },
        { once: true },
      );
    });
  }

  /** A GET whose answer is a file: the body as it is, with its type, and the name of `Content-Disposition`. */
  private file(request: DataRequest, options: DataRequestOptions): Promise<DownloadedFile> {
    return new Promise((resolve, reject) => {
      this.http
        .get(request.url, {
          params: toParams(request.query),
          context: new HttpContext().set(LC_TRACE, { source: options.source, parent: options.trace, baggage: options.baggage }),
          observe: 'response',
          responseType: 'blob',
        })
        .subscribe({
          next: (response: HttpResponse<Blob>) =>
            resolve({ blob: response.body ?? new Blob([]), fileName: fileNameFromDisposition(response.headers.get('Content-Disposition')) }),
          error: reject,
        });
    });
  }
}
