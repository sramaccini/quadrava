import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { I18n } from 'core';
import { EDITOR_MESSAGES } from '../messages';
import { EditorStore } from '../model/editor-store';
import { screenIdFrom } from '../model/templates';
import { NewScreenComponent, type NewScreen } from './new-screen.component';

describe('identificativo dal titolo', () => {
  it('kebab-case senza accenti né simboli', () => {
    expect(screenIdFrom('Elenco ordini')).toBe('elenco-ordini');
    expect(screenIdFrom('  Città & Società: già 2026!  ')).toBe('citta-societa-gia-2026');
    expect(screenIdFrom('Ordini — Dettaglio')).toBe('ordini-dettaglio');
  });

  it('vuoto se non resta nulla, al massimo 60 caratteri senza trattino finale', () => {
    expect(screenIdFrom('¿¡ !?')).toBe('');
    const long = screenIdFrom('parola '.repeat(20));
    expect(long.length).toBeLessThanOrEqual(60);
    expect(long.endsWith('-')).toBe(false);
  });
});

describe('finestra «Nuova schermata»', () => {
  let fixture: ComponentFixture<NewScreenComponent>;
  let el: HTMLElement;
  let created: NewScreen[];

  beforeEach(async () => {
    TestBed.inject(I18n).addMessages('it', EDITOR_MESSAGES['it']);
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

  it('mette il fuoco sul titolo e tiene «Crea» spento finché il titolo manca', () => {
    expect(document.activeElement).toBe(input('new-screen-title'));
    expect(create().disabled).toBe(true);
  });

  it('propone l’identificativo dal titolo e crea con Invio', async () => {
    await type('new-screen-title', 'Elenco ordini');
    expect(input('new-screen-id').value).toBe('elenco-ordini');
    el.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(created).toEqual([{ title: 'Elenco ordini', screen: 'elenco-ordini' }]);
  });

  it('un identificativo scritto a mano resta, uno non valido spegne «Crea» e lo dice', async () => {
    await type('new-screen-title', 'Elenco ordini');
    await type('new-screen-id', 'ordini');
    await type('new-screen-title', 'Elenco degli ordini');
    expect(input('new-screen-id').value).toBe('ordini');
    await type('new-screen-id', 'Ordini Elenco');
    expect(create().disabled).toBe(true);
    expect(input('new-screen-id').getAttribute('aria-invalid')).toBe('true');
    expect(el.textContent).toContain(EDITOR_MESSAGES['it']['ed.newScreen.idInvalid']);
    await type('new-screen-id', '');
    expect(input('new-screen-id').value).toBe('elenco-degli-ordini');
  });

  it('la schermata nuova ha titolo e identificativo scelti ed è valida', () => {
    const store = TestBed.inject(EditorStore);
    store.newScreen('Elenco ordini', 'elenco-ordini');
    expect(store.doc()).toMatchObject({ screen: 'elenco-ordini', title: 'Elenco ordini', components: [] });
    expect(store.issues()).toEqual([]);
  });
});
