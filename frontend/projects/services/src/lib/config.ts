import { InjectionToken } from '@angular/core';

export interface LowcodeServicesConfig {
  /** Identifier of the application, passed to the authorization service and to telemetry. */
  appId: string;
  /** BFF endpoint with the data of the authenticated user. */
  sessionUrl?: string;
  /** Where to send the user when the session is missing or expired: the BFF starts the OIDC login and then returns to the page (`?return=`). */
  loginUrl?: string;
  /** Logout: POST to the BFF, which also closes the session of the identity provider. */
  logoutUrl?: string;
  /** Base of the authorization contract. */
  authzBase?: string;
  /** Base of the telemetry contract. */
  telemetryBase?: string;
  /** Telemetry enabled. Errors are always sent, within the per-minute limit. */
  telemetry?: boolean;
  /** Maximum number of reports sent per minute. */
  telemetryMaxPerMinute?: number;
  /** Share of sampled traces, from 0 to 1 (1 when absent): decided at the start of the trace; spans in error are always sent. */
  traceSampleRatio?: number;
  /** Maximum number of spans sent per minute (300 when absent). */
  traceMaxPerMinute?: number;
}

export interface ResolvedServicesConfig {
  appId: string;
  sessionUrl: string;
  loginUrl: string;
  logoutUrl: string;
  authzBase: string;
  telemetryBase: string;
  telemetry: boolean;
  telemetryMaxPerMinute: number;
  traceSampleRatio: number;
  traceMaxPerMinute: number;
}

export const LOWCODE_SERVICES_CONFIG = new InjectionToken<ResolvedServicesConfig>('LOWCODE_SERVICES_CONFIG');

export function resolveConfig(config: LowcodeServicesConfig): ResolvedServicesConfig {
  return {
    appId: config.appId,
    sessionUrl: config.sessionUrl ?? '/bff/user',
    loginUrl: config.loginUrl ?? '/bff/login',
    logoutUrl: config.logoutUrl ?? '/logout',
    authzBase: config.authzBase ?? '/authz',
    telemetryBase: config.telemetryBase ?? '/telemetry/v1',
    telemetry: config.telemetry ?? true,
    telemetryMaxPerMinute: config.telemetryMaxPerMinute ?? 30,
    traceSampleRatio: config.traceSampleRatio ?? 1,
    traceMaxPerMinute: config.traceMaxPerMinute ?? 300,
  };
}

/** Redirection to another page (login). Replaceable in tests. */
export const LOWCODE_REDIRECT = new InjectionToken<(url: string) => void>('LOWCODE_REDIRECT', {
  providedIn: 'root',
  factory: () => (url: string) => globalThis.location.assign(url),
});
