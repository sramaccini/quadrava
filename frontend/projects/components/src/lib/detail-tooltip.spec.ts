import type { NodeDefinition } from 'schema';
import { plain, renderScreen } from './screen-testing';

describe('tooltip in the detail card', () => {
  afterEach(() => document.querySelectorAll('.cdk-overlay-container').forEach((c) => (c.innerHTML = '')));

  const detail: NodeDefinition = {
    type: 'detail',
    source: 'order',
    fields: [
      { field: 'number', label: 'Number' },
      { field: 'discount', label: 'Discount', format: 'percent', tooltip: 'Discount for {{ user.username }} <b>x</b>' },
    ],
  };
  const dataSources = { order: { type: 'rest' as const, method: 'GET' as const, url: '/api/order' } };

  it('only fields with a tooltip have the help icon, reachable from the keyboard, with the text as text', async () => {
    const h = await renderScreen({ components: [detail], dataSources, respond: () => ({ number: 'O-1', discount: 10 }) });
    await h.until(() => h.el.querySelectorAll('.ant-descriptions-item-label').length === 2, 'detail');
    const labels = [...h.el.querySelectorAll('.ant-descriptions-item-label')];
    expect(labels[0].querySelector('.help')).toBeNull();
    const help = labels[1].querySelector('.help') as HTMLElement;
    expect(plain(labels[1].textContent)).toBe('Discount');
    expect(help.getAttribute('tabindex')).toBe('0');
    expect(help.getAttribute('aria-label')).toBe('Discount for u <b>x</b>');
    help.dispatchEvent(new MouseEvent('mouseenter'));
    await h.until(() => !!document.querySelector('.ant-tooltip-inner'), 'tooltip');
    expect(document.querySelector('.ant-tooltip-inner')?.textContent).toBe('Discount for u <b>x</b>');
    expect(document.querySelector('.ant-tooltip-inner b')).toBeNull();
  });
});
