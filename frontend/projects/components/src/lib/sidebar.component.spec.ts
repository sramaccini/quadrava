import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { NavigationRuntime, type Authorization, type UserProvider, type VisibleLeaf } from 'core';
import type { NavigationDefinition } from 'schema';
import { provideLowcodeComponents } from './provide';
import { openSelect, stubViewportHeight } from './select-testing';
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
  let restore: () => void;
  beforeAll(() => (restore = stubViewportHeight()));
  afterAll(() => restore());

  const permissions = signal(new Set<string>());
  const flush = async (fixture: ComponentFixture<unknown>): Promise<void> => {
    for (let i = 0; i < 4; i++) {
      fixture.detectChanges();
      await fixture.whenStable();
      await new Promise((r) => setTimeout(r, 5));
    }
  };

  async function render(granted: string[]) {
    permissions.set(new Set(granted));
    TestBed.configureTestingModule({ providers: [provideLowcodeComponents()] });
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
    await flush(fixture);
    return { fixture, el: fixture.nativeElement as HTMLElement, events, changes };
  }

  const text = (n: Element | null | undefined): string => (n?.textContent ?? '').replace(/\s+/g, ' ').trim();
  /** Etichette delle voci di primo livello. */
  const top = (el: HTMLElement): string[] =>
    [...el.querySelectorAll(':scope ul[nz-menu] > li')].map((li) => text(li.matches('.ant-menu-submenu') ? li.querySelector('.ant-menu-submenu-title') : li.querySelector('.label')));
  const openGroups = (el: HTMLElement): string[] => [...el.querySelectorAll('li.ant-menu-submenu-open > .ant-menu-submenu-title')].map((n) => text(n));
  const groupTitle = (el: HTMLElement, label: string): HTMLElement =>
    [...el.querySelectorAll<HTMLElement>('.ant-menu-submenu-title')].find((n) => text(n) === label)!;

  it('senza un marchio proprio (lcBrand) mostra l’icona predefinita e il nome, KinetiX se non indicato', async () => {
    const { fixture, el } = await render(['fatture.fattura.crea']);
    expect(text(el.querySelector('.logo .name'))).toBe('KinetiX');
    expect(el.querySelector('.logo .mark')).not.toBeNull();
    fixture.componentRef.setInput('brand', 'Acme');
    fixture.componentRef.setInput('logo', 'acme.svg');
    await flush(fixture);
    expect(text(el.querySelector('.logo .name'))).toBe('Acme');
    expect(el.querySelector('.logo img')?.getAttribute('src')).toBe('acme.svg');
  });

  it('con un solo caso d’uso non mostra il selettore', async () => {
    const { el } = await render(['fatture.fattura.crea']);
    expect(el.querySelector('nz-select')).toBeNull();
    expect(top(el)).toEqual(['Nuova fattura', 'Bozze']);
  });

  it('con più casi d’uso mostra il selettore e segnala il cambio', async () => {
    const { fixture, el, changes } = await render(['fatture.fattura.crea', 'fatture.fattura.leggi']);
    // Accanto al selettore c'è la stessa icona della barra compressa; l'etichetta resta solo per gli screen reader.
    expect(el.querySelector('.usecase .usecase-mark [nztype="appstore"], .usecase .usecase-mark .anticon-appstore')).not.toBeNull();
    expect(el.querySelector('.usecase label')?.classList.contains('visually-hidden')).toBe(true);
    expect(text(el.querySelector('.usecase label'))).toBe('Caso d’uso');
    const options = await openSelect(el.querySelector('nz-select') as Element, () => flush(fixture));
    expect(options.map((o) => text(o))).toEqual(['Inserimento', 'Consultazione']);
    options[1].click();
    await flush(fixture);
    expect(changes).toEqual(['consultazione']);
    fixture.componentRef.setInput('useCaseId', 'consultazione');
    await flush(fixture);
    expect(top(el)).toEqual(['Elenco']);
  });

  it('i gruppi si aprono e chiudono, fino al terzo livello', async () => {
    const { fixture, el } = await render(['fatture.fattura.crea']);
    expect(openGroups(el)).toEqual([]);
    groupTitle(el, 'Nuova fattura').click();
    await flush(fixture);
    expect(openGroups(el)).toEqual(['Nuova fattura']);
    groupTitle(el, 'Da ordine').click();
    await flush(fixture);
    expect(openGroups(el)).toEqual(['Nuova fattura', 'Da ordine']);
    expect(text(el)).toContain('Scegli ordine');
    groupTitle(el, 'Nuova fattura').click();
    await flush(fixture);
    expect(openGroups(el)).not.toContain('Nuova fattura');
  });

  it('evidenzia la voce attiva e apre i suoi gruppi', async () => {
    const { fixture, el } = await render(['fatture.fattura.crea']);
    fixture.componentRef.setInput('active', { screen: 'fattura-nuova', params: { tipo: 'attiva' } });
    await flush(fixture);
    const current = el.querySelector('a[aria-current="page"]');
    expect(current?.textContent).toContain('Attiva');
    expect(el.querySelectorAll('a[aria-current="page"]')).toHaveLength(1);
    expect(openGroups(el)).toEqual(['Nuova fattura']);
    expect(el.querySelector('li.ant-menu-item-selected')).not.toBeNull();
  });

  it('i link hanno href e il clic normale emette navigate senza ricaricare', async () => {
    const { fixture, el, events } = await render(['fatture.fattura.crea']);
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
    await flush(fixture);
  });

  it('il clic sul bordo della riga (fuori dal testo) apre la voce; l’evidenziazione segue solo la schermata aperta', async () => {
    const { fixture, el, events } = await render(['fatture.fattura.crea']);
    fixture.componentRef.setInput('active', { screen: 'fattura-nuova', params: { tipo: 'attiva' } });
    await flush(fixture);
    const row = [...el.querySelectorAll<HTMLElement>('li.ant-menu-item')].find((li) => li.textContent?.includes('Bozze'))!;
    row.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    await flush(fixture);
    expect(events.map((e) => e.leaf.id)).toEqual(['bozze']);
    // Finché la schermata non cambia, resta evidenziata quella aperta (prima il clic spostava l'evidenziazione da solo).
    const selected = () => [...el.querySelectorAll('li.ant-menu-item-selected')].map((li) => text(li.querySelector('.label')));
    expect(selected()).toEqual(['Attiva']);
    fixture.componentRef.setInput('active', { screen: 'fatture-elenco', params: { stato: 'bozza' } });
    await flush(fixture);
    expect(selected()).toEqual(['Bozze']);
  });

  it('i permessi tolti ridisegnano il menu', async () => {
    const { fixture, el } = await render(['fatture.fattura.crea']);
    permissions.set(new Set());
    await flush(fixture);
    expect(el.querySelector('nav')).toBeNull();
    expect(el.textContent).toContain('Nessuna funzione disponibile');
  });

  it('da compressa mostra solo le icone e si può riaprire', async () => {
    const { fixture, el } = await render(['fatture.fattura.crea']);
    const toggle = el.querySelector('button.toggle') as HTMLButtonElement;
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    toggle.click();
    await flush(fixture);
    expect(el.querySelector('.side')?.classList.contains('collapsed')).toBe(true);
    expect(el.querySelector('ul[nz-menu]')?.classList.contains('ant-menu-inline-collapsed')).toBe(true);
    // Le voci restano raggiungibili da tastiera e per screen reader grazie ad aria-label.
    expect(el.querySelector('a.leaf')?.getAttribute('aria-label')).toBe('Bozze');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    toggle.click();
    await flush(fixture);
    expect(el.querySelector('.side')?.classList.contains('collapsed')).toBe(false);
  });

  it('può essere compressa dall’esterno e senza pulsante proprio', async () => {
    const { fixture, el } = await render(['fatture.fattura.crea']);
    fixture.componentRef.setInput('showToggle', false);
    await flush(fixture);
    expect(el.querySelector('button.toggle')).toBeNull();
    fixture.componentRef.setInput('collapsed', true);
    await flush(fixture);
    expect(el.querySelector('.side')?.classList.contains('collapsed')).toBe(true);
  });

  it('da compressa il selettore dei casi d’uso diventa un’icona con un menu a tendina', async () => {
    const { fixture, el, changes } = await render(['fatture.fattura.crea', 'fatture.fattura.leggi']);
    expect(el.querySelector('nz-select')).not.toBeNull();
    fixture.componentRef.setInput('collapsed', true);
    await flush(fixture);
    expect(el.querySelector('nz-select')).toBeNull();
    const trigger = el.querySelector('button.usecase-trigger') as HTMLButtonElement;
    expect(trigger.querySelector('[nztype="appstore"], .anticon-appstore')).not.toBeNull();
    expect(trigger.getAttribute('aria-label')).toBe('Caso d’uso: Inserimento');
    trigger.click();
    for (let i = 0; i < 40 && document.querySelectorAll('.ant-dropdown li[nz-menu-item]').length === 0; i++) await flush(fixture);
    const items = [...document.querySelectorAll<HTMLElement>('.ant-dropdown li[nz-menu-item]')];
    expect(items.map((n) => text(n))).toEqual(['Inserimento', 'Consultazione']);
    items[1].click();
    expect(changes).toEqual(['consultazione']);
    document.querySelectorAll('.cdk-overlay-container').forEach((c) => (c.innerHTML = ''));
  });

  describe('ricerca, contatori e tastiera', () => {
    const key = (target: Element, k: string) => target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

    it('la ricerca mostra le voci che contengono il testo (senza accenti e maiuscole), con il percorso; Invio apre la prima', async () => {
      const { fixture, el, events } = await render(['fatture.fattura.crea']);
      const input = el.querySelector('.search input') as HTMLInputElement;
      input.value = 'ATTIVA';
      input.dispatchEvent(new Event('input'));
      await flush(fixture);
      expect(el.querySelector('nav')).toBeNull();
      expect([...el.querySelectorAll('.results a')].map((a) => text(a))).toEqual(['Attiva Nuova fattura']);
      // Anche il nome del gruppo conta: «nuova» trova le sue voci.
      input.value = 'nuova';
      input.dispatchEvent(new Event('input'));
      await flush(fixture);
      expect([...el.querySelectorAll('.results a')].map((a) => text(a))).toEqual(['Attiva Nuova fattura', 'Scegli ordine Nuova fattura › Da ordine']);
      key(input, 'Enter');
      await flush(fixture);
      expect(events.map((e) => e.leaf.id)).toEqual(['attiva']);
      expect(input.value).toBe('');
      expect(el.querySelector('nav')).not.toBeNull();
      input.value = 'zzz';
      input.dispatchEvent(new Event('input'));
      await flush(fixture);
      expect(text(el.querySelector('.results [role="status"]'))).toBe('Nessuna voce trovata.');
      key(input, 'Escape');
      await flush(fixture);
      expect(el.querySelector('.results')).toBeNull();
    });

    it('contatori accanto alle voci, letti anche dai lettori di schermo; oltre 99 «99+»', async () => {
      const { fixture, el } = await render(['fatture.fattura.crea']);
      fixture.componentRef.setInput('badges', { bozze: 3, attiva: 120 });
      await flush(fixture);
      const bozze = [...el.querySelectorAll('a.leaf')].find((a) => a.textContent?.includes('Bozze'))!;
      expect(text(bozze.querySelector('.badge'))).toBe('3');
      expect(text(bozze.querySelector('.visually-hidden'))).toBe(', 3 da gestire');
      fixture.componentRef.setInput('collapsed', true);
      await flush(fixture);
      expect(bozze.getAttribute('aria-label')).toBe('Bozze, 3 da gestire');
    });

    it('i titoli dei gruppi si raggiungono da tastiera e dicono se sono aperti; frecce, Home/Fine, destra e sinistra', async () => {
      const { fixture, el } = await render(['fatture.fattura.crea']);
      const title = el.querySelector('.ant-menu-submenu-title') as HTMLElement;
      expect([title.getAttribute('tabindex'), title.getAttribute('role'), title.getAttribute('aria-expanded')]).toEqual(['0', 'button', 'false']);
      title.focus();
      key(title, 'ArrowRight');
      await flush(fixture);
      expect(title.getAttribute('aria-expanded')).toBe('true');
      // Aperto: giù entra nella prima voce, poi nel sottogruppo.
      key(title, 'ArrowDown');
      expect(text(document.activeElement)).toBe('Attiva');
      key(document.activeElement!, 'ArrowDown');
      expect(text(document.activeElement)).toBe('Da ordine');
      // Sinistra da una voce torna al gruppo che la contiene.
      key(el.querySelector('a.leaf')!, 'ArrowLeft');
      expect(document.activeElement).toBe(title);
      key(title, 'End');
      expect(text(document.activeElement)).toBe('Bozze');
      key(document.activeElement!, 'Home');
      expect(document.activeElement).toBe(title);
      key(title, 'Enter');
      await flush(fixture);
      expect(title.getAttribute('aria-expanded')).toBe('false');
    });
  });

  it('contatori sui gruppi chiusi: la somma delle voci (anche dei sottogruppi); aperto, i numeri passano alle voci', async () => {
    const { fixture, el } = await render(['fatture.fattura.crea']);
    fixture.componentRef.setInput('badges', { attiva: 2, scegli: 3, bozze: 1 });
    await flush(fixture);
    const title = () => el.querySelector('li[data-group="nuova"] > .ant-menu-submenu-title') as HTMLElement;
    expect(title().getAttribute('data-lc-badge')).toBe('5');
    expect(title().getAttribute('aria-label')).toBe('Nuova fattura, 5 da gestire');
    title().click();
    await flush(fixture);
    expect(title().getAttribute('data-lc-badge')).toBeNull();
    expect(title().getAttribute('aria-label')).toBeNull();
    // Il sottogruppo chiuso mostra i suoi.
    expect(el.querySelector('li[data-group="da-ordine"] > .ant-menu-submenu-title')?.getAttribute('data-lc-badge')).toBe('3');
    // A barra compressa il contatore resta sul gruppo anche se era aperto.
    fixture.componentRef.setInput('collapsed', true);
    await flush(fixture);
    expect(title().getAttribute('data-lc-badge')).toBe('5');
  });
});
