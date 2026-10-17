import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { I18n } from 'core';
import { EDITOR_MESSAGES } from '../messages';
import { EditorStore } from '../model/editor-store';
import { screenIdFrom } from '../model/templates';
import { NewScreenComponent, type NewScreen } from './new-screen.component';

describe('identifier from the title', () => {
  it('kebab-case without accents or symbols', () => {
    expect(screenIdFrom('Order list')).toBe('order-list');
    expect(screenIdFrom('  Café & Société: déjà 2026!  ')).toBe('cafe-societe-deja-2026');
    expect(screenIdFrom('Orders — Detail')).toBe('orders-detail');
  });

  it('empty if nothing is left, at most 60 characters without a trailing hyphen', () => {
    expect(screenIdFrom('¿¡ !?')).toBe('');
    const long = screenIdFrom('word '.repeat(20));
    expect(long.length).toBeLessThanOrEqual(60);
    expect(long.endsWith('-')).toBe(false);
  });
});

describe('«New screen» dialog', () => {
  let fixture: ComponentFixture<NewScreenComponent>;
  let el: HTMLElement;
  let created: NewScreen[];

  beforeEach(async () => {
    TestBed.inject(I18n).addMessages('en', EDITOR_MESSAGES['en']);
    fixture = TestBed.createComponent(NewScreenComponent);
    el = fixture.nativeElement as HTMLElement;
    created = [];
    fixture.componentInstance.created.subscribe((s) => created.push(s));
    fixture.detectChanges();
    await fixture.whenStable();
  });

  const input = (id: string): HTMLInputElement => el.querySelector(`#${id}`) as HTMLInputElement;
  const type = async (id: string, value: string): Promise<void> => {
    input(id).value = value;
    input(id).dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();
  };
  const create = (): HTMLButtonElement => el.querySelector('button[type="submit"]') as HTMLButtonElement;

  it('puts the focus on the title and keeps «Create» off while the title is missing', () => {
    expect(document.activeElement).toBe(input('new-screen-title'));
    expect(create().disabled).toBe(true);
  });

  it('proposes the identifier from the title and creates with Enter', async () => {
    await type('new-screen-title', 'Order list');
    expect(input('new-screen-id').value).toBe('order-list');
    el.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(created).toEqual([{ title: 'Order list', screen: 'order-list' }]);
  });

  it('an identifier typed by hand stays, an invalid one turns «Create» off and says so', async () => {
    await type('new-screen-title', 'Order list');
    await type('new-screen-id', 'orders');
    await type('new-screen-title', 'List of the orders');
    expect(input('new-screen-id').value).toBe('orders');
    await type('new-screen-id', 'Orders List');
    expect(create().disabled).toBe(true);
    expect(input('new-screen-id').getAttribute('aria-invalid')).toBe('true');
    expect(el.textContent).toContain(EDITOR_MESSAGES['en']['ed.newScreen.idInvalid']);
    await type('new-screen-id', '');
    expect(input('new-screen-id').value).toBe('list-of-the-orders');
  });

  it('the new screen has the chosen title and identifier and is valid', () => {
    const store = TestBed.inject(EditorStore);
    store.newScreen('Order list', 'order-list');
    expect(store.doc()).toMatchObject({ screen: 'order-list', title: 'Order list', components: [] });
    expect(store.issues()).toEqual([]);
  });
});
