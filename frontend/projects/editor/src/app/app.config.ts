import { ApplicationConfig, inject, provideBrowserGlobalErrorListeners, provideEnvironmentInitializer } from '@angular/core';
import {
  ArrowDownOutline,
  ArrowUpOutline,
  CloseCircleOutline,
  CopyOutline,
  DeleteOutline,
  DownloadOutline,
  DownOutline,
  FileAddOutline,
  FolderOpenOutline,
  LayoutOutline,
  PlusOutline,
  RedoOutline,
  RightOutline,
  ReloadOutline,
  ScissorOutline,
  SelectOutline,
  SnippetsOutline,
  UndoOutline,
  UploadOutline,
  WarningOutline,
} from '@ant-design/icons-angular/icons';
import { NzNotifier, provideLowcodeComponents } from 'components';
import { Authorization, DataClient, I18n, Notifier, RuntimeDiagnostics, ScreenNavigator, UserProvider } from 'core';
import { provideNzIcons } from 'ng-zorro-antd/icon';
import { EDITOR_MESSAGES } from './messages';
import { PreviewDataClient, PreviewDiagnostics, PreviewNavigator, PreviewSession } from './preview/preview-ports';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideLowcodeComponents(),
    provideNzIcons([
      ArrowDownOutline,
      ArrowUpOutline,
      CloseCircleOutline,
      CopyOutline,
      DeleteOutline,
      DownloadOutline,
      DownOutline,
      FileAddOutline,
      FolderOpenOutline,
      LayoutOutline,
      PlusOutline,
      RedoOutline,
      RightOutline,
      ReloadOutline,
      ScissorOutline,
      SelectOutline,
      SnippetsOutline,
      UndoOutline,
      UploadOutline,
      WarningOutline,
    ]),
    provideEnvironmentInitializer(() => {
      const i18n = inject(I18n);
      for (const [locale, messages] of Object.entries(EDITOR_MESSAGES)) i18n.addMessages(locale, messages);
    }),
    // L'anteprima usa porte proprie: nessuna chiamata esce dal browser.
    { provide: Authorization, useExisting: PreviewSession },
    { provide: UserProvider, useExisting: PreviewSession },
    { provide: DataClient, useExisting: PreviewDataClient },
    { provide: ScreenNavigator, useExisting: PreviewNavigator },
    { provide: Notifier, useExisting: NzNotifier },
    { provide: RuntimeDiagnostics, useExisting: PreviewDiagnostics },
  ],
};
