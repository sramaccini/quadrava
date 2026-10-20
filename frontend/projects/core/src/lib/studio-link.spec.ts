import { isFromRuntime, isFromStudio, isProjectSnapshot, SnapshotDefinitions, type ProjectSnapshot } from './studio-link';

const snapshot = (): ProjectSnapshot => ({
  manifest: { project: 'demo' },
  navigation: { navigation: 'main' },
  screens: { 'order-list': { screen: 'order-list' } },
  dataSources: { orders: { datasources: 'orders' } },
  themes: { light: { theme: 'light' }, dark: { theme: 'dark' } },
  messages: { en: { 'a.b': 'A' }, 'pt-BR': {} },
});

describe('link between Studio and the runtime', () => {
  it('accepts a snapshot of the expected shape only', () => {
    expect(isProjectSnapshot(snapshot())).toBe(true);
    expect(isProjectSnapshot({ ...snapshot(), screens: { 'Bad Id': {} } })).toBe(false);
    expect(isProjectSnapshot({ ...snapshot(), messages: { english: {} } })).toBe(false);
    expect(isProjectSnapshot({ ...snapshot(), themes: [] })).toBe(false);
    expect(isProjectSnapshot({ ...snapshot(), screens: Object.fromEntries(Array.from({ length: 501 }, (_, i) => [`s${i}`, {}])) })).toBe(false);
    expect(isProjectSnapshot(null)).toBe(false);
  });

  it('recognises the messages of the two sides', () => {
    expect(isFromStudio({ type: 'lc-studio:project', project: snapshot() })).toBe(true);
    expect(isFromStudio({ type: 'lc-studio:project', project: {} })).toBe(false);
    expect(isFromStudio({ type: 'lc-studio:reload' })).toBe(true);
    expect(isFromStudio({ type: 'other' })).toBe(false);
    expect(isFromRuntime({ type: 'lc-studio:ready' })).toBe(true);
    expect(isFromRuntime('lc-studio:ready')).toBe(false);
  });

  it('serves the documents of the snapshot as copies; a missing one is a 404', async () => {
    const project = snapshot();
    const source = new SnapshotDefinitions(project, ['dark']);
    const screen = (await source.screen('order-list')) as Record<string, unknown>;
    screen['screen'] = 'changed';
    expect(await source.screen('order-list')).toEqual({ screen: 'order-list' });
    expect(await source.dataSources('orders')).toEqual({ datasources: 'orders' });
    expect(await source.navigation()).toEqual({ navigation: 'main' });
    expect(await source.messages('en')).toEqual({ 'a.b': 'A' });
    expect(source.themes()).toEqual(['dark']);
    expect(new SnapshotDefinitions(project).themes()).toEqual(['light', 'dark']);
    await expect(source.screen('nope')).rejects.toMatchObject({ status: 404 });
    await expect(source.screen('toString')).rejects.toMatchObject({ status: 404 });
    await expect(new SnapshotDefinitions({ ...project, navigation: null }).navigation()).rejects.toMatchObject({ status: 404 });
  });
});
