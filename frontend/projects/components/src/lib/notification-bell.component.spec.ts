import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { NotificationBellComponent } from './notification-bell.component';
import type { UserNotification } from './notifications';
import { provideLcComponents } from './provide';

describe('NotificationBellComponent', () => {
  const flush = async (fixture: ComponentFixture<unknown>): Promise<void> => {
    for (let i = 0; i < 4; i++) {
      fixture.detectChanges();
      await fixture.whenStable();
      await new Promise((r) => setTimeout(r, 5));
    }
  };
  const ITEMS: UserNotification[] = [
    { id: 'a', title: 'Invoice sent', text: 'FT-2026-001 to Smith Ltd', date: '2026-11-05T09:00:00Z', read: false, screen: 'invoice-list' },
    { id: 'b', title: 'Welcome', read: true },
  ];

  async function render(items: readonly UserNotification[] = ITEMS, canMarkRead = true) {
    TestBed.configureTestingModule({ providers: [provideLcComponents()] });
    const fixture = TestBed.createComponent(NotificationBellComponent);
    fixture.componentRef.setInput('items', items);
    fixture.componentRef.setInput('canMarkRead', canMarkRead);
    const events: string[] = [];
    fixture.componentInstance.opened.subscribe(() => events.push('opened'));
    fixture.componentInstance.choice.subscribe((n) => events.push(`choice:${n.id}`));
    fixture.componentInstance.markAllRead.subscribe(() => events.push('all read'));
    await flush(fixture);
    return { fixture, events, trigger: fixture.nativeElement.querySelector('button.trigger') as HTMLButtonElement };
  }
  const panel = (): HTMLElement | null => document.querySelector('.ant-dropdown section.panel');

  afterEach(() => document.querySelectorAll('.cdk-overlay-container').forEach((c) => c.replaceChildren()));

  it('shows the number of unread messages, also in the accessible name', async () => {
    const { trigger } = await render();
    expect(trigger.querySelector('.ant-badge-count')?.getAttribute('title')).toBe('1');
    expect(trigger.getAttribute('aria-label')).toBe('Messages, 1 unread');
  });

  it('opens the list, reports the opening and the chosen message', async () => {
    const { fixture, events, trigger } = await render();
    trigger.click();
    for (let i = 0; i < 40 && !panel(); i++) await flush(fixture);
    const rows = [...panel()!.querySelectorAll('li')];
    expect(rows.map((r) => r.classList.contains('unread'))).toEqual([true, false]);
    expect(rows[0].querySelector('.title')?.textContent?.trim()).toBe('Unread: Invoice sent');
    expect(rows[0].querySelector('.text')?.textContent?.trim()).toBe('FT-2026-001 to Smith Ltd');
    (panel()!.querySelector('header button') as HTMLButtonElement).click();
    (rows[0].querySelector('button') as HTMLButtonElement).click();
    expect(events).toEqual(['opened', 'all read', 'choice:a']);
  });

  it('without messages says so, and without a service to mark them read offers no «Mark all as read»', async () => {
    const { fixture, trigger } = await render([], false);
    trigger.click();
    for (let i = 0; i < 40 && !panel(); i++) await flush(fixture);
    expect(panel()!.querySelector('.empty')?.textContent?.trim()).toBe('No messages');
    expect(panel()!.querySelector('header button')).toBeNull();
  });
});
