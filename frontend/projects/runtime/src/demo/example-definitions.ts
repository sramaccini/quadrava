import { Injectable } from '@angular/core';
import { DefinitionSource } from 'core';

/** Definizioni della demo: i file di `examples/` copiati nella cartella pubblica (tools/copy-examples.mjs). */
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
    return ['chiaro', 'classico', 'scuro'];
  }

  /** Nella demo i cataloghi sono i file `examples/i18n/<lingua>.json` (chiave → testo). */
  messages(locale: string): Promise<unknown> {
    return this.load(`examples/i18n/${encodeURIComponent(locale)}.json`);
  }

  private async load(url: string): Promise<unknown> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }
}
