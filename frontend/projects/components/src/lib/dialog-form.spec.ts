import type { NodeDefinition } from 'schema';
import { plain, renderScreen, type ScreenHarness } from './screen-testing';

describe('finestra con form (passo dialog)', () => {
  afterEach(() => document.querySelectorAll('.cdk-overlay-container').forEach((c) => (c.innerHTML = '')));

  const button: NodeDefinition = {
    type: 'button',
    label: 'Aggiungi nota',
    onClick: [
      {
        dialog: {
          title: '<b>Nota</b> per {{ 1 + 1 }}',
          fields: [{ name: 'testo', type: 'textarea', label: 'Testo', required: true }],
          initial: { testo: '{{ state.vecchia }}' },
          submitLabel: 'Salva la nota',
          onSubmit: [{ call: 'salva' }],
        },
      },
      { toast: 'Fatto' },
    ],
  };
  const dataSources = { salva: { type: 'rest' as const, method: 'POST' as const, url: '/api/nota', body: '{{ form }}' } };
  const dialog = (): HTMLElement | null => [...document.querySelectorAll<HTMLElement>('.lc-dialog-form .ant-modal')].at(-1) ?? null;
  const dialogButton = (text: string): HTMLButtonElement => [...dialog()!.querySelectorAll('button')].find((b) => plain(b.textContent) === text) as HTMLButtonElement;
  const open = async (h: ScreenHarness): Promise<void> => {
    ([...h.el.querySelectorAll('button')].find((b) => b.textContent?.includes('Aggiungi nota')) as HTMLButtonElement).click();
    await h.until(() => !!dialog()?.querySelector('lc-form textarea'), 'finestra aperta');
  };
  const modals = (): number => document.querySelectorAll('.lc-dialog-form .ant-modal').length;
  /** In jsdom la finestra chiusa resta nel documento (l'animazione non finisce): si verifica che se ne possa aprire un'altra. */
  const reopenable = async (h: ScreenHarness): Promise<void> => {
    const before = modals();
    ([...h.el.querySelectorAll('button')].find((b) => b.textContent?.includes('Aggiungi nota')) as HTMLButtonElement).click();
    await h.until(() => modals() === before + 1, 'nuova finestra');
  };

  it('mostra il titolo come testo e il form; valida, invia, si chiude e la sequenza prosegue', async () => {
    let fail = true;
    const h = await renderScreen({
      components: [button],
      dataSources,
      respond: () => {
        if (fail) throw new Error('500');
        return {};
      },
    });
    await open(h);
    expect(plain(dialog()!.querySelector('h2')?.textContent)).toBe('<b>Nota</b> per 2');
    expect(dialog()!.querySelector('h2 b')).toBeNull();
    expect(dialog()!.closest('[role="dialog"]')?.getAttribute('aria-labelledby')).toBe(dialog()!.querySelector('h2')?.id);
    // Obbligatorio vuoto: niente invio.
    dialogButton('Salva la nota').click();
    await h.settle();
    expect(h.requests).toEqual([]);
    const textarea = dialog()!.querySelector('textarea') as HTMLTextAreaElement;
    textarea.value = 'Consegnare entro venerdì';
    textarea.dispatchEvent(new Event('input'));
    // Il servizio fallisce: la finestra resta aperta con i dati.
    dialogButton('Salva la nota').click();
    await h.until(() => h.requests.length === 1, 'primo invio');
    await h.settle();
    expect(dialog()?.querySelector('textarea')).not.toBeNull();
    expect(h.toasts).toEqual(['Operazione non riuscita']);
    fail = false;
    dialogButton('Salva la nota').click();
    await h.until(() => h.toasts.includes('Fatto'), 'sequenza completata');
    expect(h.requests[1].body).toEqual({ testo: 'Consegnare entro venerdì' });
    await reopenable(h);
  });

  it('Annulla chiude la finestra e ferma la sequenza', async () => {
    const h = await renderScreen({ components: [button], dataSources });
    await open(h);
    dialogButton('Annulla').click();
    await h.settle();
    expect(h.requests).toEqual([]);
    expect(h.toasts).toEqual([]);
    await reopenable(h);
  });
});
