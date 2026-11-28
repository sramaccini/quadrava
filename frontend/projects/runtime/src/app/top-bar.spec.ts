import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { DemoDiagnostics } from '../demo/demo-ports';
import { openShowcase, plainText, setupShowcase, teardownShowcase, type Showcase } from './showcase-testing';

/** The top bar of the demo: a screen named in navigation.json, with the search of the orders and the Create button. */
describe('Top bar', () => {
  beforeEach(() => setupShowcase());
  afterEach(() => teardownShowcase());

  const bar = (s: Showcase): HTMLElement => s.el.querySelector<HTMLElement>('lc-screen-view.top-bar')!;
  const box = (s: Showcase): HTMLInputElement | null => bar(s)?.querySelector<HTMLInputElement>('lc-search input') ?? null;
  const create = (s: Showcase): HTMLButtonElement | undefined =>
    [...(bar(s)?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find((b) => plainText(b.textContent) === 'Create');
  const dialog = (): HTMLElement | null => document.querySelector<HTMLElement>('.app-screen-dialog[role=dialog]');
  const toast = (): string => [...document.querySelectorAll('.ant-message-notice')].map((n) => plainText(n.textContent)).join(' | ');

  it('searches the orders as you type and opens the one picked', async () => {
    const s = await openShowcase('/showcase/showcase-validation');
    await s.until(() => !!box(s), 'the search box');
    expect(box(s)!.getAttribute('aria-label')).toBe('Search orders');
    // The operator may not create packages: no Create button.
    expect(create(s)).toBeUndefined();
    box(s)!.value = 'ord-0003';
    box(s)!.dispatchEvent(new Event('input'));
    await s.until(() => bar(s).querySelectorAll('[role=option]').length === 1, 'the result');
    expect(plainText(bar(s).querySelector('[role=option]')!.textContent)).toContain('ORD-0003');
    (bar(s).querySelector('[role=option]') as HTMLElement).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    await s.until(() => TestBed.inject(Router).url.includes('order-detail'), 'the order');
    expect(TestBed.inject(DemoDiagnostics).events()).toEqual([]);
  });

  it('Create opens the new package in a window, which closes when the package is created', async () => {
    const s = await openShowcase('/showcase/showcase-validation', 'manager');
    await s.until(() => !!create(s), 'the Create button');
    create(s)!.click();
    await s.until(() => !!dialog()?.querySelector('lc-form input'), 'the window');
    const name = dialog()!.querySelector<HTMLInputElement>('lc-form input')!;
    name.value = 'Spring release';
    name.dispatchEvent(new Event('input'));
    [...dialog()!.querySelectorAll<HTMLButtonElement>('button')].find((b) => plainText(b.textContent) === 'Create package')!.click();
    await s.until(() => toast().includes('Package created'), 'the toast after the window');
    await s.until(() => !dialog(), 'the window closed');
    expect(TestBed.inject(DemoDiagnostics).events()).toEqual([]);
  }, 20000);
});
