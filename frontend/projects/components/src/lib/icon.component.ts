import { ChangeDetectionStrategy, Component, Injectable, computed, effect, inject, input, signal } from '@angular/core';
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
import type { IconDefinition } from '@ant-design/icons-angular';
import { IconFiles } from 'core';
import { NzIconModule, NzIconService } from 'ng-zorro-antd/icon';
import { ANT_FILLED, ANT_OUTLINED } from './ant-icon-names.generated';

/**
 * Short names of the built-in set (name used in the JSON → Ant Design icon), registered statically with the bundle
 * (`provideLcComponents`). The other Ant Design icons are known by name and fetched on first use from the static files
 * of the same origin (ADR-29); an unknown name shows nothing and fetches nothing. `filled` is the filled form, drawn
 * for a pressed toggle.
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

const OUTLINED = new Set(ANT_OUTLINED);
const FILLED = new Set(ANT_FILLED);

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

type IconTheme = 'outline' | 'fill';

/**
 * Fetches the Ant Design icons that are not in the bundle, once each, through the `IconFiles` port (ADR-29), and
 * registers them with NG-ZORRO. Only names of the generated list are asked for. A failure registers nothing and the icon
 * is not drawn; it never throws, unlike the dynamic loading of NG-ZORRO, which is not used.
 */
@Injectable({ providedIn: 'root' })
export class IconLoader {
  private readonly icons = inject(NzIconService);
  private readonly files = inject(IconFiles, { optional: true });
  private readonly started = new Set<string>();
  /** Bumped at every icon registered, so that the icons waiting for it are drawn. */
  readonly version = signal(0);

  /** Whether NG-ZORRO already has the icon (from the bundle or fetched). */
  has(type: string, theme: IconTheme): boolean {
    return this.icons.getCachedIcons().has(theme === 'fill' ? `${type}-fill` : `${type}-o`);
  }

  /** Fetches the icon once, if it is not there yet. */
  load(type: string, theme: IconTheme): void {
    const key = `${theme}/${type}`;
    const files = this.files;
    if (!files || this.has(type, theme) || this.started.has(key) || (theme === 'outline' ? !OUTLINED.has(type) : !FILLED.has(type))) return;
    this.started.add(key);
    void files.svg(theme, type).then((svg) => {
      if (svg === null) return;
      this.icons.addIcon({ name: type, theme, icon: svg });
      this.version.update((v) => v + 1);
    });
  }
}

@Component({
  selector: 'lc-icon',
  imports: [NzIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `:host { display: inline-flex; width: 1em; flex: none; justify-content: center; }`,
  template: `
    @if (shown(); as icon) {
      <span nz-icon [nzType]="icon.type" [nzTheme]="icon.theme" aria-hidden="true"></span>
    }
  `,
})
export class IconComponent {
  readonly name = input<string | undefined>(undefined);
  /** Draws the filled form, when the icon has one (a pressed toggle). */
  readonly filled = input(false);
  private readonly loader = inject(IconLoader);
  private readonly type = computed(() => iconType(this.name()));
  private readonly wantsFill = computed(() => this.filled() && hasFilledForm(this.name()));

  /** The icon as it can be drawn now: the filled form once it is there, otherwise the outlined one; null until then. */
  protected readonly shown = computed<{ type: string; theme: IconTheme } | null>(() => {
    const type = this.type();
    if (!type) return null;
    this.loader.version();
    if (this.wantsFill() && this.loader.has(type, 'fill')) return { type, theme: 'fill' };
    return this.loader.has(type, 'outline') ? { type, theme: 'outline' } : null;
  });

  constructor() {
    effect(() => {
      const type = this.type();
      if (!type) return;
      this.loader.load(type, 'outline');
      if (this.wantsFill()) this.loader.load(type, 'fill');
    });
  }
}
