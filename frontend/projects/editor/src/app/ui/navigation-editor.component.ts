import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { I18n } from 'core';
import type { NavigationDefinition } from 'schema';
import { NzCheckboxModule } from 'ng-zorro-antd/checkbox';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import { EditorStore } from '../model/editor-store';
import { NavigationStore } from '../model/navigation-store';
import { KnownTranslations } from '../model/shared-state';
import { ThemeStore } from '../model/theme-store';
import { Workspace } from '../model/workspace';
import { PreviewFrameComponent } from '../preview/preview-frame.component';
import { previewState, type PreviewState } from '../preview/protocol';
import { JsonViewComponent } from './json-view.component';

/**
 * The window of a navigation (areas and three-level menus): the real menu (`lc-sidebar`) with a simulated profile, where one
 * chooses the permissions and sees what appears, and the JSON. Outline and properties are the side panels of the workspace.
 * The menu is drawn with the theme and the translations of the theme and screen windows used last.
 */
@Component({
  selector: 'ed-navigation-editor',
  imports: [FormsModule, JsonViewComponent, PreviewFrameComponent, NzCheckboxModule, NzIconModule, NzSwitchModule, NzTabsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './navigation-editor.component.scss',
  templateUrl: './navigation-editor.component.html',
})
export class NavigationEditorComponent {
  protected readonly store = inject(NavigationStore);
  protected readonly i18n = inject(I18n);
  private readonly workspace = inject(Workspace);
  private readonly projectTexts = inject(KnownTranslations).project;

  protected readonly view = signal<'preview' | 'json'>('preview');

  /** Permissions of the simulated profile; null = all. */
  protected readonly granted = signal<Set<string> | null>(null);
  /** The drawn menu: the last valid navigation (with errors the previous one stays). */
  private readonly shown = linkedSignal<NavigationDefinition | null, NavigationDefinition | null>({
    source: () => this.store.definition(),
    computation: (next, previous) => next ?? previous?.value ?? null,
  });
  /** What the iframe draws: the real menu (`lc-sidebar`) with the simulated profile and the theme being edited. */
  protected readonly previewState = computed<PreviewState>(() => {
    const granted = this.granted();
    const screens = this.workspace.latest('screen', EditorStore);
    return previewState({
      navigation: this.shown(),
      theme: this.workspace.latest('theme', ThemeStore)?.definition() ?? null,
      granted: granted ? [...granted] : null,
      locale: this.i18n.locale(),
      translations: this.projectTexts()?.catalogues ?? screens?.translations() ?? {},
      defaultLocale: this.projectTexts()?.defaultLanguage ?? screens?.defaultLanguage() ?? 'en',
    });
  });

  protected setGrantAll(all: boolean): void {
    this.granted.set(all ? null : new Set(this.store.permissions()));
  }

  protected toggle(permission: string, on: boolean): void {
    this.granted.update((set) => {
      const next = new Set(set ?? this.store.permissions());
      if (on) next.add(permission);
      else next.delete(permission);
      return next;
    });
  }

  protected has(permission: string): boolean {
    return this.granted()?.has(permission) ?? true;
  }

  protected setView(index: number): void {
    this.view.set(index === 1 ? 'json' : 'preview');
  }
}
