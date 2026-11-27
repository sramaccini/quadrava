import type { DataRequest } from 'core';
import type { NodeDefinition } from 'schema';
import { plain, renderScreen, type ScreenHarness } from './screen-testing';

describe('actions under a form field', () => {
  const assignToMe = { label: 'Assign to me', value: '{{ user.username }}', visibleIf: '{{ value != user.username }}' };
  const dataSources = {
    issue: { type: 'rest' as const, method: 'GET' as const, url: '/api/issue' },
    patch: { type: 'rest' as const, method: 'PATCH' as const, url: '/api/issue', body: '{{ {field: value} }}' },
  };
  const item = (h: ScreenHarness, label: string): HTMLElement =>
    [...h.el.querySelectorAll<HTMLElement>('nz-form-item')].find((i) => plain(i.querySelector('nz-form-label')?.textContent) === label)!;
  const links = (h: ScreenHarness, label: string): HTMLButtonElement[] => [...item(h, label).querySelectorAll<HTMLButtonElement>('.field-actions button')];
  const patches = (h: ScreenHarness): unknown[] => h.requests.filter((r: DataRequest) => r.method === 'PATCH').map((r) => r.body);

  it('in an inline form, value puts the user in the field and saves it through onSave; the link then disappears', async () => {
    const form: NodeDefinition = {
      type: 'form',
      source: 'issue',
      edit: 'inline',
      fields: [{ name: 'assignee', type: 'text', label: 'Assignee', actions: [assignToMe] }],
      onSave: [{ call: 'patch' }, { toast: "{{ 'saved ' + field + '=' + string(value) }}" }],
    };
    const h = await renderScreen({ components: [form], dataSources, respond: (r) => (r.method === 'GET' ? { assignee: 'someone' } : {}) });
    await h.until(() => links(h, 'Assignee').length === 1, 'the link');
    const group = item(h, 'Assignee').querySelector('.field-actions')!;
    // Grouped under the label of the field, so a screen reader says which field the link belongs to.
    expect(group.getAttribute('role')).toBe('group');
    expect(group.getAttribute('aria-labelledby')).toBe(item(h, 'Assignee').querySelector('nz-form-label')!.id);
    expect(plain(links(h, 'Assignee')[0].textContent)).toBe('Assign to me');

    links(h, 'Assignee')[0].click();
    await h.until(() => h.toasts.includes('saved assignee=u'), 'saved');
    expect(patches(h)).toEqual([{ assignee: 'u' }]);
    await h.until(() => links(h, 'Assignee').length === 0, 'hidden once assigned');
    expect(plain(item(h, 'Assignee').querySelector('.view')?.textContent)).toBe('u');
    expect(h.reports).toEqual([]);
  });

  it('in a normal form, value only changes the field; onClick runs steps that see form, field and value', async () => {
    const form: NodeDefinition = {
      type: 'form',
      fields: [
        {
          name: 'assignee',
          type: 'text',
          label: 'Assignee',
          actions: [assignToMe, { label: 'Who is it?', icon: 'user', onClick: [{ toast: "{{ field + ': ' + value + ' / ' + form.title }}" }] }],
        },
        { name: 'title', type: 'text', label: 'Title' },
      ],
      initial: { assignee: 'someone', title: 'Login' },
      actions: [{ label: 'Save', onClick: [{ toast: '{{ form.assignee }}' }] }],
    };
    const h = await renderScreen({ components: [form], dataSources });
    await h.until(() => links(h, 'Assignee').length === 2, 'the links');
    links(h, 'Assignee')[1].click();
    await h.until(() => h.toasts.includes('assignee: someone / Login'), 'steps with the scope of the field');
    links(h, 'Assignee')[0].click();
    await h.until(() => item(h, 'Assignee').querySelector('input')?.value === 'u', 'value in the field');
    expect(links(h, 'Assignee').map((b) => plain(b.textContent))).toEqual(['Who is it?']);
    expect(patches(h)).toEqual([]);
    expect(h.reports).toEqual([]);
  });

  it('a value action is disabled while the field is read-only; enabledIf is respected', async () => {
    const form: NodeDefinition = {
      type: 'form',
      fields: [
        { name: 'assignee', type: 'text', label: 'Assignee', readOnlyIf: '{{ true }}', actions: [assignToMe, { label: 'Notify', enabledIf: '{{ false }}', onClick: [{ toast: 'x' }] }] },
      ],
    };
    const h = await renderScreen({ components: [form], dataSources });
    await h.until(() => links(h, 'Assignee').length === 2, 'the links');
    expect(links(h, 'Assignee').map((b) => b.disabled)).toEqual([true, true]);
  });
});
