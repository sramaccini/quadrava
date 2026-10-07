import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideLowcodeComponents } from 'components';
import { Authorization, DataClient, Notifier, RuntimeDiagnostics, ScreenNavigator, UserProvider } from 'core';
import { DemoDiagnostics, DemoNavigator, DemoNotifier, DemoSession, MockDataClient } from '../demo/demo-ports';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideLowcodeComponents(),
    // Nella demo le porte sono finte; l'app reale usa le implementazioni della libreria `services`.
    { provide: Authorization, useExisting: DemoSession },
    { provide: UserProvider, useExisting: DemoSession },
    { provide: DataClient, useExisting: MockDataClient },
    { provide: ScreenNavigator, useExisting: DemoNavigator },
    { provide: Notifier, useExisting: DemoNotifier },
    { provide: RuntimeDiagnostics, useExisting: DemoDiagnostics },
  ],
};
