import type { NodeDefinition } from 'schema';
import { plain, renderScreen, type ScreenHarness } from './screen-testing';

describe('procedura a passi (wizard)', () => {
  const wizard = (bind?: string): NodeDefinition => ({
    type: 'wizard',
    ...(bind ? { bind } : {}),
    steps: [
      {
        label: 'Dati',
        nextIf: '{{ has(state.pronto) && state.pronto == true }}',
        components: [
          { type: 'text', text: 'Primo passo' },
          { type: 'button', label: 'Pronto', onClick: [{ set: { path: 'state.pronto', value: true } }] },
        ],
      },
      { label: 'Controllo', components: [{ type: 'text', text: 'Secondo passo' }] },
      { label: 'Fine', components: [{ type: 'text', text: 'Terzo passo' }, { type: 'button', label: 'Ricomincia', onClick: [{ set: { path: 'state.passo', value: 0 } }] }] },
    ],
  });
  const button = (h: ScreenHarness, text: string): HTMLButtonElement | undefined =>
    [...h.el.querySelectorAll<HTMLButtonElement>('button')].find((b) => plain(b.textContent) === text);
  const body = (h: ScreenHarness): string => plain(h.el.querySelector('lc-wizard section')?.textContent);

  it('mostra il passo corrente; Avanti segue nextIf; Indietro torna; l’ultimo passo non ha Avanti', async () => {
    const h = await renderScreen({ components: [wizard('state.passo')] });
    expect(h.el.querySelectorAll('nz-step')).toHaveLength(3);
    expect(body(h)).toContain('Passo 1 di 3: Dati');
    expect(body(h)).toContain('Primo passo');
    expect(button(h, 'Indietro')).toBeUndefined();
    expect(button(h, 'Avanti')!.disabled).toBe(true);
    button(h, 'Pronto')!.click();
    await h.settle();
    expect(button(h, 'Avanti')!.disabled).toBe(false);
    button(h, 'Avanti')!.click();
    await h.settle();
    expect(body(h)).toContain('Secondo passo');
    expect(h.el.querySelector('.ant-steps-item-process')?.textContent).toContain('Controllo');
    button(h, 'Avanti')!.click();
    await h.settle();
    expect(body(h)).toContain('Terzo passo');
    expect(button(h, 'Avanti')).toBeUndefined();
    button(h, 'Indietro')!.click();
    await h.settle();
    expect(body(h)).toContain('Secondo passo');
    button(h, 'Avanti')!.click();
    await h.settle();
    // Un pulsante nel passo sposta il passo scrivendo nello stato.
    button(h, 'Ricomincia')!.click();
    await h.settle();
    expect(body(h)).toContain('Primo passo');
    // nextIf non ha errori di espressione anche prima che lo stato esista.
    expect(h.reports).toEqual([]);
  });

  it('senza bind il passo è locale', async () => {
    const h = await renderScreen({ components: [wizard()] });
    button(h, 'Pronto')!.click();
    await h.settle();
    button(h, 'Avanti')!.click();
    await h.settle();
    expect(body(h)).toContain('Secondo passo');
  });
});
