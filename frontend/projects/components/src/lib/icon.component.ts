import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  AppstoreOutline,
  BellOutline,
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
  ShareAltOutline,
  ClearOutline,
  CodeOutline,
  ReloadOutline,
  VerticalLeftOutline,
  VerticalRightOutline,
  CopyOutline,
  EyeInvisibleOutline,
  EyeOutline,
  SaveOutline,
  EditOutline,
  UserAddOutline,
  ArrowLeftOutline,
  PlayCircleOutline,
  DownloadOutline,
  FlagFill,
  FlagOutline,
  LikeFill,
  LikeOutline,
} from '@ant-design/icons-angular/icons';
import * as AntIcons from '@ant-design/icons-angular/icons';
import type { IconDefinition } from '@ant-design/icons-angular';
import { NzIconModule } from 'ng-zorro-antd/icon';

/**
 * Short names of the built-in set (name used in the JSON → Ant Design icon), kept next to the Ant Design names. The
 * icons are all registered statically (`provideLcComponents`): an unknown name shows nothing and never causes icons to
 * be loaded from the network. `filled` is the filled form, drawn for a pressed toggle.
 */
export const ICON_TYPES: Record<string, { type: string; icon: IconDefinition; filled?: IconDefinition }> = {
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
  bell: { type: 'bell', icon: BellOutline },
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
  // Common actions of buttons.
  save: { type: 'save', icon: SaveOutline },
  edit: { type: 'edit', icon: EditOutline },
  link: { type: 'link', icon: LinkOutline },
  share: { type: 'share-alt', icon: ShareAltOutline },
  eye: { type: 'eye', icon: EyeOutline },
  'eye-invisible': { type: 'eye-invisible', icon: EyeInvisibleOutline },
  'user-add': { type: 'user-add', icon: UserAddOutline },
  back: { type: 'arrow-left', icon: ArrowLeftOutline },
  play: { type: 'play-circle', icon: PlayCircleOutline },
  download: { type: 'download', icon: DownloadOutline },
  flag: { type: 'flag', icon: FlagOutline, filled: FlagFill },
  like: { type: 'like', icon: LikeOutline, filled: LikeFill },
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

/** Every Ant Design icon in the outlined and filled forms (the two-tone ones are not used). */
export const ANT_ICONS: readonly IconDefinition[] = Object.values(AntIcons as Record<string, IconDefinition>).filter(
  (i) => i.theme === 'outline' || i.theme === 'fill',
);
const OUTLINED = new Set(ANT_ICONS.filter((i) => i.theme === 'outline').map((i) => i.name));
const FILLED = new Set(ANT_ICONS.filter((i) => i.theme === 'fill').map((i) => i.name));

/**
 * NG-ZORRO type of an icon name: a short name of the built-in set (`ICON_TYPES`) or the name of an Ant Design icon
 * (`share-alt`, `calendar`, `team`); `null` if the name is not known.
 */
export function iconType(name: string | undefined): string | null {
  if (!name) return null;
  return ICON_TYPES[name]?.type ?? (OUTLINED.has(name) ? name : null);
}

/** Whether the icon has a filled form, drawn for a pressed toggle. */
export function hasFilledForm(name: string | undefined): boolean {
  const type = iconType(name);
  return type !== null && FILLED.has(type);
}

@Component({
  selector: 'lc-icon',
  imports: [NzIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `:host { display: inline-flex; width: 1em; flex: none; justify-content: center; }`,
  template: `
    @if (type(); as t) {
      <span nz-icon [nzType]="t" [nzTheme]="theme()" aria-hidden="true"></span>
    }
  `,
})
export class IconComponent {
  readonly name = input<string | undefined>(undefined);
  /** Draws the filled form, when the icon has one (a pressed toggle). */
  readonly filled = input(false);
  protected readonly type = computed(() => iconType(this.name()));
  protected readonly theme = computed(() => (this.filled() && hasFilledForm(this.name()) ? 'fill' : 'outline'));
}
