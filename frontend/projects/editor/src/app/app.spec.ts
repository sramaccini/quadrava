import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { vi } from 'vitest';
import layout from '../../public/examples/screens/showcase-layout.json';
import { Confirmation, I18n, Notifier } from 'core';
import { App } from './app';
import { appConfig } from './app.config';
import { EditorStore } from './model/editor-store';
import { getIn as getAt, type Json } from './model/doc-ops';
import { NavigationStore } from './model/navigation-store';
import { Project } from './model/project';
import { ProjectCommands } from './model/project-commands';
import { MemoryFolder } from './model/project-folder';
import { Workspace } from './model/workspace';
import { EDITOR_REDIRECT } from './model/registry-client';
import { PreviewComponent } from './preview/preview.component';
import { isToPreview, type PreviewState } from './preview/protocol';

const FILES: Record<string, unknown> = {
  'examples/files.json': ['navigation.json', 'project.json', 'screens/showcase-layout.json'],
  'examples/screens/showcase-layout.json': layout,
};
/** The project the tests work in: a folder in memory with the manifest and the navigation. */
const PROJECT_FILES = {
  'project.json': JSON.stringify({ schemaVersion: '1.0', project: 'test', name: 'Test application', languages: ['en', 'it'], defaultLanguage: 'en' }),
  'navigation.json': JSON.stringify({ schemaVersion: '1.0', navigation: 'app', areas: [{ id: 'main', label: 'Main', items: [{ id: 'home', label: 'Home', screen: 'new-screen' }] }] }),
};

describe('screen editor', () => {
  let fixture: ComponentFixture<App>;
  let el: HTMLElement;
  let store: EditorStore;
  let workspace: Workspace;
  let folder: MemoryFolder;
  /** Page changes requested by the editor (BFF login). */
  let redirects: string[];

  beforeEach(async () => {
    localStorage.clear();
    if (typeof Element.prototype.scrollTo !== 'function') Element.prototype.scrollTo = () => undefined;
    vi.stubGlobal('fetch', async (url: string) => {
      const body = FILES[url];
      return body ? { ok: true, status: 200, json: async () => body } : { ok: false, status: 404, json: async () => ({}) };
    });
    redirects = [];
    TestBed.configureTestingModule({ providers: [...appConfig.providers, { provide: EDITOR_REDIRECT, useValue: (url: string) => redirects.push(url) }] });
    fixture = TestBed.createComponent(App);
    el = fixture.nativeElement as HTMLElement;
    workspace = TestBed.inject(Workspace);
    folder = new MemoryFolder('test', PROJECT_FILES);
    await TestBed.inject(ProjectCommands).open(folder);
    // Most of the tests work on a screen: it opens in the first window, a new screen not saved in the project yet.
    store = workspace.open('screen').injector.get(EditorStore);
    await settle();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.querySelectorAll('.cdk-overlay-container').forEach((n) => n.remove());
  });

  async function settle(): Promise<void> {
    for (let i = 0; i < 3; i++) {
      fixture.detectChanges();
      await fixture.whenStable();
    }
  }

  async function until(condition: () => boolean, label: string): Promise<void> {
    for (let i = 0; i < 60; i++) {
      await settle();
      if (condition()) return;
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error(`timeout: ${label}`);
  }

  const outline = (): string[] => [...el.querySelectorAll('ed-outline .branch button.row')].map((b) => b.querySelector('.label')!.textContent!.trim());
  /**
   * States sent to the iframe of a preview. In jsdom the iframe does not load the application: its «ready» is simulated
   * and what the editor sends it is recorded.
   */
  const posted = new Map<Window, PreviewState[]>();
  async function frameWindow(host: string): Promise<Window> {
    await until(() => !!el.querySelector(`${host} iframe`), `iframe di ${host}`);
    const win = (el.querySelector(`${host} iframe`) as HTMLIFrameElement).contentWindow!;
    if (!posted.has(win)) {
      posted.set(win, []);
      vi.spyOn(win, 'postMessage').mockImplementation((message: unknown) => {
        if (isToPreview(message)) posted.get(win)!.push(message.state);
      });
      window.dispatchEvent(new MessageEvent('message', { data: { type: 'lc-preview:ready' }, origin: location.origin, source: win }));
      await settle();
    }
    return win;
  }
  async function untilState(host: string, condition: (state: PreviewState) => boolean, label: string): Promise<PreviewState> {
    const win = await frameWindow(host);
    await until(() => {
      const last = posted.get(win)!.at(-1);
      return !!last && condition(last);
    }, label);
    return posted.get(win)!.at(-1)!;
  }
  /** A message from the iframe of a preview to the editor. */
  async function fromFrame(host: string, data: unknown): Promise<void> {
    const win = await frameWindow(host);
    window.dispatchEvent(new MessageEvent('message', { data, origin: location.origin, source: win }));
    await settle();
  }
  const screenOf = (state: PreviewState): Json => state.screen as unknown as Json;
  const type = (input: HTMLInputElement | HTMLTextAreaElement, value: string): void => {
    input.value = value;
    input.dispatchEvent(new Event('input'));
  };
  const tab = (index: number): void => (el.querySelectorAll('.center .ant-tabs-tab')[index] as HTMLElement).click();
  /** A command of the menu bar, as the user chooses it: opens the menu and clicks the item. */
  async function menuCommand(menu: string, item: string): Promise<void> {
    (el.querySelector(`ed-menu-bar [data-menu="${menu}"]`) as HTMLButtonElement).click();
    await settle();
    (el.querySelector(`ed-menu-bar [data-item="${item}"]`) as HTMLButtonElement).click();
    await settle();
  }

  /** A command of a submenu (File › New › Navigation): opens the menu, the submenu and clicks the item. */
  async function subCommand(menu: string, item: string, child: string): Promise<void> {
    (el.querySelector(`ed-menu-bar [data-menu="${menu}"]`) as HTMLButtonElement).click();
    await settle();
    (el.querySelector(`ed-menu-bar [data-item="${item}"]`) as HTMLButtonElement).click();
    await settle();
    (el.querySelector(`ed-menu-bar [data-item="${child}"]`) as HTMLButtonElement).click();
    await settle();
  }

  /** File › New › kind, giving the name in the dialog: the resource is created when the dialog has closed. */
  async function createViaDialog(kind: string, title: string): Promise<void> {
    await subCommand('file', 'new', 'new-' + kind);
    await until(() => !!document.querySelector('#new-screen-title'), 'dialog of the new resource');
    type(document.querySelector('#new-screen-title') as HTMLInputElement, title);
    await settle();
    document.querySelector('ed-new-screen form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await until(() => workspace.active()?.kind === kind, 'new resource open');
  }

  /** Closes the project and opens a new screen outside it (the languages are then those of the screen's draft). */
  async function withoutProject(): Promise<void> {
    await TestBed.inject(ProjectCommands).close();
    store = workspace.open('screen').injector.get(EditorStore);
    await settle();
  }

  /** Like menuCommand, but for a registry item: waits until the registry check (when the menu opens) enables it. */
  async function registryCommand(item: string): Promise<void> {
    (el.querySelector('ed-menu-bar [data-menu="file"]') as HTMLButtonElement).click();
    await until(() => el.querySelector(`ed-menu-bar [data-item="${item}"]`)?.getAttribute('aria-disabled') !== 'true', `item ${item} enabled`);
    (el.querySelector(`ed-menu-bar [data-item="${item}"]`) as HTMLButtonElement).click();
    await settle();
  }

  it('from the palette to the outline, to the properties and to the preview', async () => {
    expect(el.querySelector('ed-outline .empty')).not.toBeNull();
    (el.querySelector('ed-palette button[data-type="section"]') as HTMLButtonElement).click();
    await settle();
    expect(outline()).toEqual(['Section']);
    expect(el.querySelector('ed-inspector .kind')?.textContent).toBe('Section');
    type(el.querySelector('#prop-title') as HTMLTextAreaElement, 'Summary');
    await untilState('ed-preview', (st) => getAt(screenOf(st), ['components', 0, 'title']) === 'Summary', 'title in the preview');
    // The property text has the coloured syntax behind the text area (also with an expression).
    const title = el.querySelector('#prop-title') as HTMLTextAreaElement;
    type(title, "Riepilogo {{ state.n }}");
    await settle();
    const layer = title.previousElementSibling as HTMLElement;
    expect(layer.classList.contains('ed-code-layer')).toBe(true);
    expect([...layer.querySelectorAll('span')].map((s) => s.className)).toEqual(['ed-code-delimiter', 'ed-code-variable', 'ed-code-punctuation', 'ed-code-property', 'ed-code-delimiter']);
    type(title, 'Summary');
    await settle();
    // The next node ends up inside the selected section.
    (el.querySelector('ed-palette button[data-type="alert"]') as HTMLButtonElement).click();
    await untilState('ed-preview', (st) => getAt(screenOf(st), ['components', 0, 'components', 0, 'type']) === 'alert', 'message inside the section');
    expect(store.selection()).toEqual(['components', 0, 'components', 0]);
    expect(el.querySelector('.status')?.textContent).toContain('Valid');
  });

  it('menu bar: Edit acts on the selection, File opens an example from the submenu', async () => {
    const bar = el.querySelector('ed-menu-bar [role="menubar"]') as HTMLElement;
    expect([...bar.querySelectorAll(':scope > li > [role="menuitem"]')].map((b) => b.textContent?.trim())).toEqual(['File', 'Edit', 'View', 'Window', 'Help']);
    const item = (id: string) => el.querySelector(`ed-menu-bar [data-item="${id}"]`) as HTMLButtonElement | null;

    // Without a selection the selection commands are off and do nothing.
    (el.querySelector('ed-menu-bar [data-menu="edit"]') as HTMLButtonElement).click();
    await settle();
    expect(item('duplicate')?.getAttribute('aria-disabled')).toBe('true');
    expect(item('undo')?.getAttribute('aria-disabled')).toBe('true');
    expect(item('delete')?.querySelector('.shortcut')?.textContent).toBe('Del');
    item('duplicate')!.click();
    await settle();
    expect(item('duplicate')).not.toBeNull();
    // A click outside closes the menu.
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await settle();
    expect(item('duplicate')).toBeNull();

    (el.querySelector('ed-palette button[data-type="section"]') as HTMLButtonElement).click();
    await settle();
    await menuCommand('edit', 'duplicate');
    expect(outline()).toEqual(['Section', 'Section']);
    await menuCommand('edit', 'undo');
    expect(outline()).toEqual(['Section']);
    store.select(['components', 0]);
    await settle();
    await menuCommand('edit', 'delete');
    expect(store.doc()).toMatchObject({ components: [] });

    // File → Open example → showcase-layout.
    (el.querySelector('ed-menu-bar [data-menu="file"]') as HTMLButtonElement).click();
    await settle();
    expect([...el.querySelectorAll('ed-menu-bar [data-level="0"] .label')].map((l) => l.textContent)).toEqual([
      'New project…',
      'Open the demo project',
      'Import project (zip)…',
      'Export project (zip)',
      'Close project',
      'New',
      'Import file…',
      'Import example',
      'Open from registry',
      'Save',
      'Save all',
      'Export…',
      'Save to registry',
      'Publish project to registry…',
      'Registry…',
      'Review versions in registry…',
      'Close',
      'Close all',
    ]);
    item('new')!.click();
    await settle();
    expect([...el.querySelectorAll('ed-menu-bar [data-level="1"] .label')].map((l) => l.textContent)).toEqual(['Screen…', 'Data sources…', 'Navigation', 'Theme']);
    item('open-example')!.click();
    await until(() => !!item('example:screens/showcase-layout'), 'examples in the submenu');
    expect(item('example:navigation')).not.toBeNull();
    // The example is copied into the project and opens in a new window, in front; the screen open before stays as it was.
    item('example:screens/showcase-layout')!.click();
    await until(() => workspace.windows().length === 2, 'example opened');
    expect(workspace.name(workspace.active()!)).toBe('showcase-layout');
    expect(workspace.active()!.path()).toBe('screens/showcase-layout.json');
    expect(folder.files.has('screens/showcase-layout.json')).toBe(true);
    expect(store.doc()).toMatchObject({ screen: 'new-screen', components: [] });
    expect(item('open-example')).toBeNull();
  });

  it('panels hidden one by one as in IDEs: tab of the panel, the others stay in the column', async () => {
    const left = el.querySelector('ed-dock-side.left') as HTMLElement;
    const right = el.querySelector('ed-dock-side.right') as HTMLElement;
    const editor = el.querySelector('.editor') as HTMLElement;
    const pin = (panel: string) => el.querySelector(`[data-dock-pin="${panel}"]`) as HTMLButtonElement;
    const panel = (id: string) => el.querySelector(`[data-dock-panel="${id}"]`) as HTMLElement;
    const tabs = (side: HTMLElement) => [...side.querySelectorAll('.strip .tab')].map((t) => t.textContent?.trim());
    expect([pin('palette'), pin('outline'), pin('inspector')].map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'true', 'true']);
    expect(left.querySelector('.strip')).toBeNull();
    expect(editor.style.getPropertyValue('--ed-left')).toBe('280px');

    // Only the outline hides: «Outline» tab, the components stay in the column (wider than the strip).
    pin('outline').click();
    await settle();
    expect(tabs(left)).toEqual(['Outline']);
    expect(panel('palette').classList.contains('ed-docked')).toBe(true);
    expect(panel('outline').classList.contains('ed-floating')).toBe(true);
    expect(editor.style.getPropertyValue('--ed-left')).toBe('310px');
    // Just unpinned it stays open until the mouse leaves.
    expect(panel('outline').classList.contains('ed-open')).toBe(true);
    left.dispatchEvent(new Event('pointerleave'));
    await until(() => !panel('outline').classList.contains('ed-open'), 'closing when the mouse leaves');
    expect(JSON.parse(localStorage.getItem('lc.editor.dock')!)).toEqual({ pins: { project: true, palette: true, outline: false, inspector: true } });

    // The components too: only the strip is left, with the two tabs in the order of the panels.
    pin('palette').click();
    await settle();
    left.dispatchEvent(new Event('pointerleave'));
    await until(() => !panel('palette').classList.contains('ed-open'), 'closing');
    expect(tabs(left)).toEqual(['Components', 'Outline']);
    // The project panel stays in the column, with the strip of the hidden ones next to it.
    expect(editor.style.getPropertyValue('--ed-left')).toBe('310px');
    expect(panel('project').classList.contains('ed-docked')).toBe(true);

    // Hovering a tab opens only its panel (after a short wait; a quick pass does not).
    const tab = (id: string) => left.querySelector(`.tab[data-dock-tab="${id}"]`) as HTMLButtonElement;
    tab('outline').dispatchEvent(new Event('pointerenter'));
    tab('outline').dispatchEvent(new Event('pointerleave'));
    await new Promise((r) => setTimeout(r, 250));
    await settle();
    expect(panel('outline').classList.contains('ed-open')).toBe(false);
    left.dispatchEvent(new Event('pointerenter'));
    tab('outline').dispatchEvent(new Event('pointerenter'));
    await until(() => panel('outline').classList.contains('ed-open'), 'opening on hover');
    expect(panel('palette').classList.contains('ed-open')).toBe(false);
    expect(tab('outline').getAttribute('aria-expanded')).toBe('true');
    // Moving to the other tab opens the other panel.
    tab('palette').dispatchEvent(new Event('pointerenter'));
    await until(() => panel('palette').classList.contains('ed-open') && !panel('outline').classList.contains('ed-open'), 'panel change');

    // Dragging a palette component towards the preview closes the panel.
    el.querySelector('ed-palette button[data-type="section"]')!.dispatchEvent(new Event('dragstart', { bubbles: true }));
    await until(() => !panel('palette').classList.contains('ed-open'), 'closing while dragging');

    // On the right: with the focus in a field it stays open even with the mouse outside; Esc closes it and goes back to the tab.
    pin('inspector').click();
    await settle();
    const field = panel('inspector').querySelector('input, textarea') as HTMLInputElement;
    field.focus();
    right.dispatchEvent(new Event('pointerleave'));
    await new Promise((r) => setTimeout(r, 500));
    await settle();
    expect(panel('inspector').classList.contains('ed-open')).toBe(true);
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await settle();
    expect(panel('inspector').classList.contains('ed-open')).toBe(false);
    expect(document.activeElement?.getAttribute('data-dock-tab')).toBe('inspector');
    // A click on the tab opens at once.
    (document.activeElement as HTMLButtonElement).click();
    await settle();
    expect(panel('inspector').classList.contains('ed-open')).toBe(true);

    // Pinned again, they go back to the columns; the choice stays for the next visit.
    pin('inspector').click();
    pin('palette').click();
    pin('outline').click();
    await settle();
    expect(left.querySelector('.strip')).toBeNull();
    expect(right.querySelector('.strip')).toBeNull();
    expect(JSON.parse(localStorage.getItem('lc.editor.dock')!)).toEqual({ pins: { project: true, palette: true, outline: true, inspector: true } });
  });

  it('the side panels follow the active window: each kind has its own; a hidden panel is hidden for all the kinds', async () => {
    await subCommand('file', 'new', 'new-navigation');
    expect(workspace.active()?.kind).toBe('navigation');
    expect(el.querySelector('ed-palette')).toBeNull();
    expect(el.querySelector('ed-outline')).toBeNull();
    expect([...el.querySelectorAll('[data-dock-pin]')].map((p) => p.getAttribute('data-dock-pin'))).toEqual(['project', 'outline', 'inspector']);
    (el.querySelector('ed-nav-outline [data-dock-pin="outline"]') as HTMLButtonElement).click();
    await settle();
    const editor = el.querySelector('.editor') as HTMLElement;
    const left = el.querySelector('ed-dock-side.left') as HTMLElement;
    const outline = el.querySelector('ed-nav-outline') as HTMLElement;
    expect(editor.style.getPropertyValue('--ed-left')).toBe('310px');
    expect([...left.querySelectorAll('.strip .tab')].map((t) => t.textContent?.trim())).toEqual(['Outline']);
    left.dispatchEvent(new Event('pointerleave'));
    await until(() => !outline.classList.contains('ed-open'), 'closing in navigation');
    left.dispatchEvent(new Event('pointerenter'));
    left.querySelector('.tab')!.dispatchEvent(new Event('pointerenter'));
    await until(() => outline.classList.contains('ed-open'), 'opening in navigation');

    // Theme (named in the dialog): on the left only the project panel, on the right the properties.
    await createViaDialog('theme', 'Ocean');
    expect(workspace.name(workspace.active()!)).toBe('ocean');
    expect(folder.files.has('themes/ocean.json')).toBe(true);
    expect(el.querySelector('ed-nav-outline')).toBeNull();
    expect(el.querySelector('ed-dock-side.left ed-project-panel')).not.toBeNull();
    (el.querySelector('ed-theme-inspector [data-dock-pin="inspector"]') as HTMLButtonElement).click();
    await settle();
    expect(editor.style.getPropertyValue('--ed-right')).toBe('30px');
    expect([...el.querySelectorAll('ed-dock-side.right .strip .tab')].map((t) => t.textContent?.trim())).toEqual(['Properties']);

    // Back to the screen (its button in the bar of the workspace): its panels, with the choices made in the other kinds.
    (el.querySelector(`ed-workspace [data-task="${workspace.windows()[0].id}"]`) as HTMLButtonElement).click();
    await settle();
    expect(workspace.active()?.kind).toBe('screen');
    expect(el.querySelector('ed-palette')).not.toBeNull();
    expect([...el.querySelectorAll('ed-dock-side.left .strip .tab')].map((t) => t.textContent?.trim())).toEqual(['Outline']);
    expect([...el.querySelectorAll('ed-dock-side.right .strip .tab')].map((t) => t.textContent?.trim())).toEqual(['Properties']);
  });

  it('two screens in two windows: palette, outline, properties and problems show the one in front', async () => {
    store.addNode('section');
    const other = workspace.open('screen', { schemaVersion: '1.0', screen: 'second', components: [{ id: 'note', type: 'alert', text: 'Hi', tone: 'nope' }] });
    await settle();
    expect(el.querySelectorAll('ed-document-window')).toHaveLength(2);
    expect(outline()).toEqual(['Message']);
    expect(el.querySelector('.bottom')?.textContent).toContain('(1)');
    expect(el.querySelector('.status')?.textContent).toContain('Errors: 1');
    // The palette adds to the screen in front.
    other.state.select([]);
    (el.querySelector('ed-palette button[data-type="text"]') as HTMLButtonElement).click();
    await settle();
    expect(getAt(other.state.doc(), ['components', 1, 'type'])).toBe('text');
    // A click in the other window brings it in front: the panels follow it.
    const first = el.querySelector(`ed-document-window[data-window="${workspace.windows()[0].id}"]`) as HTMLElement;
    first.dispatchEvent(new Event('pointerdown'));
    await settle();
    expect(workspace.active()?.id).toBe(workspace.windows()[0].id);
    expect(outline()).toEqual(['Section']);
    expect(el.querySelector('ed-inspector .kind')?.textContent).toBe('Section');
    expect(el.querySelector('.status')?.textContent).toContain('Valid');
    // Ctrl+F6 goes to the next window; the Window menu lists them.
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'F6', ctrlKey: true, bubbles: true }));
    await settle();
    expect(workspace.active()).toBe(other);
    (el.querySelector('ed-menu-bar [data-menu="window"]') as HTMLButtonElement).click();
    await settle();
    expect([...el.querySelectorAll('ed-menu-bar [data-item^="window-"]')].map((i) => [i.querySelector('.label')?.textContent, i.getAttribute('aria-checked')])).toEqual([
      ['new-screen — Screen', 'false'],
      ['second — Screen', 'true'],
    ]);
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await settle();
  });

  it('windows: maximized, minimized to the bar and restored, closed asking first when there are unsaved changes', async () => {
    const confirm = vi.spyOn(TestBed.inject(Confirmation), 'confirm');
    const win = () => el.querySelector('ed-document-window') as HTMLElement;
    (win().querySelector('[data-control="maximize"]') as HTMLButtonElement).click();
    await settle();
    expect(win().classList.contains('maximized')).toBe(true);
    expect(win().querySelector('[data-control="maximize"]')?.getAttribute('aria-label')).toBe('Restore');
    (win().querySelector('.caption') as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await settle();
    expect(win().classList.contains('maximized')).toBe(false);
    // Arrows on the title move the window, Shift+arrows resize it.
    const before = workspace.active()!.bounds();
    (win().querySelector('.caption') as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    (win().querySelector('.caption') as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', shiftKey: true, bubbles: true }));
    await settle();
    expect(workspace.active()!.bounds()).toEqual({ ...before, x: before.x + 16, height: before.height + 16 });
    (win().querySelector('[data-control="minimize"]') as HTMLButtonElement).click();
    await settle();
    expect(win().classList.contains('minimized')).toBe(true);
    expect(workspace.active()).toBeNull();
    expect(el.querySelector('ed-palette')).toBeNull();
    const task = el.querySelector('ed-workspace .task') as HTMLButtonElement;
    expect([task.textContent?.trim(), task.getAttribute('aria-pressed')]).toEqual(['new-screen — Screen', 'false']);
    task.click();
    await settle();
    expect(win().classList.contains('minimized')).toBe(false);
    expect(el.querySelector('ed-palette')).not.toBeNull();
    // A change: the title bar shows it, and closing asks first.
    store.addNode('alert');
    await settle();
    expect(win().querySelector('[data-unsaved]')).not.toBeNull();
    confirm.mockResolvedValueOnce(false);
    (win().querySelector('[data-control="close"]') as HTMLButtonElement).click();
    await settle();
    expect(confirm).toHaveBeenCalledWith('«new-screen — Screen» has unsaved changes. Close it anyway?');
    expect(workspace.windows()).toHaveLength(1);
    confirm.mockResolvedValueOnce(true);
    await menuCommand('file', 'close');
    await until(() => !workspace.windows().length, 'closed');
    // Empty workspace: the invitation to create or open a document.
    expect(el.querySelector('ed-workspace .empty h2')?.textContent).toBe('No document open');
    (el.querySelector('ed-workspace [data-new="navigation"]') as HTMLButtonElement).click();
    await until(() => workspace.active()?.kind === 'navigation', 'navigation of the project open');
    expect(workspace.active()?.path()).toBe('navigation.json');
  });

  it('data sources of the project: a screen refers to one and the preview resolves it; one written in the screen moves to the project', async () => {
    folder.files.set(
      'datasources/orders.json',
      JSON.stringify({ schemaVersion: '1.0', datasources: 'orders', sources: { list: { type: 'rest', method: 'GET', url: '/api/orders', params: { size: 20 } } } }),
    );
    await TestBed.inject(Project).refresh();
    await settle();
    tab(2);
    await settle();
    (el.querySelector('[data-add-ref]') as HTMLButtonElement).click();
    await settle();
    expect(store.doc()).toMatchObject({ dataSources: { list: { ref: 'orders/list' } } });
    expect(el.querySelector('[data-target="list"]')?.textContent).toBe('GET /api/orders');
    // The preview receives the screen with the reference resolved; the screen keeps the reference.
    await untilState('ed-preview', (st) => (screenOf(st) as { dataSources?: Record<string, { url?: string }> }).dataSources?.['list']?.url === '/api/orders', 'resolved in the preview');
    // A data source written in the screen moves into the project and a reference stays.
    store.addSource();
    await settle();
    (el.querySelector('[data-move="data"]') as HTMLButtonElement).click();
    await until(() => !!document.querySelector('#move-document'), 'move dialog');
    type(document.querySelector('#move-name') as HTMLInputElement, 'all');
    await settle();
    document.querySelector('form.move')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await until(() => JSON.parse(folder.files.get('datasources/orders.json')!).sources.all !== undefined, 'moved into the project');
    expect(getAt(store.doc(), ['dataSources', 'data'])).toEqual({ ref: 'orders/all' });
    // A reference that does not resolve is a warning.
    store.setValue(['dataSources', 'data', 'ref'], 'orders/missing');
    await settle();
    expect(el.querySelector('.bottom')?.textContent).toContain('The data source orders/missing is not in the project');
  });

  it('translations with a project: its languages and catalogues; the texts written in a screen go into them when it is saved', async () => {
    folder.files.set('i18n/en.json', JSON.stringify({ 'greet.hello': 'Hello' }));
    folder.files.set('i18n/it.json', JSON.stringify({}));
    await TestBed.inject(Project).refresh();
    (el.querySelector('ed-palette button[data-type="text"]') as HTMLButtonElement).click();
    await settle();
    store.setValue(['components', 0, 'text'], "{{ t('greet.hello', 'Hi') }}");
    tab(3);
    await settle();
    // The languages are those of the project, managed in its settings; the texts come from its catalogues.
    expect(el.querySelector('ed-texts [data-add-language]')).toBeNull();
    expect(el.querySelector('ed-texts .project-note')).not.toBeNull();
    expect(store.translation('en', 'greet.hello')).toBe('Hello');
    expect(store.missingLocales({ key: 'greet.hello', fallback: 'Hi' } as never)).toEqual(['it']);
    store.setTranslation('it', 'greet.hello', 'Ciao');
    await settle();
    expect(el.querySelector('ed-document-window [data-unsaved]')).not.toBeNull();
    // The preview uses the catalogues of the project, with the translation not saved yet.
    await untilState('ed-preview', (st) => st.translations['it']?.['greet.hello'] === 'Ciao' && st.translations['en']?.['greet.hello'] === 'Hello', 'catalogues in the preview');
    await menuCommand('file', 'save');
    await until(() => JSON.parse(folder.files.get('i18n/it.json')!)['greet.hello'] === 'Ciao', 'translation saved in the catalogue');
    expect(store.translations()).toEqual({});
    expect(store.translation('it', 'greet.hello')).toBe('Ciao');
    // The catalogue opens in its window: the keys with the text of the default language next to them.
    (el.querySelector('ed-project-panel [data-resource="i18n/it.json"]') as HTMLButtonElement).click();
    await until(() => workspace.active()?.kind === 'messages', 'catalogue open');
    const catalogue = el.querySelector('ed-messages-editor') as HTMLElement;
    expect((catalogue.querySelector('[data-text="greet.hello"]') as HTMLTextAreaElement).value).toBe('Ciao');
    expect(catalogue.querySelector('td.reference')?.textContent).toBe('Hello');
  });

  it('palette: the search filters while typing, Enter adds the first one found, Esc clears', async () => {
    const search = el.querySelector('[data-palette-search]') as HTMLInputElement;
    type(search, 'grid');
    await settle();
    expect([...el.querySelectorAll('ed-palette button[data-type]')].map((b) => b.getAttribute('data-type'))).toEqual(['grid']);
    search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await settle();
    expect(outline()).toEqual(['Grid']);
    type(search, 'zzz');
    await settle();
    expect(el.querySelector('ed-palette .none')?.textContent).toContain('No component');
    search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await settle();
    expect(el.querySelectorAll('ed-palette button[data-type]').length).toBeGreaterThan(30);
  });

  it('outline: branches to close and open, search, context menu with «Wrap in» also from the keyboard', async () => {
    const add = async (type: string) => {
      (el.querySelector(`ed-palette button[data-type="${type}"]`) as HTMLButtonElement).click();
      await settle();
    };
    await add('section');
    await add('box');
    await add('text');
    store.select([]);
    await settle();
    await add('alert');
    expect(outline()).toEqual(['Section', 'Box (row or column)', 'Text', 'Message']);
    // Closing and opening a branch; collapse and expand all.
    const twisty = () => el.querySelector('ed-outline .twisty') as HTMLButtonElement;
    expect(twisty().getAttribute('aria-expanded')).toBe('true');
    twisty().click();
    await settle();
    expect(outline()).toEqual(['Section', 'Message']);
    (el.querySelector('[data-outline="expand"]') as HTMLButtonElement).click();
    await settle();
    (el.querySelector('[data-outline="collapse"]') as HTMLButtonElement).click();
    await settle();
    expect(outline()).toEqual(['Section', 'Message']);
    // Selecting a node inside a closed branch opens it again.
    store.select(['components', 0, 'components', 0, 'components', 0]);
    await settle();
    expect(outline()).toEqual(['Section', 'Box (row or column)', 'Text', 'Message']);
    // Search: the nodes found with the branches containing them.
    const search = el.querySelector('ed-outline .search') as HTMLInputElement;
    type(search, 'text');
    await settle();
    expect(outline()).toEqual(['Section', 'Box (row or column)', 'Text']);
    expect(el.querySelector('ed-outline .line.match .label')?.textContent).toBe('Text');
    type(search, 'niente');
    await settle();
    expect(el.querySelector('ed-outline .empty')?.textContent).toContain('No node');
    type(search, '');
    await settle();
    // Context menu from the keyboard (Shift+F10) on the text: «Wrap in a grid».
    const row = el.querySelector('ed-outline .row[data-path="components/0/components/0/components/0"]') as HTMLButtonElement;
    row.dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true }));
    await settle();
    const menu = el.querySelector('ed-context-menu [role="menu"]') as HTMLElement;
    expect(menu).not.toBeNull();
    expect(document.activeElement?.getAttribute('data-item')).toBe('cut');
    expect(menu.querySelector('[data-item="paste"]')?.getAttribute('aria-disabled')).toBe('true');
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'End' }));
    expect(document.activeElement?.getAttribute('data-item')).toBe('select-parent');
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    expect(document.activeElement?.getAttribute('data-item')).toBe('wrap-grid');
    (document.activeElement as HTMLButtonElement).click();
    await settle();
    expect(el.querySelector('ed-context-menu')).toBeNull();
    expect(outline()).toEqual(['Section', 'Box (row or column)', 'Grid', 'Text', 'Message']);
    expect(store.selection()).toEqual(['components', 0, 'components', 0, 'components', 0]);
    // Right click on the message: Esc closes without doing anything; «Select the container» goes up.
    const line = el.querySelector('ed-outline .row[data-path="components/1"]')!.parentElement as HTMLElement;
    line.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 50, clientY: 50 }));
    await settle();
    expect(store.selection()).toEqual(['components', 1]);
    el.querySelector('ed-context-menu [role="menu"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await settle();
    expect(el.querySelector('ed-context-menu')).toBeNull();
    store.select(['components', 0, 'components', 0]);
    await settle();
    el.querySelector('ed-outline .row[data-path="components/0/components/0"]')!.parentElement!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    await settle();
    (el.querySelector('ed-context-menu [data-item="select-parent"]') as HTMLButtonElement).click();
    await settle();
    expect(store.selection()).toEqual(['components', 0]);
    expect(store.issues()).toEqual([]);
  });

  it('outline: several nodes with Ctrl+click and Shift+click, wrapped together from the context menu; Delete deletes them', async () => {
    for (const type of ['text', 'alert', 'button', 'text']) {
      store.select([]);
      (el.querySelector(`ed-palette button[data-type="${type}"]`) as HTMLButtonElement).click();
      await settle();
    }
    const row = (i: number) => el.querySelector(`ed-outline .row[data-path="components/${i}"]`) as HTMLButtonElement;
    row(0).click();
    row(2).dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));
    await settle();
    expect([...el.querySelectorAll('ed-outline .line.selected .row')].map((r) => r.getAttribute('data-path'))).toEqual(['components/0', 'components/2']);
    expect(el.querySelector('ed-outline .tools')).toBeNull();
    expect(el.querySelector('ed-inspector .multi')?.textContent).toContain('2 nodes selected');
    expect(row(0).textContent).toContain('selected together with others');
    // Shift+click: range from the first one chosen.
    row(1).click();
    row(3).dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
    await settle();
    expect(store.multi()).toEqual([['components', 1], ['components', 2], ['components', 3]]);
    // Shift+arrow up from row 3 narrows the range to 1–2.
    row(3).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', shiftKey: true, bubbles: true }));
    await settle();
    expect(store.multi()).toEqual([['components', 1], ['components', 2]]);
    // Context menu on a node of the selection: it applies to all.
    row(2).parentElement!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    await settle();
    expect([...el.querySelectorAll('ed-context-menu .item .label')].map((l) => l.textContent)).toEqual([
      'Wrap 2 nodes in a section',
      'Wrap 2 nodes in a box',
      'Wrap 2 nodes in a grid',
      'Delete 2 nodes',
    ]);
    (el.querySelector('ed-context-menu [data-item="wrap-box"]') as HTMLButtonElement).click();
    await settle();
    expect(outline()).toEqual(['Text', 'Box (row or column)', 'Message', 'Button', 'Text']);
    // Delete on a selection of several nodes deletes them all.
    store.select(['components', 0]);
    store.toggleSelect(['components', 2]);
    await settle();
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    await settle();
    expect(outline()).toEqual(['Box (row or column)', 'Message', 'Button']);
    expect(store.issues()).toEqual([]);
  });

  it('translations: the default language is changed from the panel and reaches the preview', async () => {
    await withoutProject();
    tab(3);
    await settle();
    (el.querySelector('ed-texts [data-language="it"] .make-default') as HTMLButtonElement).click();
    await settle();
    expect(store.defaultLanguage()).toBe('it');
    expect([...el.querySelectorAll('ed-texts .language .name')].map((n) => n.textContent)).toEqual(['Italian', 'English']);
    expect(el.querySelector('ed-texts [data-language="it"] .default')?.textContent).toBe('default');
    expect(el.querySelector('ed-texts [data-language="it"] .remove')).toBeNull();
    expect(el.querySelector('ed-texts [data-language="en"] .remove')).not.toBeNull();
    tab(0);
    await settle();
    await untilState('ed-preview', (st) => st.defaultLocale === 'it', 'default language in the preview');
  });

  it('data sources imported from OpenAPI (springdoc): read from the address, choice of the operations, sample data', async () => {
    const doc = {
      openapi: '3.0.1',
      info: { title: 'Accounting', version: '1' },
      servers: [{ url: 'http://localhost:8080' }],
      paths: {
        '/api/customers': {
          get: { tags: ['customers'], operationId: 'listCustomers', responses: { '200': { description: 'OK', content: { '*/*': { schema: { type: 'array', items: { type: 'object', properties: { name: { type: 'string', example: 'Smith' } } } } } } } } },
          post: { tags: ['customers'], operationId: 'createCustomer', requestBody: { content: { 'application/json': { schema: { type: 'object' } } } }, responses: { '200': { description: 'OK' } } },
        },
      },
    };
    const requested: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      requested.push(url);
      if (url === '/v3/api-docs') return { ok: true, status: 200, text: async () => JSON.stringify(doc) };
      return { ok: false, status: 404, text: async () => '' };
    });
    tab(2);
    await settle();
    (el.querySelector('[data-openapi-open]') as HTMLButtonElement).click();
    await until(() => !!document.querySelector('[data-openapi-url]'), 'import dialog');
    const url = document.querySelector('[data-openapi-url]') as HTMLInputElement;
    expect(url.value).toBe('/v3/api-docs');
    // Wrong address: the message tells the status.
    type(url, '/swagger-ui.html');
    url.form!.dispatchEvent(new Event('submit', { cancelable: true }));
    await until(() => !!document.querySelector('ed-openapi-import .error'), 'error');
    expect(document.querySelector('ed-openapi-import .error')?.textContent).toContain('404');
    type(url, 'javascript:alert(1)');
    url.form!.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();
    expect(document.querySelector('ed-openapi-import .error')?.textContent).toContain('Invalid address');
    expect(requested).toEqual(['/swagger-ui.html']);
    type(url, '/v3/api-docs');
    url.form!.dispatchEvent(new Event('submit', { cancelable: true }));
    await until(() => document.querySelectorAll('ed-openapi-import .op').length === 2, 'operations');
    expect(document.querySelector('ed-openapi-import .api')?.textContent).toContain('Accounting');
    const importButton = () => document.querySelector('[data-openapi-import]') as HTMLButtonElement;
    expect(importButton().disabled).toBe(true);
    ([...document.querySelectorAll<HTMLButtonElement>('ed-openapi-import .bulk button')][0]).click();
    await settle();
    expect(importButton().textContent).toContain('Import 2 data sources');
    importButton().click();
    await until(() => getAt(store.doc(), ['dataSources', 'listCustomers']) !== undefined, 'import');
    expect(getAt(store.doc(), ['dataSources', 'listCustomers'])).toEqual({ type: 'rest', method: 'GET', url: '/api/customers' });
    expect(getAt(store.doc(), ['dataSources', 'createCustomer'])).toEqual({ type: 'rest', method: 'POST', url: '/api/customers', body: '{{ form }}' });
    expect(store.samples()['listCustomers']).toEqual([{ name: 'Smith' }, { name: 'Smith' }]);
    expect(localStorage.getItem('lc.editor.openapi.url')).toBe('/v3/api-docs');
    // A single step to undo.
    store.undo();
    expect(getAt(store.doc(), ['dataSources', 'listCustomers'])).toBeUndefined();
  });

  it('properties: path of the element with clickable containers and filter by name', async () => {
    (el.querySelector('ed-palette button[data-type="section"]') as HTMLButtonElement).click();
    await settle();
    (el.querySelector('ed-palette button[data-type="table"]') as HTMLButtonElement).click();
    await settle();
    const crumbs = () => [...el.querySelectorAll('ed-inspector .crumbs li')].map((li) => li.textContent?.trim());
    expect(crumbs()).toEqual(['Screen', 'Section', 'Table']);
    expect(el.querySelector('ed-inspector .crumbs [aria-current="location"]')?.textContent).toBe('Table');
    const filter = el.querySelector('[data-prop-filter]') as HTMLInputElement;
    type(filter, 'sour');
    await settle();
    expect([...el.querySelectorAll('ed-inspector ed-fields > .prop')].map((p) => p.getAttribute('data-prop'))).toEqual(['source']);
    type(filter, 'xyz');
    await settle();
    expect(el.querySelector('ed-inspector .empty')?.textContent).toContain('No property');
    // A click on the container in the path selects it; the filter starts empty again.
    ([...el.querySelectorAll<HTMLButtonElement>('ed-inspector .crumbs button')].find((b) => b.textContent === 'Section') as HTMLButtonElement).click();
    await settle();
    expect(store.selection()).toEqual(['components', 0]);
    expect((el.querySelector('[data-prop-filter]') as HTMLInputElement).value).toBe('');
    expect(crumbs()).toEqual(['Screen', 'Section']);
  });

  it('View menu (sides, problems, view) and Help (shortcuts, also with F1; information)', async () => {
    (el.querySelector('ed-menu-bar [data-menu="view"]') as HTMLButtonElement).click();
    await settle();
    const item = (id: string) => el.querySelector(`ed-menu-bar [data-item="${id}"]`) as HTMLButtonElement;
    expect([...el.querySelectorAll('ed-menu-bar [data-item^="pin-"] .label')].map((l) => l.textContent)).toEqual(['“Project” pinned', '“Components” pinned', '“Outline” pinned', '“Properties” pinned']);
    expect([item('pin-palette').getAttribute('role'), item('pin-palette').getAttribute('aria-checked')]).toEqual(['menuitemcheckbox', 'true']);
    expect([item('view-preview').getAttribute('role'), item('view-preview').getAttribute('aria-checked')]).toEqual(['menuitemradio', 'true']);
    item('pin-inspector').click();
    await settle();
    expect((el.querySelector('.editor') as HTMLElement).style.getPropertyValue('--ed-right')).toBe('30px');
    await menuCommand('view', 'issues');
    expect(el.querySelector('ed-issues')).toBeNull();
    await menuCommand('view', 'view-json');
    expect(store.view()).toBe('json');
    (el.querySelector('ed-menu-bar [data-menu="view"]') as HTMLButtonElement).click();
    await settle();
    expect([item('pin-inspector').getAttribute('aria-checked'), item('issues').getAttribute('aria-checked'), item('view-json').getAttribute('aria-checked')]).toEqual(['false', 'false', 'true']);
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await settle();
    // F1 opens the shortcuts.
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'F1', bubbles: true }));
    await until(() => !!document.querySelector('.shortcuts dt'), 'shortcuts');
    expect([...document.querySelectorAll('.shortcuts h3')].map((h) => h.textContent)).toEqual(['General', 'Windows', 'Outline (outside text fields)', 'Menu bar', 'Panels and preview']);
    expect([...document.querySelectorAll('.shortcuts kbd')].map((k) => k.textContent)).toContain('Shift+F10');
    await menuCommand('help', 'about');
    await until(() => !!document.querySelector('.about lc-quadrava-wordmark'), 'information');
  });

  it('resizable sides: the edge moves from the keyboard and is remembered; Enter goes back to the foreseen width', async () => {
    const splitter = el.querySelector('ed-dock-side.left .splitter') as HTMLElement;
    expect([splitter.getAttribute('role'), splitter.getAttribute('aria-valuenow')]).toEqual(['separator', '280']);
    splitter.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    splitter.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await settle();
    expect(splitter.getAttribute('aria-valuenow')).toBe('312');
    expect((el.querySelector('.editor') as HTMLElement).style.getPropertyValue('--ed-left')).toBe('312px');
    expect(JSON.parse(localStorage.getItem('lc.editor.dock')!).leftWidth).toBe(312);
    splitter.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    await settle();
    expect(splitter.getAttribute('aria-valuenow')).toBe('640');
    // On the right the arrows are reversed: towards the central area (left) the side grows.
    const right = el.querySelector('ed-dock-side.right .splitter') as HTMLElement;
    right.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    await settle();
    expect(right.getAttribute('aria-valuenow')).toBe('336');
    splitter.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await settle();
    expect(splitter.getAttribute('aria-valuenow')).toBe('280');
  });

  it('translations: a language is added (with the code checked), has its column and the preview can use it', async () => {
    await withoutProject();
    (el.querySelector('ed-palette button[data-type="text"]') as HTMLButtonElement).click();
    await settle();
    store.makeTranslatable(['components', 0, 'text']);
    tab(3);
    await settle();
    const code = el.querySelector('[data-add-language]') as HTMLInputElement;
    code.value = 'Klingon';
    code.form!.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();
    expect(el.querySelector('ed-texts .error')?.textContent).toContain('Language not recognised');
    // The suggestions have the name in the editor's language; typing the name is enough.
    code.focus();
    code.dispatchEvent(new Event('focusin', { bubbles: true }));
    await until(() => document.querySelectorAll('nz-auto-option[data-language-option]').length > 0, 'language suggestions');
    const suggestions = [...document.querySelectorAll('nz-auto-option[data-language-option]')].map((o) => o.textContent?.trim());
    expect(suggestions).toContain('French (fr)');
    expect(suggestions).not.toContain('Italian (it)');
    code.value = 'french';
    code.dispatchEvent(new Event('input'));
    code.form!.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();
    expect([...el.querySelectorAll('ed-texts th.locale')].map((th) => th.textContent?.trim().split(' ')[0])).toEqual(['EN', 'IT', 'FR']);
    expect([...el.querySelectorAll('ed-texts .language .name')].map((n) => n.textContent)).toEqual(['English', 'Italian', 'French']);
    const fr = el.querySelector('ed-texts input[aria-label$=" fr"]') as HTMLInputElement;
    expect(fr.getAttribute('aria-invalid')).toBe('true');
    fr.value = 'Nouveau texte';
    fr.dispatchEvent(new Event('change'));
    await settle();
    expect(store.translations()['fr']).toEqual({ 'new_screen.new_text': 'Nouveau texte' });
    // The preview in French.
    tab(0);
    await settle();
    expect(el.querySelector('ed-preview nz-select.language')?.getAttribute('aria-label')).toBe('Preview language');
    await untilState('ed-preview', (st) => st.locale === 'en' && !!st.translations['fr'], 'French translations in the preview');
    // Once the added language is chosen, the preview uses it; removed, it goes back to the editor's.
    const preview = fixture.debugElement.query(By.directive(PreviewComponent)).componentInstance as unknown as { chooseLocale(l: string): void };
    preview.chooseLocale('fr');
    await untilState('ed-preview', (st) => st.locale === 'fr', 'preview in French');
    store.removeLanguage('fr');
    await untilState('ed-preview', (st) => st.locale === 'en', 'English again');
  });

  it('an error shows in the properties, in the list of problems and in the outline; the preview stays at the last valid version', async () => {
    (el.querySelector('ed-palette button[data-type="text"]') as HTMLButtonElement).click();
    await untilState('ed-preview', (st) => getAt(screenOf(st), ['components', 0, 'type']) === 'text', 'text in the preview');
    type(el.querySelector('#prop-text') as HTMLTextAreaElement, '{{ 1 + }}');
    await settle();
    expect(el.querySelector('.status')?.textContent).toContain('Errors: 1');
    expect(el.querySelector('ed-inspector .prop.invalid .issue')).not.toBeNull();
    expect(el.querySelector('ed-outline .mark.error')).not.toBeNull();
    expect(el.querySelector('ed-preview nz-alert')).not.toBeNull();
    // The iframe keeps the last valid version.
    await new Promise((r) => setTimeout(r, 300));
    const last = await untilState('ed-preview', () => true, 'state');
    expect(getAt(screenOf(last), ['components', 0, 'text'])).toBe('New text');
    store.select([]);
    await settle();
    (el.querySelector('ed-issues button') as HTMLButtonElement).click();
    await settle();
    expect(store.selection()).toEqual(['components', 0]);
  });

  it('data source with sample data: the preview shows them; renaming updates the table', async () => {
    (el.querySelector('ed-palette button[data-type="table"]') as HTMLButtonElement).click();
    await settle();
    // The source field suggests the data sources of the screen.
    const source = el.querySelector('#prop-source') as HTMLInputElement;
    // The list opens under the box (autocompletion, not the browser's <datalist>).
    source.focus();
    source.dispatchEvent(new Event('focusin', { bubbles: true }));
    await until(() => document.querySelectorAll('nz-auto-option').length > 0, 'data source suggestions');
    expect([...document.querySelectorAll('nz-auto-option')].map((o) => o.textContent?.trim())).toEqual(['list']);
    source.blur();
    document.body.dispatchEvent(new Event('click', { bubbles: true }));
    await settle();
    tab(2);
    await until(() => !!el.querySelector('ed-data-sources article'), 'data sources panel');
    expect(el.querySelector('ed-data-sources article')?.getAttribute('aria-label')).toBe('list');
    const sample = el.querySelector('#src-sample-list') as HTMLTextAreaElement;
    type(sample, '[{"id": 1, "description": "First row"}]');
    sample.dispatchEvent(new Event('blur'));
    const name = el.querySelector('#src-name-list') as HTMLInputElement;
    name.value = 'orders';
    name.dispatchEvent(new Event('change'));
    await settle();
    expect(getAt(store.doc(), ['components', 0, 'source'])).toBe('orders');
    tab(0);
    const shown = await untilState('ed-preview', (st) => getAt(screenOf(st), ['components', 0, 'source']) === 'orders', 'table renamed');
    expect(shown.samples).toEqual({ orders: [{ id: 1, description: 'First row' }] });
    expect(getAt(screenOf(shown), ['dataSources', 'orders', 'url'])).toBe('/api/list');
  });

  it('JSON: invalid text does not touch the document; valid text applies and is undone with Ctrl+Z', async () => {
    tab(1);
    await until(() => !!el.querySelector('ed-json-view textarea'), 'JSON view');
    const area = el.querySelector('ed-json-view textarea') as HTMLTextAreaElement;
    const apply = el.querySelector('ed-json-view button') as HTMLButtonElement;
    type(area, '{ broken');
    await settle();
    apply.click();
    await settle();
    expect(el.querySelector('ed-json-view .error')).not.toBeNull();
    type(area, JSON.stringify({ schemaVersion: '1.0', screen: 'da-json', components: [{ type: 'text', text: 'Da JSON' }] }));
    await settle();
    apply.click();
    await settle();
    expect(getAt(store.doc(), ['screen'])).toBe('da-json');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }));
    await settle();
    expect(getAt(store.doc(), ['screen'])).toBe('new-screen');
  });

  it('lists in the properties: columns field by field, steps by variant, and as JSON', async () => {
    (el.querySelector('ed-palette button[data-type="table"]') as HTMLButtonElement).click();
    await settle();
    const columns = (): HTMLElement => el.querySelector('ed-inspector [data-prop="columns"]') as HTMLElement;
    expect([...columns().querySelectorAll('.summary')].map((s) => s.textContent?.trim())).toEqual(['Id (id)', 'Description (description)']);
    // The second column is opened and its format changed.
    (columns().querySelectorAll('.item-toggle')[1] as HTMLButtonElement).click();
    await settle();
    type(columns().querySelector('#prop-columns-1-label') as HTMLInputElement, 'Notes');
    await settle();
    expect(getAt(store.doc(), ['components', 0, 'columns', 1, 'label'])).toBe('Notes');
    // A new column at the end, then moved to the top.
    (columns().querySelector(':scope > .list > button') as HTMLButtonElement).click();
    await settle();
    expect(getAt(store.doc(), ['components', 0, 'columns', 2])).toEqual({ field: 'field3', label: 'Description' });
    const up = columns().querySelectorAll(':scope > .list > .items > .item')[2].querySelector('button[aria-label^="Move up"]') as HTMLButtonElement;
    up.click();
    await settle();
    expect(getAt(store.doc(), ['components', 0, 'columns', 1, 'field'])).toBe('field3');
    // JSON view of the list.
    (columns().querySelector(':scope > .list > .list-head button') as HTMLButtonElement).click();
    await settle();
    expect((columns().querySelector(':scope > .list > ed-json-field textarea') as HTMLTextAreaElement).value).toContain('"field3"');

    // Button: a new step chosen by variant.
    store.select([]);
    (el.querySelector('ed-palette button[data-type="button"]') as HTMLButtonElement).click();
    await settle();
    const steps = el.querySelector('ed-inspector [data-prop="onClick"]') as HTMLElement;
    expect(steps.querySelector('.summary')?.textContent?.trim()).toBe('toast: Done');
    (steps.querySelector('button[nz-dropdown]') as HTMLButtonElement).click();
    await until(() => document.querySelectorAll('.ant-dropdown-menu-item').length === 12, 'step variants');
    ([...document.querySelectorAll<HTMLElement>('.ant-dropdown-menu-item')].find((i) => i.textContent?.includes('refresh')) as HTMLElement).click();
    await settle();
    expect(getAt(store.doc(), ['components', 1, 'onClick', 1])).toEqual({ refresh: '' });
    // The new step is open: the data source is typed in its field.
    type(steps.querySelector('#prop-onClick-1-refresh') as HTMLInputElement, 'list');
    await settle();
    expect(getAt(store.doc(), ['components', 1, 'onClick', 1])).toEqual({ refresh: 'list' });
    expect(store.issues()).toEqual([]);
  });

  it('from the palette to the preview: a component dropped on the drawing is inserted before, after or inside the node', async () => {
    (el.querySelector('ed-palette button[data-type="button"]') as HTMLButtonElement).click();
    store.select([]);
    (el.querySelector('ed-palette button[data-type="box"]') as HTMLButtonElement).click();
    await untilState('ed-preview', (st) => !!st.screen, 'preview');
    await fromFrame('ed-preview', { type: 'lc-preview:drop', kind: 'text', targetId: 'button-1', zone: 'before' });
    expect((store.doc() as { components: { type: string }[] }).components.map((c) => c.type)).toEqual(['text', 'button', 'box']);
    await fromFrame('ed-preview', { type: 'lc-preview:drop', kind: 'input.date', targetId: 'box-1', zone: 'inside' });
    expect(getAt(store.doc(), ['components', 2, 'components', 0])).toMatchObject({ type: 'input', field: { type: 'date' } });
    await fromFrame('ed-preview', { type: 'lc-preview:drop', kind: 'alert', targetId: null, zone: 'after' });
    expect(getAt(store.doc(), ['components', 3, 'type'])).toBe('alert');
    // An invalid message does nothing.
    await fromFrame('ed-preview', { type: 'lc-preview:drop', kind: 'x<script>', targetId: null, zone: 'after' });
    expect((store.doc() as { components: unknown[] }).components.length).toBe(4);
  });

  it('from the preview: moving a component and changing its width in a grid', async () => {
    (el.querySelector('ed-palette button[data-type="button"]') as HTMLButtonElement).click();
    store.select([]);
    (el.querySelector('ed-palette button[data-type="grid"]') as HTMLButtonElement).click();
    await untilState('ed-preview', (st) => !!st.screen, 'preview');
    // The button enters the grid, then takes two columns.
    await fromFrame('ed-preview', { type: 'lc-preview:move', id: 'button-1', targetId: 'grid-1', zone: 'inside' });
    expect(getAt(store.doc(), ['components', 0, 'type'])).toBe('grid');
    expect(getAt(store.doc(), ['components', 0, 'components', 0, 'id'])).toBe('button-1');
    await fromFrame('ed-preview', { type: 'lc-preview:resize', id: 'button-1', property: 'span', value: 2 });
    expect(getAt(store.doc(), ['components', 0, 'components', 0, 'span'])).toBe(2);
    // A container does not enter itself; out-of-range values do not pass.
    await fromFrame('ed-preview', { type: 'lc-preview:move', id: 'grid-1', targetId: 'button-1', zone: 'after' });
    expect(getAt(store.doc(), ['components', 0, 'type'])).toBe('grid');
    await fromFrame('ed-preview', { type: 'lc-preview:resize', id: 'button-1', property: 'span', value: 40 });
    expect(getAt(store.doc(), ['components', 0, 'components', 0, 'span'])).toBe(2);
  });

  it('from the preview to the outline: the component chosen in the iframe is selected; only the messages of its own iframe count', async () => {
    (el.querySelector('ed-palette button[data-type="button"]') as HTMLButtonElement).click();
    store.select([]);
    (el.querySelector('ed-palette button[data-type="alert"]') as HTMLButtonElement).click();
    // The selected node is the one to highlight in the preview.
    await untilState('ed-preview', (st) => st.selectedId === 'alert-1' && !!st.screen, 'selected node');
    await fromFrame('ed-preview', { type: 'lc-preview:select', id: 'button-1' });
    expect(store.selection()).toEqual(['components', 0]);
    // A message from another window does not count.
    window.dispatchEvent(new MessageEvent('message', { data: { type: 'lc-preview:select', id: 'alert-1' }, origin: location.origin, source: window }));
    await settle();
    expect(store.selection()).toEqual(['components', 0]);
    // Selection mode and log.
    // Parameters, Log, Select and Reload: icon only, the name for screen readers, aligned on the right.
    const selectButton = el.querySelector('ed-preview .bar button[data-command="select"]') as HTMLButtonElement;
    expect([selectButton.getAttribute('aria-label'), selectButton.textContent?.trim()]).toEqual(['Select', '']);
    expect(el.querySelector('ed-preview .bar button[data-command="reload"]')?.getAttribute('aria-label')).toBe('Reload');
    expect([...el.querySelectorAll('ed-preview .bar .actions button')].map((b) => [b.getAttribute('data-command'), b.querySelector('.anticon') !== null])).toEqual([
      ['params', true],
      ['log', true],
      ['select', true],
      ['reload', true],
    ]);
    expect(el.querySelector('ed-preview .bar button[data-command="params"]')?.getAttribute('aria-label')).toBe('Parameters');
    selectButton.click();
    await untilState('ed-preview', (st) => st.selectMode, 'selection mode');
    await fromFrame('ed-preview', { type: 'lc-preview:event', event: { kind: 'request', text: 'GET /api/list' } });
    const logButton = el.querySelector('ed-preview .bar button[data-command="log"]') as HTMLButtonElement;
    expect(logButton.getAttribute('aria-label')).toBe('Log (1)');
    expect(logButton.querySelector('.count')?.textContent).toBe('1');
    // Widths: icons only, with the name (and the pixels) for screen readers.
    const widths = [...el.querySelectorAll<HTMLButtonElement>('ed-preview .widths button')];
    expect(widths.map((b) => [b.getAttribute('aria-label'), b.getAttribute('aria-pressed'), b.textContent?.trim()])).toEqual([
      ['Desktop', 'true', ''],
      ['Tablet (768 px)', 'false', ''],
      ['Phone (375 px)', 'false', ''],
    ]);
    widths[1].click();
    await settle();
    expect(widths[1].getAttribute('aria-pressed')).toBe('true');
    expect((el.querySelector('ed-preview iframe') as HTMLIFrameElement).style.width).toBe('768px');
  });
  it('texts: the translations are saved in the registry merged with the existing catalogue and published', async () => {
    // Outside a project (with a project its catalogues are published as they are).
    await withoutProject();
    localStorage.setItem('lc.editor.registry', JSON.stringify({ appId: 'demo', env: 'development' }));
    const calls: { url: string; method: string; body?: string; ifMatch?: string }[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      const headers = (init.headers ?? {}) as Record<string, string>;
      if (url.startsWith('/registry')) calls.push({ url, method, body: init.body as string | undefined, ifMatch: headers['If-Match'] });
      const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
      if (url === '/registry/apps/demo/documents/messages/it/versions' && method === 'GET') return json([{ hash: 'h-it', createdAt: '2026-10-13T08:00:00Z', author: 'mario' }]);
      if (url.endsWith('/versions') && method === 'GET') return json([]);
      if (url.endsWith('/versions/h-it')) return json({ schemaVersion: '1.0', messages: 'it', texts: { 'app.title': 'Titolo', 'x.y': 'vecchio' } });
      if (url.endsWith('/versions') && method === 'POST') return json({ hash: 'nuovo', createdAt: '2026-10-13T09:00:00Z', author: 'mario' }, 201);
      if (url.includes('/published')) return { ok: true, status: 204, json: async () => undefined };
      const body = FILES[url];
      return body ? json(body) : { ok: false, status: 404, json: async () => ({}) };
    });
    store.setTranslation('it', 'x.y', 'nuovo');
    store.setTranslation('en', 'x.y', 'new');
    tab(3);
    await until(() => !!el.querySelector('ed-texts .head-actions'), 'texts panel');
    ([...el.querySelectorAll<HTMLButtonElement>('ed-texts .head-actions button')].find((b) => b.textContent?.includes('Save to the registry')) as HTMLButtonElement).click();
    await until(() => calls.filter((c) => c.method === 'PUT').length === 2, 'publications');
    const saves = calls.filter((c) => c.method === 'POST');
    expect(saves.map((c) => [c.url, c.ifMatch])).toEqual([
      ['/registry/apps/demo/documents/messages/it/versions', '"h-it"'],
      ['/registry/apps/demo/documents/messages/en/versions', undefined],
    ]);
    // The keys already in the catalogue stay; the changed ones are replaced.
    expect(JSON.parse(saves[0].body!)).toEqual({ schemaVersion: '1.0', messages: 'it', texts: { 'app.title': 'Titolo', 'x.y': 'nuovo' } });
    expect(calls.filter((c) => c.method === 'PUT').map((c) => c.url)).toEqual([
      '/registry/apps/demo/documents/messages/it/published?env=development',
      '/registry/apps/demo/documents/messages/en/published?env=development',
    ]);
    localStorage.removeItem('lc.editor.registry');
  });

  it('texts: a plain text becomes translatable, the Italian translation applies at once in the preview', async () => {
    (el.querySelector('ed-palette button[data-type="alert"]') as HTMLButtonElement).click();
    await settle();
    expect(el.querySelectorAll('.center .ant-tabs-tab')[3].textContent?.trim()).toBe('Texts (2)');
    tab(3);
    await until(() => !!el.querySelector('ed-texts tbody tr'), 'list of texts');
    const row = (): HTMLElement => [...el.querySelectorAll<HTMLElement>('ed-texts tbody tr')].find((r) => r.textContent?.includes('Message'))!;
    (row().querySelector('button.convert') as HTMLButtonElement).click();
    await settle();
    expect(getAt(store.doc(), ['components', 0, 'text'])).toBe("{{ t('new_screen.message_for_the_user', 'Message for the user') }}");
    const italian = row().querySelector('input[aria-label$=" it"]') as HTMLInputElement;
    expect(italian.getAttribute('aria-invalid')).toBe('true');
    italian.value = 'Messaggio per l’utente';
    italian.dispatchEvent(new Event('change'));
    await settle();
    expect(row().querySelector('input[aria-label$=" it"]')?.getAttribute('aria-invalid')).toBeNull();
    TestBed.inject(I18n).setLocale('it');
    tab(0);
    await untilState('ed-preview', (st) => st.locale === 'it' && st.translations['it']?.['new_screen.message_for_the_user'] === 'Messaggio per l’utente', 'translation to the preview');
  });

  it('navigation: outline, fields from the schema, real menu with a simulated profile', async () => {
    await subCommand('file', 'new', 'new-navigation');
    await until(() => !!el.querySelector('ed-navigation-editor'), 'navigation editor');
    const nav = workspace.active()!.injector.get(NavigationStore);
    const menu = (st: PreviewState): string => JSON.stringify(st.navigation);
    // The project has its navigation: «New › Navigation» opens it.
    expect(workspace.active()?.path()).toBe('navigation.json');
    await untilState('ed-navigation-editor', (st) => menu(st).includes('Home') && !st.screen, 'menu in the preview');
    // An item requiring a permission.
    nav.select(['areas', 0, 'items', 0]);
    await settle();
    expect(el.querySelector('ed-nav-inspector .kind')?.textContent).toBe('Item');
    type(el.querySelector('ed-nav-inspector #prop-label') as HTMLInputElement, 'Orders');
    type(el.querySelector('ed-nav-inspector #prop-requires') as HTMLInputElement, 'orders.order.read');
    await untilState('ed-navigation-editor', (st) => menu(st).includes('Orders') && st.granted === null, 'new label in the menu');
    // Profile without the permission: the item disappears.
    (el.querySelector('ed-navigation-editor .profile nz-switch') as HTMLElement).click();
    await settle();
    (el.querySelector('ed-navigation-editor .permissions input') as HTMLInputElement).click();
    await untilState('ed-navigation-editor', (st) => Array.isArray(st.granted) && !st.granted.includes('orders.order.read'), 'profile without the permission');
    // The group is added from the outline bar; Ctrl+Z applies to the navigation.
    ([...el.querySelectorAll<HTMLButtonElement>('ed-nav-outline .add button')].find((b) => b.textContent?.includes('Group')) as HTMLButtonElement).click();
    await settle();
    expect(nav.target()).toEqual({ kind: 'group', level: 1 });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }));
    await settle();
    expect(getAt(nav.doc(), ['areas', 0, 'items'])).toHaveLength(1);
    // The initial item opens «new-screen», the screen open in the other window: a known screen.
    expect(el.querySelector('.bottom')?.textContent).toContain('Problems (0)');
    // Problems of the navigation at the bottom: an item opening a screen that is not among the known ones.
    nav.setValue(['areas', 0, 'items', 0, 'screen'], 'missing-screen');
    await settle();
    expect(el.querySelector('.bottom')?.textContent).toContain('Screen “missing-screen” is not among the known screens');
  });

  it('theme: tokens are changed from the fields and reach the preview with the screen of the other window; with errors the last valid one stays', async () => {
    (el.querySelector('ed-palette button[data-type="alert"]') as HTMLButtonElement).click();
    await settle();
    await createViaDialog('theme', 'Test theme');
    await untilState('ed-theme-editor', (st) => st.theme?.tokens.colors.primary === '#1f5fbf' && getAt(screenOf(st), ['components', 0, 'type']) === 'alert', 'theme and screen');
    const primary = el.querySelector('ed-theme-inspector #prop-tokens-colors-primary') as HTMLInputElement;
    expect(primary.previousElementSibling?.getAttribute('type')).toBe('color');
    type(primary, '#aa3300');
    await untilState('ed-theme-editor', (st) => st.theme?.tokens.colors.primary === '#aa3300', 'new colour');
    // The editor does not change: the theme applies only in the iframe.
    expect(document.documentElement.style.getPropertyValue('--lc-color-primary')).not.toBe('#aa3300');
    // The preview of the screen, in the other window, uses the theme of the theme window.
    await untilState('ed-preview', (st) => st.theme?.tokens.colors.primary === '#aa3300', 'theme in the screen preview');
    type(primary, 'red');
    await settle();
    expect(el.querySelector('.status')?.textContent).toContain('Errors: 1');
    const last = await untilState('ed-theme-editor', () => true, 'state');
    expect(last.theme?.tokens.colors.primary).toBe('#aa3300');
  });
  it('expressions: the help offers variables and functions and inserts them at the cursor', async () => {
    (el.querySelector('ed-palette button[data-type="button"]') as HTMLButtonElement).click();
    await settle();
    (el.querySelector('ed-inspector details.conditions') as HTMLDetailsElement).open = true;
    const help = el.querySelector('ed-inspector [data-prop="visibleIf"] details.hints') as HTMLDetailsElement;
    help.open = true;
    help.dispatchEvent(new Event('toggle'));
    await settle();
    const chip = [...help.querySelectorAll<HTMLButtonElement>('.chip')].find((c) => c.textContent?.trim() === 'user.username')!;
    chip.click();
    await settle();
    expect(getAt(store.doc(), ['components', 0, 'visibleIf'])).toBe('{{ user.username }}');
    expect(store.issues()).toEqual([]);
  });

  it('registry: saves a version of the open document, shows the history, publishes; with errors it does not save', async () => {
    const calls: { url: string; method: string }[] = [];
    const versions = [{ hash: 'a1b2c3d4e5f6', createdAt: '2026-10-13T08:00:00Z', author: 'mario' }];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      if (url.startsWith('/registry')) calls.push({ url, method });
      const json = (body: unknown, status = 200) => ({ ok: true, status, json: async () => body });
      if (url.endsWith('/versions') && method === 'POST') return json(versions[0], 201);
      if (url.endsWith('/versions')) return json(versions);
      if (url.endsWith('/documents')) return json([{ kind: 'screen', id: 'new-screen', publishedEnvironments: { development: 'a1b2c3d4e5f6' } }]);
      if (url.includes('/published')) return { ok: true, status: 204, json: async () => undefined };
      const body = FILES[url];
      return body ? json(body) : { ok: false, status: 404, json: async () => ({}) };
    });
    await menuCommand('file', 'registry');
    await until(() => !!document.querySelector('ed-registry-panel'), 'registry panel');
    const panel = document.querySelector('ed-registry-panel') as HTMLElement;
    const app = panel.querySelector('#registry-app') as HTMLInputElement;
    type(app, 'orders');
    await settle();
    expect(panel.textContent).toContain('screen / new-screen');
    const button = (label: string): HTMLButtonElement => [...panel.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.includes(label))!;
    button('Save version').click();
    await until(() => !!panel.querySelector('ol li .hash'), 'history');
    // The reads (registry check, screens of the application) start first; here the save counts.
    expect(calls.filter((c) => c.method === 'POST').slice(0, 1)).toEqual([{ url: '/registry/apps/orders/documents/screen/new-screen/versions', method: 'POST' }]);
    expect(panel.querySelector('ol li')?.textContent).toContain('a1b2c3d4e5');
    expect(panel.querySelector('ol li nz-tag')?.textContent?.trim()).toBe('development');
    // Publishing asks for confirmation.
    button('Publish to development').click();
    await until(() => !!document.querySelector('.ant-modal-confirm, .ant-modal'), 'confirmation');
    ([...document.querySelectorAll<HTMLButtonElement>('.ant-modal button')].find((b) => b.textContent?.includes('Confirm')) as HTMLButtonElement).click();
    await until(() => calls.some((c) => c.method === 'PUT'), 'publication');
    expect(calls.find((c) => c.method === 'PUT')?.url).toBe('/registry/apps/orders/documents/screen/new-screen/published?env=development');
    // With errors saving is blocked.
    store.setValue(['screen'], 'Not Valid');
    await settle();
    expect(button('Save version').disabled).toBe(true);
    expect(panel.textContent).toContain('Fix the errors');
  });

  it('registry: review, comparison with the open document, conflicting save and validation errors', async () => {
    const calls: { url: string; method: string; body?: string; ifMatch?: string }[] = [];
    let state = 'draft';
    let conflict = true;
    vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      const headers = (init.headers ?? {}) as Record<string, string>;
      if (url.startsWith('/registry')) calls.push({ url, method, body: init.body as string | undefined, ifMatch: headers['If-Match'] });
      const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
      const version = () => ({ hash: 'a1b2c3d4e5f6', createdAt: '2026-10-13T08:00:00Z', author: 'mario', state, ...(state === 'rejected' ? { reviewedBy: 'luisa', reviewedAt: '2026-10-13T09:00:00Z', reviewNote: 'Title to review' } : {}) });
      if (url.endsWith('/review')) {
        const action = JSON.parse(init.body as string).action;
        state = action === 'request' ? 'in-review' : action === 'approve' ? 'approved' : 'rejected';
        return json(version());
      }
      if (url.includes('/versions/a1b2c3d4e5f6')) return json({ schemaVersion: '1.0', screen: 'new-screen', title: 'Old title', components: [] });
      if (url.endsWith('/versions') && method === 'POST') {
        const body = JSON.parse(init.body as string);
        if (body.title === 'Broken') return json({ title: 'The document does not follow the schema', errors: [{ path: '/components/0/type', message: 'value not allowed' }] }, 400);
        if (headers['If-Match'] && conflict) return json({ title: 'The document was changed', latest: 'ffff', latestAuthor: 'luisa' }, 412);
        return json(version(), 201);
      }
      if (url.endsWith('/versions')) return json([version()]);
      if (url.endsWith('/documents')) return json([{ kind: 'screen', id: 'new-screen', publishedEnvironments: {} }]);
      const body = FILES[url];
      return body ? json(body) : { ok: false, status: 404, json: async () => ({}) };
    });
    await menuCommand('file', 'registry');
    await until(() => !!document.querySelector('ed-registry-panel'), 'registry panel');
    const panel = document.querySelector('ed-registry-panel') as HTMLElement;
    type(panel.querySelector('#registry-app') as HTMLInputElement, 'orders');
    await settle();
    const button = (label: string): HTMLButtonElement => [...panel.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim().startsWith(label))!;
    const confirm = async (): Promise<void> => {
      // Closed dialogs stay in the DOM: the last one opened counts.
      const last = () => [...document.querySelectorAll<HTMLElement>('.ant-modal')].at(-1);
      await until(() => !!last()?.querySelector('button'), 'confirmation');
      ([...last()!.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.includes('Confirm')) as HTMLButtonElement).click();
    };

    // History: the version is a draft; review is requested, then it is rejected with a note.
    button('History').click();
    await until(() => panel.textContent!.includes('draft'), 'draft state');
    button('Request review').click();
    await until(() => panel.textContent!.includes('in review'), 'in review');
    type(panel.querySelector('#registry-note') as HTMLInputElement, 'Title to review');
    await settle();
    button('Reject').click();
    await until(() => panel.textContent!.includes('rejected') && panel.textContent!.includes('Decided by luisa'), 'rejected with a note');
    expect(JSON.parse(calls.filter((c) => c.url.endsWith('/review')).at(-1)!.body!)).toEqual({ action: 'reject', note: 'Title to review' });

    // Comparison: the saved version against the open document.
    button('Compare').click();
    await until(() => !!panel.querySelector('.diff li'), 'differences');
    expect(panel.querySelector('.diff')?.textContent).toContain('/title');
    expect(panel.querySelector('.diff')?.textContent).toContain('"Old title"');

    // Once that version is opened, saving says where it starts from; if someone else saved, confirmation is asked.
    button('Open').click();
    await confirm();
    await until(() => store.doc() !== null && (store.doc() as { title?: string }).title === 'Old title', 'version opened');
    store.setValue(['title'], 'New title');
    await settle();
    button('Save version').click();
    await until(() => [...document.querySelectorAll('.ant-modal')].some((m) => m.textContent?.includes('luisa saved')), 'conflict warning');
    expect(calls.filter((c) => c.method === 'POST' && c.url.endsWith('/versions')).at(-1)?.ifMatch).toBe('"a1b2c3d4e5f6"');
    conflict = false;
    await confirm();
    await until(() => calls.filter((c) => c.method === 'POST' && c.url.endsWith('/versions')).length === 2, 'saved anyway');
    expect(calls.filter((c) => c.method === 'POST' && c.url.endsWith('/versions')).at(-1)?.ifMatch).toBeUndefined();

    // The registry validation errors are shown point by point.
    store.setValue(['title'], 'Broken');
    await settle();
    button('Save version').click();
    await until(() => !!panel.querySelector('.issues li'), 'registry errors');
    expect(panel.querySelector('.issues li')?.textContent).toContain('/components/0/type');
  });

  it('registry: publishing warns about referenced unpublished screens; the refusal lists them; the registry screens are known', async () => {
    const calls: { url: string; method: string }[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      if (url.startsWith('/registry')) calls.push({ url, method });
      const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
      const missing = [{ screen: 'order-list', path: '/actions/back/0/navigate' }];
      if (url.endsWith('/references?env=production')) return json({ env: 'production', references: missing, missing });
      if (url.includes('/published')) return json({ title: 'Unpublished screens', missingReferences: missing }, 409);
      if (url.endsWith('/versions')) return json([{ hash: 'a1b2c3d4e5f6', createdAt: '2026-10-13T08:00:00Z', author: 'mario', state: 'approved' }]);
      if (url.endsWith('/documents')) return json([{ kind: 'screen', id: 'new-screen' }, { kind: 'screen', id: 'registry-only' }]);
      if (url === '/registry/apps') return json([]);
      const body = FILES[url];
      return body ? json(body) : { ok: false, status: 404, json: async () => ({}) };
    });
    await menuCommand('file', 'registry');
    await until(() => !!document.querySelector('ed-registry-panel'), 'registry panel');
    const panel = document.querySelector('ed-registry-panel') as HTMLElement;
    type(panel.querySelector('#registry-app') as HTMLInputElement, 'orders');
    type(panel.querySelector('#registry-env') as HTMLInputElement, 'production');
    await settle();
    // The screens of the application in the registry are added to the examples among the known ones.
    await until(() => store.knownScreens().includes('registry-only'), 'registry screens');
    const button = (label: string): HTMLButtonElement => [...panel.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim().startsWith(label))!;
    button('History').click();
    await until(() => !!panel.querySelector('ol li .hash'), 'history');
    button('Publish to production').click();
    const last = () => [...document.querySelectorAll<HTMLElement>('.ant-modal')].at(-1);
    await until(() => !!last()?.textContent?.includes('Publish anyway'), 'confirmation with the missing screens');
    expect(last()?.textContent).toContain('order-list');
    ([...last()!.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.includes('Confirm')) as HTMLButtonElement).click();
    await until(() => !!panel.querySelector('.issues li'), 'missing screens in the panel');
    expect(panel.querySelector('.issues li')?.textContent).toContain('/actions/back/0/navigate');
    expect(panel.querySelector('.issues li')?.textContent).toContain('order-list');
    expect(calls.filter((c) => c.url.includes('/references')).map((c) => c.url)).toEqual(['/registry/apps/orders/documents/screen/new-screen/versions/a1b2c3d4e5f6/references?env=production']);
  });

  it('registry without a session: the panel offers sign-in through the BFF and then one comes back to the editor', async () => {
    vi.stubGlobal('fetch', async (url: string) => {
      if (url.startsWith('/registry')) return { ok: false, status: 401, json: async () => ({ title: 'Sessione scaduta' }) };
      const body = FILES[url];
      return body ? { ok: true, status: 200, json: async () => body } : { ok: false, status: 404, json: async () => ({}) };
    });
    await menuCommand('file', 'registry');
    await until(() => !!document.querySelector('ed-registry-panel'), 'registry panel');
    const panel = document.querySelector('ed-registry-panel') as HTMLElement;
    type(panel.querySelector('#registry-app') as HTMLInputElement, 'orders');
    await settle();
    ([...panel.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.includes('History')) as HTMLButtonElement).click();
    await until(() => !!panel.querySelector('.login'), 'sign-in request');
    ([...panel.querySelectorAll<HTMLButtonElement>('.login button')][0]).click();
    expect(redirects).toEqual(['/bff/login?return=' + encodeURIComponent(location.href)]);
  });

  it('opens an example, and deletes the selected node from the keyboard', async () => {
    store.load(layout as never);
    await until(() => outline().length > 5, 'outline of the example');
    expect(outline()).toContain('Tabs');
    expect(outline()).toContain('Tab');
    expect(store.issues()).toEqual([]);
    store.select(['components', 0]);
    await settle();
    const before = outline().length;
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    await settle();
    expect(outline().length).toBe(before - 1);
  });

  it('File menu without registry: registry items off with the reason; «Save» and Ctrl+S write the resource in the project; «Import file…»', async () => {
    (el.querySelector('ed-menu-bar [data-menu="file"]') as HTMLButtonElement).click();
    await until(() => el.querySelector('ed-menu-bar [data-item="save-registry"]')?.getAttribute('title')?.includes('not available') ?? false, 'registry absent');
    for (const id of ['open-registry', 'save-registry']) {
      expect(el.querySelector(`ed-menu-bar [data-item="${id}"]`)?.getAttribute('aria-disabled')).toBe('true');
    }
    expect(el.querySelector('ed-menu-bar [data-item="save"] .shortcut')?.textContent).toBe('Ctrl+S');
    (el.querySelector('ed-menu-bar [data-menu="file"]') as HTMLButtonElement).click();
    await settle();
    // Just opened there are no changes to save; a change turns the indicator on.
    expect(el.querySelector('[data-unsaved]')).toBeNull();
    store.setValue(['title'], 'Order list');
    await settle();
    expect(el.querySelector('[data-unsaved]')?.textContent).toContain('Unsaved changes');
    // Ctrl+S: the screen is written in the project, in the file of its identifier, and appears in the project panel.
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true }));
    await until(() => folder.files.has('screens/new-screen.json'), 'saved in the project');
    expect(JSON.parse(folder.files.get('screens/new-screen.json')!)).toMatchObject({ screen: 'new-screen', title: 'Order list' });
    await until(() => !el.querySelector('[data-unsaved]'), 'indicator off');
    expect(el.querySelector('ed-project-panel [data-resource="screens/new-screen.json"]')).not.toBeNull();
    // A new identifier renames the resource: written under the new name, the old file removed.
    store.setValue(['screen'], 'order-list');
    await settle();
    await menuCommand('file', 'save');
    await until(() => folder.files.has('screens/order-list.json'), 'renamed');
    expect(folder.files.has('screens/new-screen.json')).toBe(false);
    expect(workspace.active()!.path()).toBe('screens/order-list.json');
    // «Import file…» reads a file and writes it into the project as the resource of its kind; it asks before replacing one.
    const open = (name: string, text: string) =>
      vi.stubGlobal('showOpenFilePicker', async () => [{ name, getFile: async () => new File([text], name), createWritable: async () => ({ write: async () => undefined, close: async () => undefined }) }]);
    const confirm = vi.spyOn(TestBed.inject(Confirmation), 'confirm').mockResolvedValue(true);
    open('menu.json', JSON.stringify({ schemaVersion: '1.0', navigation: 'imported', areas: [] }));
    await menuCommand('file', 'import');
    await until(() => workspace.active()?.kind === 'navigation', 'navigation opened');
    expect(confirm).toHaveBeenCalledWith('The project already has navigation.json. Replace it?');
    expect(workspace.name(workspace.active()!)).toBe('imported');
    expect(JSON.parse(folder.files.get('navigation.json')!).navigation).toBe('imported');
    const toast = vi.spyOn(TestBed.inject(Notifier), 'toast');
    open('texts.json', JSON.stringify({ en: { a: 'A' } }));
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'o', ctrlKey: true, bubbles: true }));
    await until(() => toast.mock.calls.some(([m]) => m.includes('not a screen, a data sources document, a navigation or a theme')), 'refused');
    expect(workspace.windows()).toHaveLength(2);
  });

  it('File menu with the registry: «Open from registry…» chooses application, document and version; «Save to registry» starts from there', async () => {
    const calls: { url: string; method: string; ifMatch?: string }[] = [];
    const content = { schemaVersion: '1.0', screen: 'order-list', title: 'Order list', components: [] };
    vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      if (url.startsWith('/registry')) calls.push({ url, method, ifMatch: ((init.headers ?? {}) as Record<string, string>)['If-Match'] });
      const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
      if (url === '/registry/apps') return json([{ id: 'orders', name: 'Orders' }]);
      if (url.endsWith('/documents'))
        return json([
          { kind: 'screen', id: 'order-list', latest: { hash: 'cccccccccccc', createdAt: '', author: 'mario', state: 'draft' }, publishedEnvironments: { development: 'aaaaaaaaaaaa' } },
          { kind: 'theme', id: 'chiaro' },
        ]);
      if (url.includes('/versions/aaaaaaaaaaaa')) return json(content);
      if (url.endsWith('/versions') && method === 'POST') return json({ hash: 'dddddddddddd', createdAt: '', author: 'mario' }, 201);
      const body = FILES[url];
      return body ? json(body) : json({}, 404);
    });
    await registryCommand('open-registry');
    (el.querySelector('ed-menu-bar [data-item="open-registry-screen"]') as HTMLButtonElement).click();
    await until(() => !!document.querySelector('ed-registry-open #registry-open-app'), 'registry dialog');
    const dialog = document.querySelector('ed-registry-open') as HTMLElement;
    type(dialog.querySelector('#registry-open-app') as HTMLInputElement, 'orders');
    await settle();
    dialog.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await until(() => dialog.querySelectorAll('input[type="radio"]').length === 1, 'documents of the kind of the mode');
    expect(dialog.textContent).toContain('order-list');
    (dialog.querySelector('input[type="radio"]') as HTMLInputElement).dispatchEvent(new Event('change'));
    await settle();
    const select = dialog.querySelector('#registry-open-version') as HTMLSelectElement;
    expect([...select.options].map((o) => o.textContent?.trim())).toEqual(['Latest version (cccccccccc)', 'Published in development (aaaaaaaaaa)']);
    select.value = 'env:development';
    select.dispatchEvent(new Event('change'));
    await settle();
    ([...dialog.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === 'Open') as HTMLButtonElement).click();
    // The version opens in a new window.
    await until(() => workspace.windows().length === 2 && workspace.name(workspace.active()!) === 'order-list', 'version opened');
    expect(folder.files.has('screens/order-list.json')).toBe(true);
    expect(calls.some((c) => c.url === '/registry/apps/orders/documents/screen/order-list/versions/aaaaaaaaaaaa')).toBe(true);
    expect(el.querySelector('[data-unsaved]')).toBeNull();
    // Save to registry: a new version, giving the one it started from.
    workspace.active()!.injector.get(EditorStore).setValue(['title'], 'Open orders');
    await settle();
    await registryCommand('save-registry');
    await until(() => calls.some((c) => c.method === 'POST'), 'save to the registry');
    const post = calls.find((c) => c.method === 'POST')!;
    expect(post.url).toBe('/registry/apps/orders/documents/screen/order-list/versions');
    expect(post.ifMatch).toContain('aaaaaaaaaaaa');
    await until(() => !el.querySelector('[data-unsaved]'), 'saved');
  });

  it('«Save to registry» without an application asks for it; with 401 it sends to the login', async () => {
    let status = 200;
    const posts: string[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
      const json = (body: unknown, code = 200) => ({ ok: code < 400, status: code, json: async () => body });
      if (url === '/registry/apps') return json([{ id: 'orders', name: 'Orders' }], status);
      if (url.endsWith('/versions') && init.method === 'POST') {
        posts.push(url);
        return json({ hash: 'eeeeeeeeeeee', createdAt: '', author: 'mario' }, 201);
      }
      const body = FILES[url];
      return body ? json(body) : json({}, 404);
    });
    await registryCommand('save-registry');
    await until(() => !!document.querySelector('ed-registry-target #registry-target-app'), 'choice of the application');
    const target = document.querySelector('ed-registry-target') as HTMLElement;
    expect(target.querySelector('datalist option')?.getAttribute('value')).toBe('orders');
    type(target.querySelector('#registry-target-app') as HTMLInputElement, 'orders');
    await settle();
    target.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await until(() => posts.length === 1, 'save');
    expect(posts[0]).toBe('/registry/apps/orders/documents/screen/new-screen/versions');
    status = 401;
    await registryCommand('save-registry');
    await until(() => redirects.length === 1, 'login');
    expect(redirects[0]).toContain('/bff/login?return=');
  });
});
