import { unzipSync } from 'fflate';
import { optimize, type CustomPlugin, type XastElement } from 'svgo';
import { validateAssets } from '../../schema/validation/src/public-api';
import type { AssetIcon, AssetIconGeometry, AssetImage, AssetsDefinition } from '../../schema/src/public-api';

/**
 * `quadrava assets add` (ADR-29): a zip with `pack.json` and its SVG and image files becomes the asset pack document of the
 * project, `assets/<name>.json`, already cleaned. Icons keep only their geometry (a view box and path data, drawn in the
 * colour of the text); images keep their content in base64. Nothing of the zip is written to disk.
 */

/** One problem of the zip, with the file it is about. */
export interface PackIssue {
  file: string;
  message: string;
}

const NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const VERSION = /^[0-9]+\.[0-9]+\.[0-9]+([-+][0-9A-Za-z.-]+)?$/;
/** A file of the zip named by pack.json: a relative path, without `..`, with the extension of its kind. */
const FILE = /^(?!.*(^|\/)\.\.?(\/|$))[A-Za-z0-9_\-./ ]+$/;
const MAX_ZIP = 50 * 1024 * 1024;
const MAX_SVG = 1024 * 1024;
const MAX_IMAGE = 200 * 1024;

const IMAGE_TYPES: Record<string, AssetImage['type']> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
};

/** The first bytes of each raster format: the content must be what the extension says. */
const SIGNATURES: Partial<Record<AssetImage['type'], (b: Uint8Array) => boolean>> = {
  'image/png': (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/gif': (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46,
  'image/webp': (b) => String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP',
};

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Reads the zip of a pack and builds its document; with problems, no document. */
export function packFromZip(zip: Uint8Array): { pack: AssetsDefinition | null; issues: PackIssue[] } {
  const issues: PackIssue[] = [];
  if (zip.length > MAX_ZIP) return { pack: null, issues: [{ file: 'zip', message: `larger than ${MAX_ZIP / 1024 / 1024} MB` }] };
  let descriptor: unknown;
  try {
    const files = unzipSync(zip, { filter: (f) => f.name === 'pack.json' && f.originalSize <= MAX_SVG });
    if (!files['pack.json']) return { pack: null, issues: [{ file: 'pack.json', message: 'missing at the root of the zip' }] };
    descriptor = JSON.parse(new TextDecoder().decode(files['pack.json']));
  } catch (e) {
    return { pack: null, issues: [{ file: 'pack.json', message: `not readable (${e instanceof Error ? e.message : e})` }] };
  }
  const meta = checkDescriptor(descriptor, issues);
  if (!meta) return { pack: null, issues };

  // Only the files that pack.json names, each within its limit.
  const wanted = new Map<string, number>();
  for (const icon of Object.values(meta.icons)) for (const file of [icon.file, icon.filled]) if (file) wanted.set(file, MAX_SVG);
  for (const image of Object.values(meta.images)) wanted.set(image.file, image.file.toLowerCase().endsWith('.svg') ? MAX_SVG : MAX_IMAGE);
  const sizes = new Map<string, number>();
  const files = unzipSync(zip, {
    filter: (f) => {
      sizes.set(f.name, f.originalSize);
      return wanted.has(f.name) && f.originalSize <= (wanted.get(f.name) ?? 0);
    },
  });
  for (const [file, limit] of wanted) {
    if (!sizes.has(file)) issues.push({ file, message: 'named in pack.json but not in the zip' });
    else if (!files[file]) issues.push({ file, message: `larger than ${limit / 1024} kB` });
  }
  if (issues.length) return { pack: null, issues };

  const icons: Record<string, AssetIcon> = {};
  for (const [name, icon] of Object.entries(meta.icons)) {
    const outline = iconGeometry(text(files[icon.file]), icon.file, issues);
    const filled = icon.filled ? iconGeometry(text(files[icon.filled]), icon.filled, issues) : null;
    if (!outline || (icon.filled && !filled)) continue;
    icons[name] = { ...outline, ...(filled ? { filled } : {}), ...(icon.keywords?.length ? { keywords: icon.keywords } : {}) };
  }
  const images: Record<string, AssetImage> = {};
  for (const [name, image] of Object.entries(meta.images)) {
    const content = imageContent(files[image.file], image.file, issues);
    if (content) images[name] = { ...content, ...(image.alt ? { alt: image.alt } : {}) };
  }
  if (issues.length) return { pack: null, issues };

  const pack: AssetsDefinition = {
    schemaVersion: '1.0',
    assets: meta.name,
    version: meta.version,
    license: meta.license,
    ...(meta.description ? { description: meta.description } : {}),
    ...(Object.keys(icons).length ? { icons } : {}),
    ...(Object.keys(images).length ? { images } : {}),
  };
  // The same check as the runtime: what does not pass is not written.
  const result = validateAssets(pack);
  if (!result.valid) return { pack: null, issues: result.issues.map((i) => ({ file: `assets/${meta.name}.json`, message: `${i.path} ${i.message}` })) };
  return { pack, issues: [] };
}

interface Descriptor {
  name: string;
  version: string;
  license: string;
  description?: string;
  icons: Record<string, { file: string; filled?: string; keywords?: string[] }>;
  images: Record<string, { file: string; alt?: string }>;
}

/** pack.json: the name, version and licence of the pack and its entries, each with the file of the zip it comes from. */
function checkDescriptor(doc: unknown, issues: PackIssue[]): Descriptor | null {
  const problem = (message: string) => issues.push({ file: 'pack.json', message });
  if (!isObject(doc)) return problem('not an object'), null;
  for (const key of Object.keys(doc)) if (!['$schema', 'name', 'version', 'license', 'description', 'icons', 'images'].includes(key)) problem(`unknown property ${key}`);
  const { name, version, license, description } = doc;
  if (typeof name !== 'string' || !NAME.test(name) || name.length > 40) problem('name: lower case letters, digits and hyphens, at most 40 characters');
  if (typeof version !== 'string' || !VERSION.test(version)) problem('version: a semantic version such as 1.2.0');
  if (typeof license !== 'string' || !license.trim() || license.length > 200) problem('license: required, at most 200 characters');
  if (description !== undefined && (typeof description !== 'string' || description.length > 500)) problem('description: text of at most 500 characters');
  const entries = <T>(key: 'icons' | 'images', check: (entry: Json, at: string) => T | null): Record<string, T> => {
    const value = doc[key] ?? {};
    const out: Record<string, T> = {};
    if (!isObject(value)) return problem(`${key}: an object of entries by name`), out;
    for (const [entry, spec] of Object.entries(value)) {
      const at = `${key}/${entry}`;
      if (!NAME.test(entry) || entry.length > 60) problem(`${at}: names are lower case letters, digits and hyphens`);
      else if (!isObject(spec)) problem(`${at}: an object with file`);
      else {
        const checked = check(spec, at);
        if (checked) out[entry] = checked;
      }
    }
    return out;
  };
  const file = (value: unknown, at: string, extensions: RegExp): string | null => {
    if (typeof value === 'string' && FILE.test(value) && extensions.test(value)) return value;
    problem(`${at}: the path of a file of the zip (${extensions.source.replace(/[\\$()]/g, '').replace(/\|/g, ', ')})`);
    return null;
  };
  const icons = entries('icons', (spec, at) => {
    for (const key of Object.keys(spec)) if (!['file', 'filled', 'keywords'].includes(key)) problem(`${at}: unknown property ${key}`);
    const outline = file(spec['file'], `${at}/file`, /\.svg$/i);
    const filled = spec['filled'] === undefined ? undefined : file(spec['filled'], `${at}/filled`, /\.svg$/i);
    const keywords = spec['keywords'];
    if (keywords !== undefined && (!Array.isArray(keywords) || keywords.length > 20 || !keywords.every((k) => typeof k === 'string' && k.length <= 40))) {
      problem(`${at}/keywords: at most 20 words`);
      return null;
    }
    return outline && filled !== null ? { file: outline, ...(filled ? { filled } : {}), ...(keywords ? { keywords: keywords as string[] } : {}) } : null;
  });
  const images = entries('images', (spec, at) => {
    for (const key of Object.keys(spec)) if (!['file', 'alt'].includes(key)) problem(`${at}: unknown property ${key}`);
    const image = file(spec['file'], `${at}/file`, /\.(png|jpe?g|webp|gif|svg)$/i);
    const alt = spec['alt'];
    if (alt !== undefined && (typeof alt !== 'string' || alt.length > 300)) return problem(`${at}/alt: text of at most 300 characters`), null;
    return image ? { file: image, ...(alt ? { alt } : {}) } : null;
  });
  if (!Object.keys(icons).length && !Object.keys(images).length && !issues.length) problem('no icons and no images');
  return issues.length ? null : ({ name, version, license, description, icons, images } as Descriptor);
}

const text = (bytes: Uint8Array | undefined) => new TextDecoder().decode(bytes);

/** The elements an icon may keep after svgo, and those dropped without changing the drawing. */
const DRAWN = new Set(['svg', 'g', 'path']);
const IGNORED = new Set(['title', 'desc', 'metadata', 'defs', 'linearGradient', 'radialGradient', 'stop', 'style', 'script']);

/**
 * The geometry of an icon: svgo turns the shapes into paths and applies the transforms, then only the view box and the
 * path data are kept. What cannot become geometry filled with the colour of the text is refused, with the reason:
 * strokes, a transform that could not be applied, text, images, masks, mixed fill rules.
 */
export function iconGeometry(svg: string, file: string, issues: PackIssue[]): AssetIconGeometry | null {
  const problems: string[] = [];
  let geometry: AssetIconGeometry | null = null;
  const collect: CustomPlugin = {
    name: 'quadrava-geometry',
    fn: () => ({
      root: {
        exit: (root) => {
          const svgElement = root.children.find((c): c is XastElement => c.type === 'element' && c.name === 'svg');
          if (!svgElement) return void problems.push('no svg element');
          const viewBox = viewBoxOf(svgElement);
          if (!viewBox) return void problems.push('no viewBox, nor width and height');
          const paths: string[] = [];
          const rules = new Set<string>();
          const walk = (node: XastElement, inherited: { fillRule: string; fill: string; stroke: string }) => {
            const a = node.attributes;
            const state = { fillRule: a['fill-rule'] ?? inherited.fillRule, fill: a['fill'] ?? inherited.fill, stroke: a['stroke'] ?? inherited.stroke };
            if (a['transform'] && node.name !== 'svg') problems.push(`a transform on ${node.name} that cannot be applied to the paths`);
            if (a['mask'] || a['clip-path'] || a['filter']) problems.push(`a mask, clip path or filter on ${node.name}`);
            if (node.name === 'path') {
              const visible = state.fill !== 'none';
              if (state.stroke !== 'none' && state.stroke !== '' && a['stroke-width'] !== '0') problems.push('strokes: outline them in the drawing tool (stroke to path)');
              if (visible && a['d']) {
                paths.push(a['d'].trim());
                rules.add(state.fillRule === 'evenodd' ? 'evenodd' : 'nonzero');
              }
            }
            for (const child of node.children) {
              if (child.type !== 'element') continue;
              if (DRAWN.has(child.name)) walk(child, state);
              else if (!IGNORED.has(child.name)) problems.push(`the element ${child.name} cannot become geometry`);
            }
          };
          walk(svgElement, { fillRule: 'nonzero', fill: '', stroke: 'none' });
          if (!paths.length) problems.push('nothing drawn');
          if (rules.size > 1) problems.push('paths with different fill rules');
          geometry = { viewBox, paths, ...(rules.has('evenodd') && rules.size === 1 ? { fillRule: 'evenodd' as const } : {}) };
        },
      },
    }),
  };
  try {
    optimize(svg, {
      multipass: true,
      plugins: [{ name: 'preset-default', params: { overrides: { convertShapeToPath: { convertArcs: true } } } }, 'removeScripts', collect],
    });
  } catch (e) {
    problems.push(`not a valid SVG (${e instanceof Error ? e.message.split('\n')[0] : e})`);
  }
  for (const message of new Set(problems)) issues.push({ file, message });
  return problems.length ? null : geometry;
}

/** The view box in the form of the schema: four numbers, separated by spaces. */
function viewBoxOf(svg: XastElement): string | null {
  const a = svg.attributes;
  const numbers = a['viewBox'] ? a['viewBox'].trim().split(/[\s,]+/).map(Number) : [0, 0, parseFloat(a['width'] ?? ''), parseFloat(a['height'] ?? '')];
  if (numbers.length !== 4 || numbers.some((n) => !Number.isFinite(n)) || numbers[2] <= 0 || numbers[3] <= 0) return null;
  return numbers.map((n) => String(Math.round(n * 1000) / 1000)).join(' ');
}

/**
 * The content of an image: a raster as it is, if it is what its extension says; an SVG cleaned of scripts, links and
 * embedded rasters only. None of the optimisations of the icons runs on an image: rounding the numbers or applying the
 * transforms changes the drawing at the edges, and a logo must stay what its author drew.
 */
function imageContent(bytes: Uint8Array, file: string, issues: PackIssue[]): Pick<AssetImage, 'type' | 'data'> | null {
  const type = IMAGE_TYPES[file.toLowerCase().split('.').pop() ?? ''];
  if (type === 'image/svg+xml') {
    let cleaned: string;
    try {
      cleaned = optimize(text(bytes), { plugins: ['removeScripts', 'removeXlink', 'removeRasterImages'] }).data;
    } catch (e) {
      issues.push({ file, message: `not a valid SVG (${e instanceof Error ? e.message.split('\n')[0] : e})` });
      return null;
    }
    if (/<foreignObject|\bon[a-z]+\s*=|href\s*=\s*["'](?!#)/i.test(cleaned)) {
      issues.push({ file, message: 'links, events or embedded documents: an image of a pack is self-contained' });
      return null;
    }
    return { type, data: Buffer.from(cleaned).toString('base64') };
  }
  if (!type || !SIGNATURES[type]?.(bytes)) {
    issues.push({ file, message: `the content is not ${type ?? 'an image'}` });
    return null;
  }
  return { type, data: Buffer.from(bytes).toString('base64') };
}
