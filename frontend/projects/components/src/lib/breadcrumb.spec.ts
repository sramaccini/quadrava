import { ScreenNavigator } from 'core';
import type { ScreenDefinition } from 'schema';
import { plain, renderScreen } from './screen-testing';

const project = { type: 'rest', method: 'GET', url: '/api/projects/{{ params.key }}' } as const;

/** The issue screen of a tracker: the path leads back to the list of projects, the project and its issues. */
const issue: ScreenDefinition = {
  schemaVersion: '1.0',
  screen: 'issue-detail',
  title: 'Issue',
  breadcrumb: [
    { label: 'Projects', navigate: 'project-list' },
    { label: "{{ has(data.project) ? data.project.name : '' }}", navigate: 'project-detail', params: { key: '{{ params.key }}' } },
    { label: 'Issues', navigate: 'issue-list', params: { key: '{{ params.key }}' } },
    { label: '{{ params.issue }}' },
  ],
  dataSources: { project },
  components: [],
};

const items = (el: HTMLElement): string[] => [...el.querySelectorAll('nz-breadcrumb-item .ant-breadcrumb-link')].map((n) => plain(n.textContent));
const links = (el: HTMLElement): HTMLAnchorElement[] => [...el.querySelectorAll<HTMLAnchorElement>('nz-breadcrumb a')];

describe('breadcrumb declared by the screen', () => {
  it('takes the place of the path of the host: the items that lead somewhere are links, the last is the screen itself', async () => {
    let answer: (value: unknown) => void = () => undefined;
    const navigator = {
      navigate: (screen: string, params: Record<string, unknown>) => navigations.push({ screen, params }),
      href: (screen: string, params: Record<string, unknown>) => `/work/${screen}?${new URLSearchParams(params as Record<string, string>)}`,
    };
    const navigations: { screen: string; params: Record<string, unknown> }[] = [];
    const { fixture, el, until, reports } = await renderScreen({
      components: [],
      respond: () => new Promise((resolve) => (answer = resolve)),
      extraProviders: [{ provide: ScreenNavigator, useValue: navigator }],
    });
    fixture.componentRef.setInput('breadcrumb', ['Work', 'Issues']);
    fixture.componentRef.setInput('params', { key: 'WEB', issue: 'WEB-4' });
    fixture.componentRef.setInput('definition', issue);
    // While the project loads, its item is empty: no expression error.
    await until(() => items(el).length === 4, 'breadcrumb');
    expect(items(el)).toEqual(['Projects', '', 'Issues', 'WEB-4']);
    answer({ name: 'Website relaunch' });
    await until(() => items(el)[1] === 'Website relaunch', 'project name');
    expect(reports).toEqual([]);

    expect(links(el).map((a) => [plain(a.textContent), a.getAttribute('href')])).toEqual([
      ['Projects', '/work/project-list?'],
      ['Website relaunch', '/work/project-detail?key=WEB'],
      ['Issues', '/work/issue-list?key=WEB'],
    ]);
    const current = el.querySelector('nz-breadcrumb-item:last-child [aria-current="page"]');
    expect(plain(current?.textContent)).toBe('WEB-4');

    links(el)[1].click();
    expect(navigations).toEqual([{ screen: 'project-detail', params: { key: 'WEB' } }]);
    // With a modifier the browser opens the address itself (a new tab).
    links(el)[0].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }));
    expect(navigations).toHaveLength(1);
  });

  it('without the address of the navigator the links still navigate', async () => {
    const { fixture, el, settle, navigations } = await renderScreen({ components: [] });
    fixture.componentRef.setInput('definition', { ...issue, breadcrumb: [{ label: 'Projects', navigate: 'project-list' }, { label: 'Detail' }], dataSources: {}, components: [] });
    await settle();
    const [link] = links(el);
    expect(link.getAttribute('href')).toBe('#');
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    expect(navigations).toEqual([{ screen: 'project-list', params: {} }]);
  });

  it('without a declaration the path of the host stays, as plain text with the last item as the current page', async () => {
    const { fixture, el, settle } = await renderScreen({ components: [] });
    fixture.componentRef.setInput('breadcrumb', ['Browse', 'Orders']);
    await settle();
    expect(items(el)).toEqual(['Browse', 'Orders']);
    expect(links(el)).toEqual([]);
    expect(plain(el.querySelector('[aria-current="page"]')?.textContent)).toBe('Orders');
  });
});
