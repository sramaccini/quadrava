import { provideHttpClient, withFetch } from '@angular/common/http';
import { ApplicationConfig, provideBrowserGlobalErrorListeners, type EnvironmentProviders, type Provider } from '@angular/core';
import { provideRouter } from '@angular/router';
import { NzNotifier, provideLowcodeComponents } from 'components';
import { Authorization, DataClient, DefinitionSource, Notifier, RuntimeDiagnostics, ScreenNavigator, UserProvider } from 'core';
import { provideLowcodeServices, provideRegistryDefinitions } from 'services';
import { DemoDiagnostics, DemoSession, MockDataClient } from '../demo/demo-ports';
import { ExampleDefinitions } from '../demo/example-definitions';
import { routes } from './app.routes';
import { RouterNavigator } from './navigation.service';
import { DEFAULT_RUNTIME_CONFIG, type RuntimeConfig } from './runtime-config';
import { BffShellSession, DemoShellSession, ShellSession } from './shell-session';

/** Da dove vengono schermate, navigazione e temi: gli esempi della demo o le versioni pubblicate nel registro. */
function definitions(config: RuntimeConfig): Provider[] {
  if (config.definitions.source === 'registry') {
    const { source: _, ...registry } = config.definitions;
    return provideRegistryDefinitions(registry);
  }
  return [{ provide: DefinitionSource, useExisting: ExampleDefinitions }];
}

/**
 * Le porte: nella demo finte (profili, dati in memoria, segnalazioni in pagina); con il BFF quelle vere della
 * libreria `services` (sessione, permessi dal servizio di autorizzazione, dati e telemetria attraverso il BFF).
 */
function ports(config: RuntimeConfig): (Provider | EnvironmentProviders)[] {
  if (config.services?.source === 'bff') {
    return [provideLowcodeServices({ appId: config.services.appId }), { provide: ShellSession, useExisting: BffShellSession }];
  }
  return [
    provideHttpClient(withFetch()),
    { provide: Authorization, useExisting: DemoSession },
    { provide: UserProvider, useExisting: DemoSession },
    { provide: DataClient, useExisting: MockDataClient },
    { provide: RuntimeDiagnostics, useExisting: DemoDiagnostics },
    { provide: ShellSession, useExisting: DemoShellSession },
  ];
}

export function appConfigFor(config: RuntimeConfig): ApplicationConfig {
  return {
    providers: [
      provideBrowserGlobalErrorListeners(),
      provideRouter(routes),
      provideLowcodeComponents(),
      ...definitions(config),
      ...ports(config),
      { provide: ScreenNavigator, useExisting: RouterNavigator },
      { provide: Notifier, useExisting: NzNotifier },
    ],
  };
}

/** Configurazione della demo (definizioni dagli esempi, porte finte), usata anche dai test. */
export const appConfig: ApplicationConfig = appConfigFor(DEFAULT_RUNTIME_CONFIG);
