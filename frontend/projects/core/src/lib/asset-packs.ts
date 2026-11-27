import { Injectable, inject } from '@angular/core';
import type { AssetIconGeometry, AssetsDefinition } from 'schema';
import { DefinitionSource, RuntimeDiagnostics } from './ports';

/** An icon or image name of an asset pack, `pack/name` (ADR-29): the pack, then the entry. */
const PACK_ENTRY = /^([a-z0-9]+(?:-[a-z0-9]+)*)\/([a-z0-9]+(?:-[a-z0-9]+)*)$/;

/** The pack and the entry of a `pack/name`, or null if the name is not one. */
export function packEntry(name: string | undefined): { pack: string; entry: string } | null {
  const match = name ? PACK_ENTRY.exec(name) : null;
  return match ? { pack: match[1], entry: match[2] } : null;
}

/** The pack and the entry of an image address of a pack, `asset:pack/name`, or null if the address is not one. */
export function packImage(address: string | undefined): { pack: string; entry: string } | null {
  return address?.startsWith('asset:') ? packEntry(address.slice('asset:'.length)) : null;
}

/**
 * The SVG of an icon of a pack, from its geometry: only the view box and the paths, filled with the colour of the text.
 * The geometry comes from a validated pack (numbers and path commands only), so nothing else can get into the markup.
 */
export function assetIconSvg(icon: AssetIconGeometry): string {
  const rule = icon.fillRule === 'evenodd' ? ' fill-rule="evenodd"' : '';
  const paths = icon.paths.map((d) => `<path d="${d}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${icon.viewBox}" fill="currentColor"${rule}>${paths}</svg>`;
}

/**
 * The asset packs of the application (ADR-29), loaded from the definition source once each and validated. A pack that
 * cannot be loaded, is not valid or has another name counts as missing: null, and its icons and images are not drawn
 * (fail-closed). The reason goes to the diagnostics, never into an exception.
 */
@Injectable({ providedIn: 'root' })
export class AssetPacks {
  private readonly source = inject(DefinitionSource, { optional: true });
  private readonly diagnostics = inject(RuntimeDiagnostics, { optional: true });
  private readonly packs = new Map<string, Promise<AssetsDefinition | null>>();

  pack(name: string): Promise<AssetsDefinition | null> {
    let pack = this.packs.get(name);
    if (!pack) {
      pack = this.load(name);
      this.packs.set(name, pack);
    }
    return pack;
  }

  /**
   * An image of a pack, `asset:pack/name`, as a `data:` address that the image rules accept; null when the address is
   * not one, or the pack or the image is not there (then a diagnostic).
   */
  async image(address: string): Promise<string | null> {
    const ref = packImage(address);
    if (!ref) return null;
    const pack = await this.pack(ref.pack);
    if (!pack) return null;
    const image = Object.prototype.hasOwnProperty.call(pack.images ?? {}, ref.entry) ? pack.images?.[ref.entry] : undefined;
    return image ? `data:${image.type};base64,${image.data}` : this.missing(ref.pack, `no image ${ref.entry}`);
  }

  /**
   * A copy of the value with every image address of a pack in its strings (`asset:pack/name`) replaced by its `data:`
   * address, and left out when the image is not there: for the brand of a theme (logo, icons), which takes plain
   * addresses.
   */
  async withImages<T>(value: T): Promise<T> {
    if (typeof value === 'string') return (packImage(value) ? ((await this.image(value)) ?? undefined) : value) as T;
    if (Array.isArray(value)) return (await Promise.all(value.map((item) => this.withImages(item)))) as T;
    if (value === null || typeof value !== 'object') return value;
    const entries = await Promise.all(Object.entries(value).map(async ([key, item]) => [key, await this.withImages(item)] as const));
    return Object.fromEntries(entries.filter(([, item]) => item !== undefined)) as T;
  }

  private async load(name: string): Promise<AssetsDefinition | null> {
    if (!this.source) return null;
    try {
      // The precompiled validators are large: loaded when first needed, outside the initial bundle.
      const [doc, { validateAssets }] = await Promise.all([this.source.assets(name), import('schema/validation')]);
      const result = validateAssets(doc);
      if (!result.valid) return this.missing(name, result.issues.map((i) => `${i.path} ${i.message}`).join('; '));
      if (result.value.assets !== name) return this.missing(name, `the document is the pack ${result.value.assets}`);
      return result.value;
    } catch (e) {
      return this.missing(name, e instanceof Error ? e.message : String(e));
    }
  }

  private missing(name: string, error: string): null {
    this.diagnostics?.report({ screen: 'assets', source: `assets/${name}`, error });
    return null;
  }
}
