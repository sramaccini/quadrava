import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Set di icone integrato (24x24, tratto). Un nome sconosciuto lascia lo spazio vuoto, così le voci restano allineate. */
export const ICON_PATHS: Record<string, string> = {
  menu: 'M4 6h16 M4 12h16 M4 18h16',
  chevron: 'M9 6l6 6-6 6',
  home: 'M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z',
  'file-plus': 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z M14 3v5h5 M12 11v6 M9 14h6',
  list: 'M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M21 21l-4.3-4.3',
  package: 'M21 8l-9-5-9 5v8l9 5 9-5z M3 8l9 5 9-5 M12 13v8',
  receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2z M9 8h6 M9 12h6',
  'check-circle': 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M8 12l3 3 5-6',
  folder: 'M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  euro: 'M17 6a6 6 0 1 0 0 12 M4 10h9 M4 14h9',
  inbox: 'M22 12h-6l-2 3h-4l-2-3H2 M5.5 5h13l3.5 7v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z',
  settings: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z M12 2v3 M12 19v3 M2 12h3 M19 12h3 M5 5l2 2 M17 17l2 2 M5 19l2-2 M17 7l2-2',
};

@Component({
  selector: 'lc-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `:host { display: inline-flex; width: 20px; height: 20px; flex: none; } svg { width: 100%; height: 100%; }`,
  template: `
    @if (path(); as d) {
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path [attr.d]="d" />
      </svg>
    }
  `,
})
export class IconComponent {
  readonly name = input<string | undefined>(undefined);
  protected readonly path = computed(() => {
    const name = this.name();
    return name ? (ICON_PATHS[name] ?? null) : null;
  });
}
