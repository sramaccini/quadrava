import { Injectable, signal } from '@angular/core';
import type { DataSourcesDefinition } from 'schema';
import type { Json } from './doc-ops';

/**
 * Screens known to the editor (the examples, those of the application in the registry, those open in the workspace): they are
 * suggested in the `navigate` steps and in the menu items, and checked. Shared by all the open documents.
 */
@Injectable({ providedIn: 'root' })
export class KnownScreens {
  readonly names = signal<string[]>([]);
}

/**
 * Node copied or cut in a screen, to paste in the same screen or in another open one. Shared by all the open documents, as
 * the clipboard of desktop applications.
 */
@Injectable({ providedIn: 'root' })
export class NodeClipboard {
  readonly node = signal<Json | null>(null);
}

/**
 * The data sources documents of the open project, as the screens see them (saved, with the changes of the windows open on
 * them): the screens check and resolve their references with these. Null without a project: references are not checked.
 */
@Injectable({ providedIn: 'root' })
export class KnownDataSources {
  readonly documents = signal<Record<string, DataSourcesDefinition> | null>(null);
}
