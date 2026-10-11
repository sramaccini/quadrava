import type { NodeDefinition } from 'schema';
import { plain, renderScreen } from './screen-testing';

describe('tooltip nella scheda di dettaglio', () => {
  afterEach(() => document.querySelectorAll('.cdk-overlay-container').forEach((c) => (c.innerHTML = '')));

  const detail: NodeDefinition = {
    type: 'detail',
    source: 'ordine',
    fields: [
      { field: 'numero', label: 'Numero' },
      { field: 'sconto', label: 'Sconto', format: 'percent', tooltip: 'Sconto di {{ user.username }} <b>x</b>' },
    ],
  };
  const dataSources = { ordine: { type: 'rest' as const, method: 'GET' as const, url: '/api/ordine' } };

  it('solo i campi con tooltip hanno l’icona di aiuto, raggiungibile da tastiera, con il testo come testo', async () => {
    const h = await renderScreen({ components: [detail], dataSources, respond: () => ({ numero: 'O-1', sconto: 10 }) });
    await h.until(() => h.el.querySelectorAll('.ant-descriptions-item-label').length === 2, 'dettaglio');
    const labels = [...h.el.querySelectorAll('.ant-descriptions-item-label')];
    expect(labels[0].querySelector('.help')).toBeNull();
    const help = labels[1].querySelector('.help') as HTMLElement;
    expect(plain(labels[1].textContent)).toBe('Sconto');
    expect(help.getAttribute('tabindex')).toBe('0');
    expect(help.getAttribute('aria-label')).toBe('Sconto di u <b>x</b>');
    help.dispatchEvent(new MouseEvent('mouseenter'));
    await h.until(() => !!document.querySelector('.ant-tooltip-inner'), 'tooltip');
    expect(document.querySelector('.ant-tooltip-inner')?.textContent).toBe('Sconto di u <b>x</b>');
    expect(document.querySelector('.ant-tooltip-inner b')).toBeNull();
  });
});
