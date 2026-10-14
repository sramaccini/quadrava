import { ApplicationConfig, inject, provideBrowserGlobalErrorListeners, provideEnvironmentInitializer } from '@angular/core';
import {
  ApartmentOutline,
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
  MobileOutline,
  PlusOutline,
  ProfileOutline,
  RedoOutline,
  RightOutline,
  ReloadOutline,
  ScissorOutline,
  SelectOutline,
  SlidersOutline,
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
    // provideNzIcons non si somma: sostituisce l'elenco registrato da provideLowcodeComponents, che va quindi ripetuto.
    provideNzIcons([
      ...Object.values(ICON_TYPES).map((i) => i.icon),
      ApartmentOutline,
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
      MobileOutline,
      PlusOutline,
      ProfileOutline,
      RedoOutline,
      RightOutline,
      ReloadOutline,
      ScissorOutline,
      SelectOutline,
      SlidersOutline,
      TabletOutline,
      UndoOutline,
      UploadOutline,
      WarningOutline,
    ]),
    provideEnvironmentInitializer(() => {
      const i18n = inject(I18n);
      for (const [locale, messages] of Object.entries(EDITOR_MESSAGES)) i18n.addMessages(locale, messages);
    }),
    // I campi generati dallo schema lavorano sulla schermata; l'editor della navigazione li ridirige sul proprio documento.
    { provide: DocumentState, useExisting: EditorStore },
    // Le porte del runtime servono solo all'anteprima, che gira nel suo iframe (preview-config.ts).
    { provide: Notifier, useExisting: NzNotifier },
  ],
};
