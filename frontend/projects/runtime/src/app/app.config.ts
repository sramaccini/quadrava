import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { NzNotifier, provideLowcodeComponents } from 'components';
import { Authorization, DataClient, Notifier, RuntimeDiagnostics, ScreenNavigator, UserProvider } from 'core';
import { DemoDiagnostics, DemoSession, MockDataClient } from '../demo/demo-ports';
import { routes } from './app.routes';
import { RouterNavigator } from './navigation.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideLowcodeComponents(),
    // Nella demo le porte sono finte (tranne la navigazione, che usa il router vero);
    // l'app reale usa le implementazioni della libreria `services`.
    { provide: Authorization, useExisting: DemoSession },
    { provide: UserProvider, useExisting: DemoSession },
    { provide: DataClient, useExisting: MockDataClient },
    { provide: ScreenNavigator, useExisting: RouterNavigator },
    { provide: Notifier, useExisting: NzNotifier },
    { provide: RuntimeDiagnostics, useExisting: DemoDiagnostics },
  ],
};
