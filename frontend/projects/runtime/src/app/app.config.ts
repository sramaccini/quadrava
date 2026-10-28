import { provideHttpClient, withFetch } from '@angular/common/http';
import { ApplicationConfig, provideBrowserGlobalErrorListeners, type EnvironmentProviders, type Provider } from '@angular/core';
import { provideRouter } from '@angular/router';
import { NzNotifier, SectionTools, provideLowcodeComponents } from 'components';
import { Authorization, DataClient, DefinitionSource, Notifier, RuntimeDiagnostics, ScreenNavigator, SETTINGS_VALUES, SnapshotDefinitions, UserProvider, type ProjectSnapshot } from 'core';
import { provideLowcodeServices, provideRegistryDefinitions } from 'services';
import { DemoDiagnostics, DemoSession, MockDataClient } from '../demo/demo-ports';
import { ExampleDefinitions } from '../demo/example-definitions';
import { routes } from './app.routes';
import { RouterNavigator } from './navigation.service';
import { ShowcaseTools } from './showcase/showcase-tools';
import { APPLICATION_SETTINGS, DEFAULT_APPLICATION_SETTINGS, DEFAULT_RUNTIME_CONFIG, type ApplicationSettings, type RuntimeConfig } from './runtime-config';
import { BffShellSession, DemoShellSession, ShellSession } from './shell-session';

/**
 * Where screens, navigation and themes come from: the demo examples, the versions published in the registry, or the
 * project sent by Studio («Run project», ADR-16).
 */
function definitions(config: RuntimeConfig, settings: ApplicationSettings, project: ProjectSnapshot | null): Provider[] {
  if (project) return [{ provide: DefinitionSource, useValue: new SnapshotDefinitions(project, settings.themes ?? Object.keys(project.themes)) }];
  if (config.definitions.source === 'registry') {
    const { source: _, languages: _languages, defaultLanguage: _default, ...registry } = config.definitions;
    return provideRegistryDefinitions(registry);
  }
  return [{ provide: DefinitionSource, useExisting: ExampleDefinitions }];
}

/**
 * The ports: fake ones in the demo (profiles, in-memory data, reports in the page); with the BFF the real ones of the
 * `services` library (session, permissions from the authorization service, data and telemetry through the BFF).
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

export function appConfigFor(config: RuntimeConfig, settings: ApplicationSettings = DEFAULT_APPLICATION_SETTINGS, project: ProjectSnapshot | null = null): ApplicationConfig {
  return {
    providers: [
      provideBrowserGlobalErrorListeners(),
      { provide: APPLICATION_SETTINGS, useValue: settings },
      // The settings of the application, `settings` in the expressions (for example the base address of a service).
      { provide: SETTINGS_VALUES, useValue: () => settings.settings ?? {} },
      provideRouter(routes),
      provideLowcodeComponents(),
      ...definitions(config, settings, project),
      ...ports(config),
      { provide: ScreenNavigator, useExisting: RouterNavigator },
      { provide: Notifier, useExisting: NzNotifier },
      // In the showcases every section has «JSON» and «Help».
      { provide: SectionTools, useExisting: ShowcaseTools },
    ],
  };
}

/** Configuration of the demo (definitions from the examples, fake ports), also used by the tests. */
export const appConfig: ApplicationConfig = appConfigFor(DEFAULT_RUNTIME_CONFIG);
