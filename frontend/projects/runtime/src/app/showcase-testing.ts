import { vi } from 'vitest';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { Router } from '@angular/router';
import navigationDoc from '../../public/examples/navigation.json';
import fattureElenco from '../../public/examples/invoice-list.json';
import tabelleAvanzate from '../../public/examples/showcase-advanced-tables.json';
import fields from '../../public/examples/showcase-fields.json';
import input from '../../public/examples/showcase-input.json';
import containers from '../../public/examples/showcase-containers.json';
import tasks from '../../public/examples/showcase-tasks.json';
import layout from '../../public/examples/showcase-layout.json';
import dashboard from '../../public/examples/showcase-dashboard.json';
import views from '../../public/examples/showcase-views.json';
import datatable from '../../public/examples/showcase-datatable.json';
import light from '../../public/examples/themes/light.json';
import catalogIt from '../../public/examples/i18n/it.json';
import catalogEn from '../../public/examples/i18n/en.json';
import { openSelect } from './select-testing';
import { App } from './app';
import { appConfig } from './app.config';

/** For tests only: documents served to the demo instead of `fetch`. */
export const SHOWCASE_FILES: Record<string, unknown> = {
  'examples/navigation.json': navigationDoc,
  // The initial destination, which opens before going to the showcase screen.
  'examples/invoice-list.json': fattureElenco,
  'examples/showcase-advanced-tables.json': tabelleAvanzate,
  'examples/showcase-fields.json': fields,
  'examples/showcase-input.json': input,
  'examples/showcase-containers.json': containers,
  'examples/showcase-tasks.json': tasks,
  'examples/showcase-layout.json': layout,
  'examples/showcase-dashboard.json': dashboard,
  'examples/showcase-views.json': views,
  'examples/showcase-datatable.json': datatable,
  'examples/i18n/it.json': catalogIt,
  'examples/i18n/en.json': catalogEn,
  'examples/themes/light.json': light,
};

/** Prepares the test module of the demo: Italian language and a fake `fetch` over the showcase documents. */
export function setupShowcase(): void {
  // jsdom has no scrollTo, which the NG-ZORRO option list calls with a delay.
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

/** Opens a screen of the demo (with the given profile) and waits until the content is drawn. */
export async function openShowcase(path: string, user = 'operator'): Promise<Showcase> {
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
  await until(() => !!el.querySelector('nz-header nz-select'), 'top bar');
  if (user !== 'operator') {
    const options = await openSelect(el.querySelector('nz-header nz-select') as HTMLElement, settle);
    (options.find((o) => (o.textContent ?? '').trim() === user) as HTMLElement).click();
  }
  await TestBed.inject(Router).navigateByUrl(path);
  await until(() => !!el.querySelector('main h2'), 'content');
  return { fixture, el, until, settle };
}

export const plainText = (text: string | null | undefined): string => (text ?? '').replace(/[  \s]+/g, ' ').trim();

/** Texts of a column of the data rows of table `table` (in page order). */
export const cells = (el: HTMLElement, table: number, column: number): string[] =>
  [...(el.querySelectorAll('main nz-table')[table]?.querySelectorAll('tbody tr:not(.ant-table-placeholder)') ?? [])]
    .filter((tr) => !tr.classList.contains('lc-extra-row'))
    .map((tr) => plainText(tr.querySelectorAll('td')[column]?.textContent));

/** Column header of table `table` with the given text. */
export const headerCell = (el: HTMLElement, table: number, text: string): HTMLElement =>
  [...(el.querySelectorAll('main nz-table')[table]?.querySelectorAll<HTMLElement>('th') ?? [])].find((th) => plainText(th.textContent) === text)!;
