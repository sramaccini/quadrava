import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { EnvironmentProviders, inject, makeEnvironmentProviders, provideAppInitializer } from '@angular/core';
import { Authorization, DataClient, LiveUpdates, RuntimeDiagnostics, RuntimeTracer, UserProvider } from 'core';
import { HttpAuthorization } from './authorization';
import { LOWCODE_SERVICES_CONFIG, resolveConfig, type LowcodeServicesConfig } from './config';
import { HttpDataClient } from './http-data-client';
import { HttpDiagnostics } from './diagnostics';
import { lowcodeHttpInterceptor } from './interceptor';
import { EventSourceLiveUpdates } from './live-updates';
import { HttpSession } from './session';
import { HttpTracer } from './tracer';

/**
 * Connects the core ports to the real implementations. At start-up it loads the user and the permissions:
 * if the session is missing, the flow restarts from the login and nothing else is loaded.
 */
export function provideLowcodeServices(config: LowcodeServicesConfig): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideHttpClient(withFetch(), withInterceptors([lowcodeHttpInterceptor])),
    { provide: LOWCODE_SERVICES_CONFIG, useValue: resolveConfig(config) },
    { provide: Authorization, useExisting: HttpAuthorization },
    { provide: UserProvider, useExisting: HttpSession },
    { provide: DataClient, useExisting: HttpDataClient },
    { provide: RuntimeDiagnostics, useExisting: HttpDiagnostics },
    { provide: RuntimeTracer, useExisting: HttpTracer },
    { provide: LiveUpdates, useExisting: EventSourceLiveUpdates },
    provideAppInitializer(async () => {
      // All dependencies before the first await: afterwards, inject() is no longer in the injection context.
      const session = inject(HttpSession);
      const authorization = inject(HttpAuthorization);
      await session.load();
      if (session.state() === 'authenticated') await authorization.load();
    }),
  ]);
}
