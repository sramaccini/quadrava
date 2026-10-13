import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  AppstoreOutline,
  QuestionCircleOutline,
  CheckCircleOutline,
  CloseOutline,
  DeleteOutline,
  DownOutline,
  EllipsisOutline,
  ContainerOutline,
  EuroOutline,
  FilterOutline,
  FileAddOutline,
  FileTextOutline,
  FolderOutline,
  HomeOutline,
  InboxOutline,
  LeftOutline,
  LogoutOutline,
  MenuOutline,
  PaperClipOutline,
  PlusOutline,
  RightOutline,
  SafetyOutline,
  SearchOutline,
  SettingOutline,
  UnorderedListOutline,
  UploadOutline,
  UserOutline,
  ExportOutline,
  SwapOutline,
} from '@ant-design/icons-angular/icons';
import type { IconDefinition } from '@ant-design/icons-angular';
import { NzIconModule } from 'ng-zorro-antd/icon';

/**
 * Set di icone integrato: nome usato nei JSON → icona di Ant Design. Le icone sono registrate una per una
 * (`provideLowcodeComponents`): un nome sconosciuto non mostra nulla e non provoca mai il caricamento di icone dalla rete.
 */
export const ICON_TYPES: Record<string, { type: string; icon: IconDefinition }> = {
  help: { type: 'question-circle', icon: QuestionCircleOutline },
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
  sections: { type: 'appstore', icon: AppstoreOutline },
  user: { type: 'user', icon: UserOutline },
  logout: { type: 'logout', icon: LogoutOutline },
  left: { type: 'left', icon: LeftOutline },
  right: { type: 'right', icon: RightOutline },
  safety: { type: 'safety', icon: SafetyOutline },
  more: { type: 'ellipsis', icon: EllipsisOutline },
  plus: { type: 'plus', icon: PlusOutline },
  delete: { type: 'delete', icon: DeleteOutline },
  upload: { type: 'upload', icon: UploadOutline },
  down: { type: 'down', icon: DownOutline },
  filter: { type: 'filter', icon: FilterOutline },
  attachment: { type: 'paper-clip', icon: PaperClipOutline },
  close: { type: 'close', icon: CloseOutline },
  external: { type: 'export', icon: ExportOutline },
  move: { type: 'swap', icon: SwapOutline },
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
