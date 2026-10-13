import { provideHttpClient, withFetch } from '@angular/common/http';
import { ApplicationConfig, provideBrowserGlobalErrorListeners, type Provider } from '@angular/core';
import { provideRouter } from '@angular/router';
import { NzNotifier, provideLowcodeComponents } from 'components';
import { Authorization, DataClient, DefinitionSource, Notifier, RuntimeDiagnostics, ScreenNavigator, UserProvider } from 'core';
import { provideRegistryDefinitions } from 'services';
import { DemoDiagnostics, DemoSession, MockDataClient } from '../demo/demo-ports';
import { ExampleDefinitions } from '../demo/example-definitions';
import { routes } from './app.routes';
import { RouterNavigator } from './navigation.service';
import { DEFAULT_RUNTIME_CONFIG, type RuntimeConfig } from './runtime-config';

/** Da dove vengono schermate, navigazione e temi: gli esempi della demo o le versioni pubblicate nel registro. */
function definitions(config: RuntimeConfig): Provider[] {
  if (config.definitions.source === 'registry') {
    const { source: _, ...registry } = config.definitions;
    return provideRegistryDefinitions(registry);
  }
  return [{ provide: DefinitionSource, useExisting: ExampleDefinitions }];
}

export function appConfigFor(config: RuntimeConfig): ApplicationConfig {
  return {
    providers: [
      provideBrowserGlobalErrorListeners(),
      provideRouter(routes),
      provideHttpClient(withFetch()),
      provideLowcodeComponents(),
      ...definitions(config),
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
}

/** Configurazione della demo (definizioni dagli esempi), usata anche dai test. */
export const appConfig: ApplicationConfig = appConfigFor(DEFAULT_RUNTIME_CONFIG);
