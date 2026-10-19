import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import type { Json } from './doc-ops';

/** The parts of the File System Access API used here (Chrome and Edge; Firefox and Safari do not offer it). */
interface WritableFile {
  write(data: Blob): Promise<void>;
  close(): Promise<void>;
}
export interface FileHandle {
  readonly name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<WritableFile>;
}
interface PickerOptions {
  suggestedName?: string;
  types?: { description: string; accept: Record<string, string[]> }[];
}
interface FilePickers {
  showOpenFilePicker?: (options?: PickerOptions) => Promise<FileHandle[]>;
  showSaveFilePicker?: (options?: PickerOptions) => Promise<FileHandle>;
}

const JSON_TYPES = [{ description: 'JSON', accept: { 'application/json': ['.json'] } }];

/** An open file: the name, the content already read as JSON. */
export interface OpenedFile {
  name: string;
  doc: Json;
}

/**
 * JSON files of the documents. Where the browser allows it, «Open…» and the first «Save» keep the reference to the file, and
 * the following saves rewrite that file without asking; otherwise «Open…» uses the file picker and «Save»
 * downloads the file every time. One reference per open document (by its identifier); it is lost when reloading the page.
 */
@Injectable({ providedIn: 'root' })
export class FileAccess {
  private readonly document = inject(DOCUMENT);
  private readonly handles: Partial<Record<string, FileHandle>> = {};

  /** The browser can rewrite a file chosen by the user. */
  canWriteFiles(): boolean {
    return typeof this.pickers().showSaveFilePicker === 'function';
  }

  /** The file the next «Save» of that document goes to, if there is one. */
  fileName(id: string): string | null {
    return this.handles[id]?.name ?? null;
  }

  /** Forgets the file (new document, example, registry version): the next «Save» asks where to save. */
  forget(id: string): void {
    delete this.handles[id];
  }

  /** Asks for a JSON file for the document `id` and reads it; null if the user cancels. Throws an error if the file is not JSON. */
  async open(id: string): Promise<OpenedFile | null> {
    const picker = this.pickers().showOpenFilePicker;
    if (picker) {
      let handle: FileHandle | undefined;
      try {
        [handle] = await picker({ types: JSON_TYPES });
      } catch (e) {
        if (isAbort(e)) return null;
        throw e;
      }
      if (!handle) return null;
      const file = await handle.getFile();
      const doc = JSON.parse(await file.text()) as Json;
      this.handles[id] = handle;
      return { name: file.name, doc };
    }
    const file = await this.chooseFile();
    if (!file) return null;
    const doc = JSON.parse(await file.text()) as Json;
    this.forget(id);
    return { name: file.name, doc };
  }

  /**
   * Saves the document as JSON: in the file already chosen, or in a new one to choose (proposing `suggestedName`), or
   * downloading it where the browser does not allow writing files. Returns the name of the file, null if the user cancels.
   */
  async save(id: string, doc: Json, suggestedName: string): Promise<string | null> {
    const blob = new Blob([JSON.stringify(doc, null, 2) + '\n'], { type: 'application/json' });
    const picker = this.pickers().showSaveFilePicker;
    if (!picker) {
      this.download(blob, suggestedName);
      return suggestedName;
    }
    let handle = this.handles[id];
    if (!handle) {
      try {
        handle = await picker({ suggestedName, types: JSON_TYPES });
      } catch (e) {
        if (isAbort(e)) return null;
        throw e;
      }
    }
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    this.handles[id] = handle;
    return handle.name;
  }

  private pickers(): FilePickers {
    return (this.document.defaultView ?? {}) as FilePickers;
  }

  /** Downloads a file (an archive, a document where the browser cannot write files). */
  download(blob: Blob, name: string): void {
    const url = URL.createObjectURL(blob);
    const link = this.document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
  }

  /** Classic file picker: resolves with the chosen file, or null if the user closes the picker. */
  chooseFile(accept = 'application/json,.json'): Promise<File | null> {
    return new Promise((resolve) => {
      const input = this.document.createElement('input');
      input.type = 'file';
      input.accept = accept;
      input.addEventListener('change', () => resolve(input.files?.[0] ?? null), { once: true });
      input.addEventListener('cancel', () => resolve(null), { once: true });
      input.click();
    });
  }
}

function isAbort(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError';
}
