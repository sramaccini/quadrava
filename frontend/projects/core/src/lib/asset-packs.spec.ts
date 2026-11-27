import { TestBed } from '@angular/core/testing';
import { AssetPacks, assetIconSvg, packEntry } from './asset-packs';
import { DefinitionSource, RuntimeDiagnostics } from './ports';

const pack = (name = 'acme') => ({
  schemaVersion: '1.0',
  assets: name,
  version: '1.0.0',
  license: 'MIT',
  icons: { truck: { viewBox: '0 0 24 24', paths: ['M2 6h12v9H2z'] } },
});

class Packs extends DefinitionSource {
  readonly asked: string[] = [];
  constructor(private readonly docs: Record<string, unknown>) {
    super();
  }
  override assets(name: string): Promise<unknown> {
    this.asked.push(name);
    return name in this.docs ? Promise.resolve(this.docs[name]) : Promise.reject(Object.assign(new Error('not found'), { status: 404 }));
  }
  screen = () => Promise.reject(new Error('no'));
  dataSources = () => Promise.reject(new Error('no'));
  navigation = () => Promise.reject(new Error('no'));
  theme = () => Promise.reject(new Error('no'));
  themes = () => [];
  messages = () => Promise.reject(new Error('no'));
}

function setup(docs: Record<string, unknown>) {
  const source = new Packs(docs);
  const reports: { source: string; error: string }[] = [];
  TestBed.configureTestingModule({
    providers: [
      { provide: DefinitionSource, useValue: source },
      { provide: RuntimeDiagnostics, useValue: { report: (e: { source: string; error: string }) => reports.push(e) } },
    ],
  });
  return { packs: TestBed.inject(AssetPacks), source, reports };
}

describe('asset packs', () => {
  it('splits pack/name, and only that', () => {
    expect(packEntry('acme/truck')).toEqual({ pack: 'acme', entry: 'truck' });
    expect(packEntry('truck')).toBeNull();
    expect(packEntry('acme/../truck')).toBeNull();
    expect(packEntry('Acme/truck')).toBeNull();
    expect(packEntry(undefined)).toBeNull();
  });

  it('draws an icon from its geometry, in the colour of the text', () => {
    expect(assetIconSvg({ viewBox: '0 0 24 24', paths: ['M0 0h1z', 'M2 2h1z'], fillRule: 'evenodd' })).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" fill-rule="evenodd"><path d="M0 0h1z"/><path d="M2 2h1z"/></svg>',
    );
  });

  it('loads a pack once and validates it', async () => {
    const { packs, source, reports } = setup({ acme: pack() });
    const [a, b] = await Promise.all([packs.pack('acme'), packs.pack('acme')]);
    expect(a?.icons?.['truck'].viewBox).toBe('0 0 24 24');
    expect(b).toBe(a);
    expect(source.asked).toEqual(['acme']);
    expect(reports).toEqual([]);
  });

  it('a missing pack, an invalid one or one with another name is null, with a diagnostic', async () => {
    const { packs, reports } = setup({ bad: { ...pack('bad'), icons: { x: { viewBox: '0 0 24 24', paths: ['<script>'] } } }, other: pack('acme') });
    expect(await packs.pack('none')).toBeNull();
    expect(await packs.pack('bad')).toBeNull();
    expect(await packs.pack('other')).toBeNull();
    expect(reports.map((r) => r.source)).toEqual(['assets/none', 'assets/bad', 'assets/other']);
  });

  it('a definition source without packs answers 404 by default', async () => {
    const { packs, reports } = setup({});
    const plain = new (class extends Packs {})({});
    await expect(DefinitionSource.prototype.assets.call(plain, 'acme')).rejects.toMatchObject({ status: 404 });
    expect(await packs.pack('acme')).toBeNull();
    expect(reports[0].error).toBe('not found');
  });
});
