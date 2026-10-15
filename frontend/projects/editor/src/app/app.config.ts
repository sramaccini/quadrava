import { ApplicationConfig, inject, provideBrowserGlobalErrorListeners, provideEnvironmentInitializer } from '@angular/core';
import {
  ApartmentOutline,
  ApiOutline,
  AppstoreOutline,
  ArrowDownOutline,
  ArrowUpOutline,
  CloseCircleOutline,
  ControlOutline,
  CopyOutline,
  DeleteOutline,
  DesktopOutline,
  DownloadOutline,
  DownOutline,
  IdcardOutline,
  LayoutOutline,
  MinusSquareOutline,
  MobileOutline,
  PlusOutline,
  PlusSquareOutline,
  ProfileOutline,
  PushpinFill,
  PushpinOutline,
  RedoOutline,
  RightOutline,
  ReloadOutline,
  ScissorOutline,
  SelectOutline,
  SlidersOutline,
  StarOutline,
  TabletOutline,
  UndoOutline,
  UploadOutline,
  WarningOutline,
} from '@ant-design/icons-angular/icons';
import { ICON_TYPES, NzNotifier, provideLowcodeComponents } from 'components';
import { I18n, Notifier } from 'core';
import { provideNzIcons } from 'ng-zorro-antd/icon';
import { EDITOR_MESSAGES } from './messages';
import { DocumentState } from './model/document-state';
import { EditorStore } from './model/editor-store';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideLowcodeComponents(),
    // provideNzIcons does not add up: it replaces the list registered by provideLowcodeComponents, which must therefore be repeated.
    provideNzIcons([
      ...Object.values(ICON_TYPES).map((i) => i.icon),
      ApartmentOutline,
      ApiOutline,
      AppstoreOutline,
      ArrowDownOutline,
      ArrowUpOutline,
      CloseCircleOutline,
      ControlOutline,
      CopyOutline,
      DeleteOutline,
      DesktopOutline,
      DownloadOutline,
      DownOutline,
      IdcardOutline,
      LayoutOutline,
      MinusSquareOutline,
      MobileOutline,
      PlusOutline,
      PlusSquareOutline,
      ProfileOutline,
      PushpinFill,
      PushpinOutline,
      RedoOutline,
      RightOutline,
      ReloadOutline,
      ScissorOutline,
      SelectOutline,
      SlidersOutline,
      StarOutline,
      TabletOutline,
      UndoOutline,
      UploadOutline,
      WarningOutline,
    ]),
    provideEnvironmentInitializer(() => {
      const i18n = inject(I18n);
      for (const [locale, messages] of Object.entries(EDITOR_MESSAGES)) i18n.addMessages(locale, messages);
    }),
    // The fields generated from the schema work on the screen; the navigation editor redirects them to its own document.
    { provide: DocumentState, useExisting: EditorStore },
    // The runtime ports serve only the preview, which runs in its iframe (preview-config.ts).
    { provide: Notifier, useExisting: NzNotifier },
  ],
};
