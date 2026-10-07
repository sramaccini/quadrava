import { InjectionToken } from '@angular/core';

export interface LowcodeServicesConfig {
  /** Identificativo dell'applicazione, passato al servizio di autorizzazione e alla telemetria. */
  appId: string;
  /** Endpoint del BFF con i dati dell'utente autenticato. */
  sessionUrl?: string;
  /** Dove mandare l'utente se la sessione manca o è scaduta (il BFF avvia il login OIDC). */
  loginUrl?: string;
  /** Base del contratto di autorizzazione. */
  authzBase?: string;
  /** Base del contratto di telemetria. */
  telemetryBase?: string;
  /** Telemetria attiva. Gli errori sono sempre inviati, entro il limite per minuto. */
  telemetry?: boolean;
  /** Massimo di segnalazioni inviate al minuto. */
  telemetryMaxPerMinute?: number;
}

export interface ResolvedServicesConfig {
  appId: string;
  sessionUrl: string;
  loginUrl: string;
  authzBase: string;
  telemetryBase: string;
  telemetry: boolean;
  telemetryMaxPerMinute: number;
}

export const LOWCODE_SERVICES_CONFIG = new InjectionToken<ResolvedServicesConfig>('LOWCODE_SERVICES_CONFIG');

export function resolveConfig(config: LowcodeServicesConfig): ResolvedServicesConfig {
  return {
    appId: config.appId,
    sessionUrl: config.sessionUrl ?? '/bff/user',
    loginUrl: config.loginUrl ?? '/oauth2/authorization/keycloak',
    authzBase: config.authzBase ?? '/authz',
    telemetryBase: config.telemetryBase ?? '/telemetry/v1',
    telemetry: config.telemetry ?? true,
    telemetryMaxPerMinute: config.telemetryMaxPerMinute ?? 30,
  };
}

/** Indirizzamento verso un'altra pagina (login). Sostituibile nei test. */
export const LOWCODE_REDIRECT = new InjectionToken<(url: string) => void>('LOWCODE_REDIRECT', {
  providedIn: 'root',
  factory: () => (url: string) => globalThis.location.assign(url),
});
