import { HttpClient, HttpResponse } from '@angular/common/http';
import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { Authorization } from 'core';
import { firstValueFrom } from 'rxjs';
import { LOWCODE_SERVICES_CONFIG } from './config';

interface Capabilities {
  permissions: string[];
  version: string;
  ttlSeconds?: number;
}

export interface ResourceRef {
  type: string;
  id: string;
}

type Status = 'idle' | 'loading' | 'ready' | 'error';

/**
 * Permessi dell'utente dal contratto `authz`. Si basa su signal: quando cambiano, l'interfaccia si aggiorna.
 * In caso di errore l'insieme resta vuoto (fail-closed). Il backend ricontrolla comunque ogni richiesta.
 */
@Injectable({ providedIn: 'root' })
export class HttpAuthorization extends Authorization {
  private readonly http = inject(HttpClient);
  private readonly config = inject(LOWCODE_SERVICES_CONFIG);
  private readonly permissions = signal<ReadonlySet<string>>(new Set());
  private timer: ReturnType<typeof setTimeout> | undefined;
  private generation = 0;

  readonly status = signal<Status>('idle');
  readonly version = signal<string | null>(null);
  /** Quanti permessi ha l'utente (per il menu utente). */
  readonly count = computed(() => this.permissions().size);

  constructor() {
    super();
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  override can(permission: string): boolean {
    return this.permissions().has(permission);
  }

  async load(): Promise<void> {
    const generation = ++this.generation;
    clearTimeout(this.timer);
    this.status.set('loading');
    try {
      const res = await firstValueFrom(
        this.http.get<Capabilities>(`${this.config.authzBase}/capabilities`, { params: { app: this.config.appId }, observe: 'response' }),
      );
      if (generation !== this.generation) return; // è partito un caricamento più recente
      const body = res.body;
      if (!body || !Array.isArray(body.permissions)) throw new Error('risposta non valida');
      this.permissions.set(new Set(body.permissions));
      this.version.set(body.version ?? res.headers.get('X-Permissions-Version'));
      this.status.set('ready');
      if (body.ttlSeconds && body.ttlSeconds > 0) {
        this.timer = setTimeout(() => void this.load(), body.ttlSeconds * 1000);
      }
    } catch {
      if (generation !== this.generation) return;
      this.permissions.set(new Set());
      this.status.set('error');
    }
  }

  /** Chiamato dall'interceptor a ogni risposta: se la versione dei permessi cambia, si ricaricano. */
  observeVersion(version: string): void {
    if (this.status() === 'ready' && this.version() !== version) void this.load();
  }

  /** Verifica puntuale su una risorsa (permessi per singolo record). Errore o risposta incompleta: negato. */
  async check(permission: string, resource?: ResourceRef): Promise<boolean> {
    try {
      const res: HttpResponse<{ results?: { allowed: boolean }[] }> = await firstValueFrom(
        this.http.post<{ results?: { allowed: boolean }[] }>(`${this.config.authzBase}/check`, { checks: [{ permission, resource }] }, { observe: 'response' }),
      );
      return res.body?.results?.[0]?.allowed === true;
    } catch {
      return false;
    }
  }
}
