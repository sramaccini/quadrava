import type { NodeDefinition } from 'schema';
import { plain, renderScreen, type ScreenHarness } from './screen-testing';

describe('step-by-step procedure (wizard)', () => {
  const wizard = (bind?: string): NodeDefinition => ({
    type: 'wizard',
    ...(bind ? { bind } : {}),
    steps: [
      {
        label: 'Data',
        nextIf: '{{ has(state.ready) && state.ready == true }}',
        components: [
          { type: 'text', text: 'First step' },
          { type: 'button', label: 'Ready', onClick: [{ set: { path: 'state.ready', value: true } }] },
        ],
      },
      { label: 'Check', components: [{ type: 'text', text: 'Second step' }] },
      { label: 'End', components: [{ type: 'text', text: 'Third step' }, { type: 'button', label: 'Start again', onClick: [{ set: { path: 'state.step', value: 0 } }] }] },
    ],
  });
  const button = (h: ScreenHarness, text: string): HTMLButtonElement | undefined =>
    [...h.el.querySelectorAll<HTMLButtonElement>('button')].find((b) => plain(b.textContent) === text);
  const body = (h: ScreenHarness): string => plain(h.el.querySelector('lc-wizard section')?.textContent);

  it('shows the current step; Next follows nextIf; Back goes back; the last step has no Next', async () => {
    const h = await renderScreen({ components: [wizard('state.step')] });
    expect(h.el.querySelectorAll('nz-step')).toHaveLength(3);
    expect(body(h)).toContain('Passo 1 di 3: Data');
    expect(body(h)).toContain('First step');
    expect(button(h, 'Indietro')).toBeUndefined();
    expect(button(h, 'Avanti')!.disabled).toBe(true);
    button(h, 'Ready')!.click();
    await h.settle();
    expect(button(h, 'Avanti')!.disabled).toBe(false);
    button(h, 'Avanti')!.click();
    await h.settle();
    expect(body(h)).toContain('Second step');
    expect(h.el.querySelector('.ant-steps-item-process')?.textContent).toContain('Check');
    button(h, 'Avanti')!.click();
    await h.settle();
    expect(body(h)).toContain('Third step');
    expect(button(h, 'Avanti')).toBeUndefined();
    button(h, 'Indietro')!.click();
    await h.settle();
    expect(body(h)).toContain('Second step');
    button(h, 'Avanti')!.click();
    await h.settle();
    // A button in the step moves the step by writing to the state.
    button(h, 'Start again')!.click();
    await h.settle();
    expect(body(h)).toContain('First step');
    // nextIf has no expression errors even before the state exists.
    expect(h.reports).toEqual([]);
  });

  it('without bind the step is local', async () => {
    const h = await renderScreen({ components: [wizard()] });
    button(h, 'Ready')!.click();
    await h.settle();
    button(h, 'Avanti')!.click();
    await h.settle();
    expect(body(h)).toContain('Second step');
  });
});
