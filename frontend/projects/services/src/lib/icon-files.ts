import { HttpBackend, HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { IconFiles } from 'core';
import { firstValueFrom } from 'rxjs';

/**
 * The icon files of the runtime, `assets/<theme>/<name>.svg` on the same origin (ADR-29). Straight to the server, without
 * the interceptors: static files, not calls to the BFF. The answer must be an SVG: a page in its place (the fallback of a
 * server for a missing file) is refused, as are an error and a failed connection.
 */
@Injectable({ providedIn: 'root' })
export class HttpIconFiles extends IconFiles {
  private readonly http = new HttpClient(inject(HttpBackend));

  async svg(theme: 'outline' | 'fill', name: string): Promise<string | null> {
    try {
      const response = await firstValueFrom(this.http.get(`assets/${theme}/${name}.svg`, { observe: 'response', responseType: 'text' }));
      const text = (response.body ?? '').trim();
      return (response.headers.get('Content-Type') ?? '').includes('svg') && text.startsWith('<svg') ? text : null;
    } catch {
      return null;
    }
  }
}
