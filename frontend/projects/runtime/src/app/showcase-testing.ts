import { vi } from 'vitest';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { Router } from '@angular/router';
import navigationDoc from '../../public/examples/navigation.json';
import fattureElenco from '../../public/examples/fatture-elenco.json';
import tabelleAvanzate from '../../public/examples/vetrina-tabelle-avanzate.json';
import campi from '../../public/examples/vetrina-campi.json';
import input from '../../public/examples/vetrina-input.json';
import contenitori from '../../public/examples/vetrina-contenitori.json';
import attivita from '../../public/examples/vetrina-attivita.json';
import layout from '../../public/examples/vetrina-layout.json';
import cruscotto from '../../public/examples/vetrina-cruscotto.json';
import viste from '../../public/examples/vetrina-viste.json';
import datatable from '../../public/examples/vetrina-datatable.json';
import chiaro from '../../public/examples/themes/chiaro.json';
import catalogIt from '../../public/examples/i18n/it.json';
import catalogEn from '../../public/examples/i18n/en.json';
import { openSelect } from './select-testing';
import { App } from './app';
import { appConfig } from './app.config';

/** Solo per i test: documenti serviti alla demo al posto di `fetch`. */
export const SHOWCASE_FILES: Record<string, unknown> = {
  'examples/navigation.json': navigationDoc,
  // La destinazione iniziale, che si apre prima di andare alla schermata della vetrina.
  'examples/fatture-elenco.json': fattureElenco,
  'examples/vetrina-tabelle-avanzate.json': tabelleAvanzate,
  'examples/vetrina-campi.json': campi,
  'examples/vetrina-input.json': input,
  'examples/vetrina-contenitori.json': contenitori,
  'examples/vetrina-attivita.json': attivita,
  'examples/vetrina-layout.json': layout,
  'examples/vetrina-cruscotto.json': cruscotto,
  'examples/vetrina-viste.json': viste,
  'examples/vetrina-datatable.json': datatable,
  'examples/i18n/it.json': catalogIt,
  'examples/i18n/en.json': catalogEn,
  'examples/themes/chiaro.json': chiaro,
};

/** Prepara il modulo di test della demo: lingua italiana e `fetch` finto sui documenti della vetrina. */
export function setupShowcase(): void {
  // jsdom non ha scrollTo, che la lista delle opzioni di NG-ZORRO chiama con un ritardo.
  if (typeof Element.prototype.scrollTo !== 'function') Element.prototype.scrollTo = () => undefined;
  localStorage.setItem('lc.language', 'it');
  vi.stubGlobal('fetch', async (url: string) => {
    const body = SHOWCASE_FILES[url];
    return body ? { ok: true, status: 200, json: async () => body } : { ok: false, status: 404, json: async () => ({}) };
  });
  TestBed.configureTestingModule({ providers: appConfig.providers });
}

export function teardownShowcase(): void {
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute('style');
  document.body.querySelectorAll('.cdk-overlay-container').forEach((n) => n.remove());
}

export interface Showcase {
  fixture: ComponentFixture<App>;
  el: HTMLElement;
  until(condition: () => boolean, label: string): Promise<void>;
  settle(): Promise<void>;
}

/** Apre una schermata della demo (con il profilo indicato) e aspetta che il contenuto sia disegnato. */
export async function openShowcase(path: string, user = 'operatore'): Promise<Showcase> {
  const fixture = TestBed.createComponent(App);
  const el = fixture.nativeElement as HTMLElement;
  const settle = async (): Promise<void> => {
    fixture.detectChanges();
    await fixture.whenStable();
  };
  const until = async (condition: () => boolean, label: string): Promise<void> => {
    for (let i = 0; i < 200; i++) {
      await settle();
      if (condition()) return;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error(`timeout: ${label}\n${el.querySelector('main')?.innerHTML.slice(0, 2000)}`);
  };
  fixture.detectChanges();
  await TestBed.inject(Router).navigateByUrl('/');
  await until(() => !!el.querySelector('nz-header nz-select'), 'barra superiore');
  if (user !== 'operatore') {
    const options = await openSelect(el.querySelector('nz-header nz-select') as HTMLElement, settle);
    (options.find((o) => (o.textContent ?? '').trim() === user) as HTMLElement).click();
  }
  await TestBed.inject(Router).navigateByUrl(path);
  await until(() => !!el.querySelector('main h2'), 'contenuto');
  return { fixture, el, until, settle };
}

export const plainText = (text: string | null | undefined): string => (text ?? '').replace(/[  \s]+/g, ' ').trim();

/** Testi di una colonna delle righe di dati della tabella `table` (in ordine di pagina). */
export const cells = (el: HTMLElement, table: number, column: number): string[] =>
  [...(el.querySelectorAll('main nz-table')[table]?.querySelectorAll('tbody tr:not(.ant-table-placeholder)') ?? [])]
    .filter((tr) => !tr.classList.contains('lc-extra-row'))
    .map((tr) => plainText(tr.querySelectorAll('td')[column]?.textContent));

/** Intestazione di colonna della tabella `table` con il testo dato. */
export const headerCell = (el: HTMLElement, table: number, text: string): HTMLElement =>
  [...(el.querySelectorAll('main nz-table')[table]?.querySelectorAll<HTMLElement>('th') ?? [])].find((th) => plainText(th.textContent) === text)!;
