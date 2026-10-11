import type { NodeDefinition } from 'schema';
import { columnTexts, plain, renderScreen } from './screen-testing';

describe('righe di dettaglio espandibili', () => {
  const rows = [
    { id: 1, numero: 'O-1', note: 'Consegna al mattino', righe: 3 },
    { id: 2, numero: 'O-2', note: null, righe: 0 },
  ];
  const table: NodeDefinition = {
    type: 'table',
    source: 'dati',
    columns: [{ field: 'numero', label: 'Numero' }],
    expand: {
      expandIf: '{{ row.righe > 0 }}',
      components: [
        { type: 'text', text: 'Note di {{ row.numero }}: {{ row.note }}' },
        { type: 'button', label: 'Segnala', onClick: [{ toast: 'segnalato {{ row.id }}' }] },
      ],
    },
  };
  const dataSources = { dati: { type: 'rest' as const, method: 'GET' as const, url: '/api/dati' } };

  it('apre e chiude l’area sotto la riga; i nodi vedono la riga; expandIf decide quali righe si aprono', async () => {
    const h = await renderScreen({ components: [table], dataSources, respond: () => rows });
    await h.until(() => columnTexts(h.el, 1).length === 2, 'righe');
    const toggles = [...h.el.querySelectorAll<HTMLButtonElement>('button.ant-table-row-expand-icon')];
    // La seconda riga non ha righe: niente pulsante.
    expect(toggles).toHaveLength(1);
    expect(toggles[0].getAttribute('aria-expanded')).toBe('false');
    expect(toggles[0].getAttribute('aria-label')).toBe('Mostra i dettagli della riga');
    toggles[0].click();
    await h.settle();
    const area = h.el.querySelector('tr.lc-extra-row');
    expect(plain(area?.textContent)).toContain('Note di O-1: Consegna al mattino');
    expect(area?.querySelector('td')?.getAttribute('colspan')).toBe('2');
    expect(toggles[0].getAttribute('aria-expanded')).toBe('true');
    (area!.querySelector('button') as HTMLButtonElement).click();
    await h.until(() => h.toasts.length === 1, 'azione nell’area');
    expect(h.toasts).toEqual(['segnalato 1']);
    toggles[0].click();
    await h.settle();
    expect(h.el.querySelector('tr.lc-extra-row')).toBeNull();
  });
});
