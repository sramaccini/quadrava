import { Injectable } from '@angular/core';
import { DefinitionSource } from 'core';

/** Definitions of the demo: the files of `examples/` copied into the public folder (tools/copy-examples.mjs). */
@Injectable({ providedIn: 'root' })
export class ExampleDefinitions extends DefinitionSource {
  screen(id: string): Promise<unknown> {
    return this.load(`examples/${encodeURIComponent(id)}.json`);
  }

  navigation(): Promise<unknown> {
    return this.load('examples/navigation.json');
  }

  theme(id: string): Promise<unknown> {
    return this.load(`examples/themes/${encodeURIComponent(id)}.json`);
  }

  themes(): string[] {
    return ['light', 'classic', 'dark'];
  }

  /** In the demo the catalogues are the files `examples/i18n/<language>.json` (key → text). */
  messages(locale: string): Promise<unknown> {
    return this.load(`examples/i18n/${encodeURIComponent(locale)}.json`);
  }

  private async load(url: string): Promise<unknown> {
    const response = await fetch(url);
    if (!response.ok) throw Object.assign(new Error(`HTTP ${response.status}`), { status: response.status });
    return response.json();
  }
}
