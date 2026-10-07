import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NavigationRuntime, type Authorization, type UserProvider, type VisibleLeaf } from 'core';
import type { NavigationDefinition } from 'schema';
import { SidebarComponent, type NavigateEvent } from './sidebar.component';

const definition: NavigationDefinition = {
  schemaVersion: '1.0',
  navigation: 'app',
  useCases: [
    {
      id: 'inserimento',
      label: 'Inserimento',
      requires: 'fatture.fattura.crea',
      items: [
        {
          id: 'nuova',
          label: 'Nuova fattura',
          icon: 'file-plus',
          children: [
            { id: 'attiva', label: 'Attiva', screen: 'fattura-nuova', params: { tipo: 'attiva' } },
            { id: 'da-ordine', label: 'Da ordine', children: [{ id: 'scegli', label: 'Scegli ordine', screen: 'ordini-elenco' }] },
          ],
        },
        { id: 'bozze', label: 'Bozze', screen: 'fatture-elenco', params: { stato: 'bozza' } },
      ],
    },
    { id: 'consultazione', label: 'Consultazione', requires: 'fatture.fattura.leggi', items: [{ id: 'elenco', label: 'Elenco', screen: 'fatture-elenco' }] },
  ],
};

describe('SidebarComponent', () => {
  const permissions = signal(new Set<string>());

  function render(granted: string[]) {
    permissions.set(new Set(granted));
    const nav = new NavigationRuntime(definition, {
      authorization: { can: (p: string) => permissions().has(p) } as Authorization,
      userProvider: { user: () => ({}) } as UserProvider,
    });
    const fixture = TestBed.createComponent(SidebarComponent);
    fixture.componentRef.setInput('navigation', nav);
    fixture.componentRef.setInput('hrefFor', (uc: string, leaf: VisibleLeaf) => `/${uc}/${leaf.screen}`);
    const events: NavigateEvent[] = [];
    const changes: string[] = [];
    fixture.componentInstance.navigate.subscribe((e) => events.push(e));
    fixture.componentInstance.useCaseChange.subscribe((id) => changes.push(id));
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement, events, changes };
  }

  const labels = (el: HTMLElement): string[] => [...el.querySelectorAll('.row .label')].map((n) => n.textContent?.trim() ?? '');

  it('con un solo caso d’uso non mostra il selettore', () => {
    const { el } = render(['fatture.fattura.crea']);
    expect(el.querySelector('select')).toBeNull();
    expect(labels(el)).toEqual(['Nuova fattura', 'Bozze']);
  });

  it('con più casi d’uso mostra il selettore e segnala il cambio', () => {
    const { fixture, el, changes } = render(['fatture.fattura.crea', 'fatture.fattura.leggi']);
    const select = el.querySelector('select') as HTMLSelectElement;
    expect([...select.options].map((o) => o.textContent?.trim())).toEqual(['Inserimento', 'Consultazione']);
    select.value = 'consultazione';
    select.dispatchEvent(new Event('change'));
    expect(changes).toEqual(['consultazione']);
    fixture.componentRef.setInput('useCaseId', 'consultazione');
    fixture.detectChanges();
    expect(labels(el)).toEqual(['Elenco']);
  });

  it('i gruppi si aprono e chiudono con aria-expanded, fino al terzo livello', () => {
    const { fixture, el } = render(['fatture.fattura.crea']);
    const group = el.querySelector('button.group') as HTMLButtonElement;
    expect(group.getAttribute('aria-expanded')).toBe('false');
    group.click();
    fixture.detectChanges();
    expect(group.getAttribute('aria-expanded')).toBe('true');
    expect(labels(el)).toContain('Da ordine');
    ([...el.querySelectorAll('button.group')][1] as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(labels(el)).toContain('Scegli ordine');
  });

  it('evidenzia la voce attiva e apre i suoi gruppi', () => {
    const { fixture, el } = render(['fatture.fattura.crea']);
    fixture.componentRef.setInput('active', { screen: 'fattura-nuova', params: { tipo: 'attiva' } });
    fixture.detectChanges();
    fixture.detectChanges();
    const current = el.querySelector('a[aria-current="page"]');
    expect(current?.textContent).toContain('Attiva');
    expect(el.querySelectorAll('a[aria-current="page"]')).toHaveLength(1);
  });

  it('i link hanno href e il clic normale emette navigate senza ricaricare', () => {
    const { fixture, el, events } = render(['fatture.fattura.crea']);
    const bozze = [...el.querySelectorAll('a.leaf')].find((a) => a.textContent?.includes('Bozze')) as HTMLAnchorElement;
    expect(bozze.getAttribute('href')).toBe('/inserimento/fatture-elenco');
    const click = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    bozze.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    expect(events).toEqual([{ useCase: 'inserimento', leaf: expect.objectContaining({ id: 'bozze', screen: 'fatture-elenco', params: { stato: 'bozza' } }) }]);
    // Ctrl+clic: lo gestisce il browser
    const ctrl = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ctrlKey: true });
    bozze.dispatchEvent(ctrl);
    expect(ctrl.defaultPrevented).toBe(false);
    expect(events).toHaveLength(1);
    fixture.detectChanges();
  });

  it('i permessi tolti ridisegnano il menu', () => {
    const { fixture, el } = render(['fatture.fattura.crea']);
    permissions.set(new Set());
    fixture.detectChanges();
    expect(el.querySelector('nav')).toBeNull();
    expect(el.textContent).toContain('Nessuna funzione disponibile');
  });

  it('da compressa mostra solo le icone e un clic su un gruppo riapre la barra', () => {
    const { fixture, el } = render(['fatture.fattura.crea']);
    (el.querySelector('.toggle') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('.side')?.classList.contains('collapsed')).toBe(true);
    expect(labels(el)).toEqual([]);
    (el.querySelector('button.group') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('.side')?.classList.contains('collapsed')).toBe(false);
    expect(labels(el)).toContain('Attiva');
  });
});
