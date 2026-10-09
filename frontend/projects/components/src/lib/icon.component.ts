import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  CheckCircleOutline,
  ContainerOutline,
  EuroOutline,
  FileAddOutline,
  FileTextOutline,
  FolderOutline,
  HomeOutline,
  InboxOutline,
  MenuOutline,
  SearchOutline,
  SettingOutline,
  UnorderedListOutline,
} from '@ant-design/icons-angular/icons';
import type { IconDefinition } from '@ant-design/icons-angular';
import { NzIconModule } from 'ng-zorro-antd/icon';

/**
 * Set di icone integrato: nome usato nei JSON → icona di Ant Design. Le icone sono registrate una per una
 * (`provideLowcodeComponents`): un nome sconosciuto non mostra nulla e non provoca mai il caricamento di icone dalla rete.
 */
export const ICON_TYPES: Record<string, { type: string; icon: IconDefinition }> = {
  menu: { type: 'menu', icon: MenuOutline },
  home: { type: 'home', icon: HomeOutline },
  'file-plus': { type: 'file-add', icon: FileAddOutline },
  list: { type: 'unordered-list', icon: UnorderedListOutline },
  search: { type: 'search', icon: SearchOutline },
  package: { type: 'container', icon: ContainerOutline },
  receipt: { type: 'file-text', icon: FileTextOutline },
  'check-circle': { type: 'check-circle', icon: CheckCircleOutline },
  folder: { type: 'folder', icon: FolderOutline },
  euro: { type: 'euro', icon: EuroOutline },
  inbox: { type: 'inbox', icon: InboxOutline },
  settings: { type: 'setting', icon: SettingOutline },
};

/** Tipo NG-ZORRO di un nome di icona del set integrato, oppure `null` se il nome non è noto. */
export function iconType(name: string | undefined): string | null {
  return name ? (ICON_TYPES[name]?.type ?? null) : null;
}

@Component({
  selector: 'lc-icon',
  imports: [NzIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `:host { display: inline-flex; width: 1em; flex: none; justify-content: center; }`,
  template: `
    @if (type(); as t) {
      <span nz-icon [nzType]="t" aria-hidden="true"></span>
    }
  `,
})
export class IconComponent {
  readonly name = input<string | undefined>(undefined);
  protected readonly type = computed(() => iconType(this.name()));
}
