import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideLowcodeComponents } from 'components';
import { Confirmation, I18n, Notifier } from 'core';
import { vi } from 'vitest';
import { EDITOR_MESSAGES } from '../messages';
import type { DocumentSummary } from '../model/registry-client';
import { applies, needsAttention } from '../model/registry-review';
import { RegistrySession } from '../model/registry-session';
import { StudioSettings, fixedStudioSettings } from '../model/studio-settings';
import { RegistryReviewComponent } from './registry-review.component';

const doc = (kind: DocumentSummary['kind'], id: string, state: string, published?: string): DocumentSummary => ({
  kind,
  id,
  latest: { hash: `${id}-h`, createdAt: '', author: 'mario', state: state as never },
  publishedEnvironments: published ? { production: published } : {},
});

describe('review of several versions', () => {
  it('which documents need a step, and which actions apply to them', () => {
    expect(needsAttention(doc('screen', 'a', 'approved', 'a-h'), 'production')).toBe(false);
    expect(needsAttention(doc('screen', 'a', 'approved', 'old'), 'production')).toBe(true);
    expect(needsAttention(doc('screen', 'a', 'draft'), 'production')).toBe(true);
    expect(applies('request', doc('screen', 'a', 'draft'))).toBe(true);
    expect(applies('request', doc('screen', 'a', 'rejected'))).toBe(true);
    expect(applies('approve', doc('screen', 'a', 'draft'))).toBe(false);
    expect(applies('approve', doc('screen', 'a', 'in-review'))).toBe(true);
    expect(applies('publish', doc('screen', 'a', 'in-review'))).toBe(false);
    expect(applies('publish', doc('screen', 'a', 'approved'))).toBe(true);
  });

  describe('the dialog', () => {
    let fixture: ComponentFixture<RegistryReviewComponent>;
    let el: HTMLElement;
    let documents: DocumentSummary[];
    const calls: string[] = [];

    beforeEach(async () => {
      localStorage.clear();
      localStorage.setItem('lc.editor.registry', JSON.stringify({ appId: 'shop', env: 'production' }));
      calls.length = 0;
      documents = [doc('navigation', 'main', 'in-review'), doc('screen', 'orders', 'in-review'), doc('screen', 'mine', 'in-review'), doc('theme', 'dark', 'approved', 'dark-h')];
      vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
        const method = init.method ?? 'GET';
        const json = (body: unknown, status = 200) => ({ ok: status < 400, status, headers: new Headers(), json: async () => body });
        if (url === '/registry/apps') return json([{ id: 'shop', name: 'Shop' }]);
        if (url.endsWith('/documents')) return json(documents);
        calls.push(`${method} ${url.replace('/registry/apps/shop/documents/', '')} ${init.body ?? ''}`);
        // The author does not approve their own version: the registry says so for «mine».
        if (url.includes('/screen/mine/')) return json({ title: 'The author of a version cannot approve it' }, 403);
        const [, kind, id] = /documents\/([a-z]+)\/([a-z-]+)\//.exec(url)!;
        documents = documents.map((d) => (d.kind === kind && d.id === id ? { ...d, latest: { ...d.latest!, state: 'approved' } } : d));
        return json({ hash: `${id}-h`, createdAt: '', author: 'mario', state: 'approved' });
      });
      TestBed.configureTestingModule({
        providers: [
          provideLowcodeComponents(),
          { provide: Notifier, useValue: { toast: () => undefined } },
          { provide: Confirmation, useValue: { confirm: async () => true } },
          { provide: StudioSettings, useValue: fixedStudioSettings() },
        ],
      });
      TestBed.inject(I18n).addMessages('en', EDITOR_MESSAGES['en']);
      await TestBed.inject(RegistrySession).check();
      fixture = TestBed.createComponent(RegistryReviewComponent);
      el = fixture.nativeElement as HTMLElement;
      await settle();
    });

    afterEach(() => vi.unstubAllGlobals());

    async function settle(): Promise<void> {
      for (let i = 0; i < 4; i++) {
        fixture.detectChanges();
        await fixture.whenStable();
        await new Promise((r) => setTimeout(r));
      }
    }
    const rows = (): string[] => [...el.querySelectorAll('tbody tr[data-review]')].map((r) => r.getAttribute('data-review')!);
    const button = (action: string): HTMLButtonElement => el.querySelector(`[data-bulk="${action}"]`) as HTMLButtonElement;

    it('lists the documents waiting for a step; approves the selected ones together, each with its own outcome', async () => {
      // The published and approved theme is not shown among those to complete.
      expect(rows()).toEqual(['navigation/main', 'screen/mine', 'screen/orders']);
      expect(button('approve').disabled).toBe(true);
      (el.querySelector('thead input[type="checkbox"]') as HTMLInputElement).click();
      await settle();
      expect(button('approve').textContent).toContain('Approve (3)');
      expect(button('publish').disabled).toBe(true);
      (el.querySelector('[aria-label="Note for the review (optional)"]') as HTMLInputElement).value = 'ok for the release';
      el.querySelector<HTMLInputElement>('[aria-label="Note for the review (optional)"]')!.dispatchEvent(new Event('input'));
      button('approve').click();
      await settle();
      // Screens before the navigation; the note goes with every decision.
      expect(calls.map((c) => c.split(' ')[1])).toEqual(['screen/mine/versions/mine-h/review', 'screen/orders/versions/orders-h/review', 'navigation/main/versions/main-h/review']);
      expect(calls[1]).toContain('"note":"ok for the release"');
      const outcomes = [...el.querySelectorAll('.outcomes li')].map((li) => li.textContent?.replace(/\s+/g, ' ').trim());
      expect(outcomes).toEqual(['screen/mine: The author of a version cannot approve it', 'screen/orders: done', 'navigation/main: done']);
      // The approved ones can now be published together.
      expect(rows()).toEqual(['navigation/main', 'screen/mine', 'screen/orders']);
      expect(button('publish').textContent).toContain('Publish in production (2)');
    });
  });
});
