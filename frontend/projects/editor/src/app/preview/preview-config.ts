import { ApplicationConfig, inject, provideBrowserGlobalErrorListeners, provideEnvironmentInitializer } from '@angular/core';
import { NzNotifier, provideLowcodeComponents } from 'components';
import { Authorization, DataClient, I18n, Notifier, RuntimeDiagnostics, ScreenNavigator, UserProvider } from 'core';
import { EDITOR_MESSAGES } from '../messages';
import { PreviewDataClient, PreviewDiagnostics, PreviewNavigator, PreviewSession } from './preview-ports';

/** Configuration of the application when it starts as the preview (inside the editor's iframe). */
export const previewConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideLowcodeComponents(),
    provideEnvironmentInitializer(() => {
      const i18n = inject(I18n);
      for (const [locale, messages] of Object.entries(EDITOR_MESSAGES)) i18n.addMessages(locale, messages);
    }),
    // No call leaves the browser: everything goes through the ports of the preview.
    { provide: Authorization, useExisting: PreviewSession },
    { provide: UserProvider, useExisting: PreviewSession },
    { provide: DataClient, useExisting: PreviewDataClient },
    { provide: ScreenNavigator, useExisting: PreviewNavigator },
    { provide: Notifier, useExisting: NzNotifier },
    { provide: RuntimeDiagnostics, useExisting: PreviewDiagnostics },
  ],
};
