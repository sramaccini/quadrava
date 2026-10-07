import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { EnvironmentProviders, inject, makeEnvironmentProviders, provideAppInitializer } from '@angular/core';
import { Authorization, DataClient, RuntimeDiagnostics, UserProvider } from 'core';
import { HttpAuthorization } from './authorization';
import { LOWCODE_SERVICES_CONFIG, resolveConfig, type LowcodeServicesConfig } from './config';
import { HttpDataClient } from './http-data-client';
import { HttpDiagnostics } from './diagnostics';
import { lowcodeHttpInterceptor } from './interceptor';
import { HttpSession } from './session';

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
    provideAppInitializer(async () => {
      const session = inject(HttpSession);
      await session.load();
      if (session.state() === 'authenticated') await inject(HttpAuthorization).load();
    }),
  ]);
}
