import { Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ScreenDefinition, Step } from 'schema';
import { runSteps } from './action-engine';
import { ScreenRuntime } from './screen-runtime';
import { Fakes } from './testing';

const screen: ScreenDefinition = {
  schemaVersion: '1.0',
  screen: 'issue-detail',
  dataSources: { workflow: { type: 'rest', method: 'GET', url: '/api/workflow' } },
  components: [],
};

describe('view step', () => {
  let fakes: Fakes;
  let rt: ScreenRuntime;

  beforeEach(() => {
    fakes = new Fakes();
    rt = fakes.runtime(screen, TestBed.inject(Injector));
  });
  afterEach(() => rt.destroy());

  const steps: Step[] = [
    {
      view: {
        title: 'Workflow of {{ row.key }}',
        size: 'large',
        components: [
          { type: 'filterBar', bind: 'graphFilter', fields: [{ name: 'q', type: 'text' }] },
          { type: 'table', source: 'workflow', columns: [{ field: 'name' }] },
        ],
      },
    },
    { toast: 'closed' },
  ];
  const scope = { row: { key: 'WEB-4' } };

  it('opens the window with resolved title, size, components and close label; the sequence goes on when it closes', async () => {
    expect(await runSteps(rt, steps, scope)).toBe(true);
    const request = fakes.views[0];
    expect(request.title).toBe('Workflow of WEB-4');
    expect(request.size).toBe('large');
    expect(request.components.map((c) => c.type)).toEqual(['filterBar', 'table']);
    expect(request.closeLabel).toBe('Close');
    expect(request.scope).toEqual(scope);
    expect(request.runtime).toBe(rt);
    expect(fakes.toasts.map((t) => t.message)).toEqual(['closed']);
  });

  it('the components that write to the state get their initial value; medium size and a close label of its own', async () => {
    await runSteps(rt, [{ view: { title: 'T', closeLabel: 'Done with {{ row.key }}', components: [{ type: 'filterBar', bind: 'f', fields: [{ name: 'q', type: 'text' }] }] } }], scope);
    expect(rt.getState('f.q')).toBeNull();
    expect(fakes.views[0].size).toBe('medium');
    expect(fakes.views[0].closeLabel).toBe('Done with WEB-4');
  });

  it('without a window service it does not go on and reports it', async () => {
    const plain = new ScreenRuntime(screen, { ...fakes.deps, viewDialog: null }, TestBed.inject(Injector));
    expect(await runSteps(plain, steps, scope)).toBe(false);
    await Promise.resolve();
    expect(fakes.reports.map((r) => r.source)).toContain('view');
    expect(fakes.toasts).toEqual([]);
    plain.destroy();
  });
});
