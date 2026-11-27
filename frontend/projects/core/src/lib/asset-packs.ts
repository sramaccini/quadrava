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
