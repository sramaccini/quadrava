import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  AppstoreOutline,
  QuestionCircleOutline,
  CheckCircleOutline,
  CheckOutline,
  CloseOutline,
  DeleteOutline,
  DownOutline,
  EllipsisOutline,
  ContainerOutline,
  EuroOutline,
  ExclamationCircleOutline,
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
  BoldOutline,
  ItalicOutline,
  StrikethroughOutline,
  FontSizeOutline,
  UnorderedListOutline as BulletsOutline,
  OrderedListOutline,
  MessageOutline,
  LinkOutline,
  ClearOutline,
  CodeOutline,
  ReloadOutline,
  VerticalLeftOutline,
  VerticalRightOutline,
  CopyOutline,
  EyeInvisibleOutline,
  EyeOutline,
} from '@ant-design/icons-angular/icons';
import type { IconDefinition } from '@ant-design/icons-angular';
import { NzIconModule } from 'ng-zorro-antd/icon';

/**
 * Built-in icon set: name used in the JSON → Ant Design icon. Icons are registered one by one
 * (`provideLowcodeComponents`): an unknown name shows nothing and never causes icons to be loaded from the network.
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
  check: { type: 'check', icon: CheckOutline },
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
  warning: { type: 'exclamation-circle', icon: ExclamationCircleOutline },
  external: { type: 'export', icon: ExportOutline },
  move: { type: 'swap', icon: SwapOutline },
  code: { type: 'code', icon: CodeOutline },
  reload: { type: 'reload', icon: ReloadOutline },
  first: { type: 'vertical-right', icon: VerticalRightOutline },
  last: { type: 'vertical-left', icon: VerticalLeftOutline },
  copy: { type: 'copy', icon: CopyOutline },
  // Show and hide the text of a password field.
  'password-show': { type: 'eye', icon: EyeOutline },
  'password-hide': { type: 'eye-invisible', icon: EyeInvisibleOutline },
  // Toolbar of the formatted-text editor.
  'rich-bold': { type: 'bold', icon: BoldOutline },
  'rich-italic': { type: 'italic', icon: ItalicOutline },
  'rich-strike': { type: 'strikethrough', icon: StrikethroughOutline },
  'rich-heading': { type: 'font-size', icon: FontSizeOutline },
  'rich-bullets': { type: 'unordered-list', icon: BulletsOutline },
  'rich-numbers': { type: 'ordered-list', icon: OrderedListOutline },
  'rich-quote': { type: 'message', icon: MessageOutline },
  'rich-link': { type: 'link', icon: LinkOutline },
  'rich-clear': { type: 'clear', icon: ClearOutline },
};

/** NG-ZORRO type of an icon name of the built-in set, or `null` if the name is not known. */
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
