/** Kinds of image a definition can embed: the same accepted by the runtime (safeImageSrc) and by the schemas. */
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'];

/** Maximum length of an embedded image when the schema does not say it (about 75 kB of file). */
export const DEFAULT_IMAGE_LENGTH = 100_000;

export type ImageFileResult = { ok: true; url: string } | { ok: false; reason: 'unsupported' } | { ok: false; reason: 'tooBig'; maxKb: number };

/** Size in kB of an image embedded as `data:image/…;base64`, or null if the text is not one (an address, nothing). */
export function embeddedImageKb(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = /^data:image\/[a-z+.-]+;base64,([A-Za-z0-9+/=]*)$/.exec(value);
  return match ? Math.max(1, Math.round((match[1].length * 3) / 4 / 1024)) : null;
}

/**
 * An image file of the computer as `data:image/…;base64`, to embed in a definition: only the kinds of `IMAGE_TYPES`, and
 * only if the address fits in `maxLength` characters (base64 is a third larger than the file).
 */
export async function imageFileToDataUrl(file: Blob, maxLength = DEFAULT_IMAGE_LENGTH): Promise<ImageFileResult> {
  if (!IMAGE_TYPES.includes(file.type)) return { ok: false, reason: 'unsupported' };
  const maxKb = Math.floor((maxLength * 3) / 4 / 1024);
  // A first check without reading: the address is about 4/3 of the file.
  if (Math.ceil(file.size / 3) * 4 + 40 > maxLength) return { ok: false, reason: 'tooBig', maxKb };
  const url = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('the file cannot be read'));
    reader.readAsDataURL(file);
  });
  if (url.length > maxLength) return { ok: false, reason: 'tooBig', maxKb };
  return { ok: true, url };
}
