import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { EnvironmentProviders, inject, makeEnvironmentProviders, provideAppInitializer } from '@angular/core';
import { Authorization, DataClient, RuntimeDiagnostics, RuntimeTracer, UserProvider } from 'core';
import { HttpAuthorization } from './authorization';
import { LOWCODE_SERVICES_CONFIG, resolveConfig, type LowcodeServicesConfig } from './config';
import { HttpDataClient } from './http-data-client';
import { HttpDiagnostics } from './diagnostics';
import { lowcodeHttpInterceptor } from './interceptor';
import { HttpSession } from './session';
import { HttpTracer } from './tracer';

/**
 * Collega le porte del core alle implementazioni reali. All'avvio carica l'utente e i permessi:
 * se la sessione manca, il flusso riparte dal login e non si carica altro.
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
    provideAppInitializer(async () => {
      // Tutte le dipendenze prima del primo await: dopo, inject() non è più nel contesto di iniezione.
      const session = inject(HttpSession);
      const authorization = inject(HttpAuthorization);
      await session.load();
      if (session.state() === 'authenticated') await authorization.load();
    }),
  ]);
}
