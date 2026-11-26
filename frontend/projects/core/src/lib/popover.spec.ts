import { Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ScreenDefinition, Step } from 'schema';
import { runSteps } from './action-engine';
import { ScreenRuntime } from './screen-runtime';
import { Fakes } from './testing';

const screen: ScreenDefinition = { schemaVersion: '1.0', screen: 'issue-detail', components: [] };

describe('popover step', () => {
  let fakes: Fakes;
  let rt: ScreenRuntime;

  beforeEach(() => {
    fakes = new Fakes();
    rt = fakes.runtime(screen, TestBed.inject(Injector));
  });
  afterEach(() => rt.destroy());

  const onSubmit: Step[] = [{ toast: 'Comment: {{ form.comment }}' }];
  const steps: Step[] = [
    { set: { path: 'state.flagged', value: true } },
    {
      popover: {
        title: 'Flag added to {{ row.key }}',
        icon: 'flag',
        tone: 'danger',
        fields: [{ name: 'comment', type: 'textarea' }],
        submitLabel: 'Add comment',
        submitEnabledIf: "{{ isValid('required', form.comment) }}",
        onSubmit,
      },
    },
    { toast: 'done' },
  ];
  const scope = { row: { key: 'WEB-4' } };

  it('opens the panel with the resolved title, icon, tone and a form whose button follows submitEnabledIf', async () => {
    fakes.dialogValues.push({ comment: 'Blocked by the API' });
    expect(await runSteps(rt, steps, scope)).toBe(true);
    const request = fakes.popovers[0];
    expect(request.title).toBe('Flag added to WEB-4');
    expect(request.icon).toBe('flag');
    expect(request.tone).toBe('danger');
    expect(request.form.fields?.map((f) => f.name)).toEqual(['comment']);
    expect(request.form.actions).toEqual([
      { label: 'Add comment', onClick: onSubmit, enabledIf: "{{ isValid('required', form.comment) }}" },
    ]);
    expect(fakes.toasts.map((t) => t.message)).toEqual(['Comment: Blocked by the API', 'done']);
    expect(fakes.dialogs).toEqual([]);
  });

  it('closed by the user, the sequence stops silently; the steps before it stay done', async () => {
    expect(await runSteps(rt, steps, scope)).toBe(false);
    expect(rt.getState('flagged')).toBe(true);
    expect(fakes.toasts).toEqual([]);
    expect(fakes.reports).toEqual([]);
  });

  it('without a service for panels it opens as a form window; without that either it does not go on', async () => {
    fakes.deps.formPopover = null;
    fakes.dialogValues.push({ comment: 'x' });
    const fallback = fakes.runtime(screen, TestBed.inject(Injector));
    expect(await runSteps(fallback, steps, scope)).toBe(true);
    expect(fakes.dialogs[0].title).toBe('Flag added to WEB-4');
    expect(fakes.dialogs[0].form.actions?.[0].label).toBe('Add comment');
    fallback.destroy();

    Object.assign(fakes.deps, { formDialog: null });
    const none = fakes.runtime(screen, TestBed.inject(Injector));
    expect(await runSteps(none, steps, scope)).toBe(false);
    expect(fakes.reports.map((r) => r.source)).toEqual(['popover']);
    none.destroy();
  });

  it('the confirm label is translated when absent; the tone is neutral', async () => {
    fakes.dialogValues.push({});
    await runSteps(rt, [{ popover: { title: 'Note', fields: [{ name: 'note', type: 'text' }], onSubmit: [{ toast: 'ok' }] } }]);
    expect(fakes.popovers[0].form.actions?.[0]).toEqual({ label: 'Confirm', onClick: [{ toast: 'ok' }] });
    expect(fakes.popovers[0].tone).toBe('neutral');
  });
});
