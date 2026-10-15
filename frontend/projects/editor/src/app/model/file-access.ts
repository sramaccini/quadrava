import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import type { Json } from './doc-ops';
import type { EditorKind } from './saved-documents';

/** Le parti dell'API File System Access usate qui (Chrome ed Edge; Firefox e Safari non la offrono). */
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

/** Un file aperto: il nome, il contenuto già letto come JSON. */
export interface OpenedFile {
  name: string;
  doc: Json;
}

/**
 * File JSON dei documenti. Dove il browser lo permette, «Apri…» e il primo «Salva» tengono il riferimento al file, e i
 * salvataggi successivi riscrivono quel file senza chiedere; altrimenti «Apri…» usa il selettore dei file e «Salva»
 * scarica il file ogni volta. Un riferimento per tipo di documento; si perde ricaricando la pagina.
 */
@Injectable({ providedIn: 'root' })
export class FileAccess {
  private readonly document = inject(DOCUMENT);
  private readonly handles: Partial<Record<EditorKind, FileHandle>> = {};

  /** Il browser può riscrivere un file scelto dall'utente. */
  canWriteFiles(): boolean {
    return typeof this.pickers().showSaveFilePicker === 'function';
  }

  /** Il file a cui va il prossimo «Salva» di quel tipo, se c'è. */
  fileName(kind: EditorKind): string | null {
    return this.handles[kind]?.name ?? null;
  }

  /** Dimentica il file (documento nuovo, esempio, versione del registro): il prossimo «Salva» chiede dove salvare. */
  forget(kind: EditorKind): void {
    delete this.handles[kind];
  }

  /** Chiede un file JSON e lo legge; null se l'utente annulla. Lancia un errore se il file non è JSON. */
  async open(kind: EditorKind): Promise<OpenedFile | null> {
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
      this.handles[kind] = handle;
      return { name: file.name, doc };
    }
    const file = await this.chooseFile();
    if (!file) return null;
    const doc = JSON.parse(await file.text()) as Json;
    this.forget(kind);
    return { name: file.name, doc };
  }

  /**
   * Salva il documento in JSON: nel file già scelto, oppure in uno nuovo da scegliere (proponendo `suggestedName`), o
   * scaricandolo dove il browser non permette di scrivere file. Restituisce il nome del file, null se l'utente annulla.
   */
  async save(kind: EditorKind, doc: Json, suggestedName: string): Promise<string | null> {
    const blob = new Blob([JSON.stringify(doc, null, 2) + '\n'], { type: 'application/json' });
    const picker = this.pickers().showSaveFilePicker;
    if (!picker) {
      this.download(blob, suggestedName);
      return suggestedName;
    }
    let handle = this.handles[kind];
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
    this.handles[kind] = handle;
    return handle.name;
  }

  private pickers(): FilePickers {
    return (this.document.defaultView ?? {}) as FilePickers;
  }

  private download(blob: Blob, name: string): void {
    const url = URL.createObjectURL(blob);
    const link = this.document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
  }

  /** Selettore dei file classico: risolve con il file scelto, o null se l'utente chiude il selettore. */
  private chooseFile(): Promise<File | null> {
    return new Promise((resolve) => {
      const input = this.document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json,.json';
      input.addEventListener('change', () => resolve(input.files?.[0] ?? null), { once: true });
      input.addEventListener('cancel', () => resolve(null), { once: true });
      input.click();
    });
  }
}

function isAbort(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError';
}
