import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { Authorization, DataClient, Notifier, RuntimeDiagnostics, ScreenComponent, ScreenNavigator, UserProvider, type DataRequest } from 'core';
import type { NodeDefinition, ScreenDefinition } from 'schema';
import { provideLowcodeComponents } from './provide';

/** For tests only: mounts a screen with the standard catalogue and fake ports that record everything. */
export interface ScreenHarness {
  fixture: ComponentFixture<ScreenComponent>;
  el: HTMLElement;
  requests: DataRequest[];
  toasts: string[];
  navigations: { screen: string; params: Record<string, unknown> }[];
  reports: { screen: string; source: string; error: string }[];
  permissions: ReturnType<typeof signal<Set<string>>>;
  /** Runs change detection and pending promises. */
  settle(rounds?: number): Promise<void>;
  /** Repeats `settle` until the condition is true (at most ~2 s). */
  until(condition: () => boolean, label: string): Promise<void>;
}

export async function renderScreen(options: {
  components: NodeDefinition[];
  dataSources?: ScreenDefinition['dataSources'];
  respond?: (request: DataRequest) => unknown;
  granted?: string[];
  extraProviders?: unknown[];
}): Promise<ScreenHarness> {
  const permissions = signal(new Set(options.granted ?? []));
  const requests: DataRequest[] = [];
  const toasts: string[] = [];
  const navigations: { screen: string; params: Record<string, unknown> }[] = [];
  const reports: { screen: string; source: string; error: string }[] = [];
  const respond = options.respond ?? (() => ({}));
  TestBed.configureTestingModule({
    providers: [
      provideLowcodeComponents(),
      { provide: Authorization, useValue: { can: (p: string) => permissions().has(p) } },
      { provide: UserProvider, useValue: { user: () => ({ username: 'u' }) } },
      { provide: ScreenNavigator, useValue: { navigate: (screen: string, params: Record<string, unknown>) => navigations.push({ screen, params }) } },
      { provide: Notifier, useValue: { toast: (m: string) => toasts.push(m) } },
      { provide: RuntimeDiagnostics, useValue: { report: (e: { screen: string; source: string; error: string }) => reports.push(e) } },
      { provide: DataClient, useValue: { request: async (r: DataRequest) => (requests.push(r), respond(r)) } },
      ...((options.extraProviders ?? []) as never[]),
    ],
  });
  const fixture = TestBed.createComponent(ScreenComponent);
  fixture.componentRef.setInput('definition', {
    schemaVersion: '1.0',
    screen: 'prova',
    dataSources: options.dataSources ?? {},
    components: options.components,
  } satisfies ScreenDefinition);
  const settle = async (rounds = 4): Promise<void> => {
    for (let i = 0; i < rounds; i++) {
      fixture.detectChanges();
      await fixture.whenStable();
      await new Promise((r) => setTimeout(r, 0));
    }
  };
  const until = async (condition: () => boolean, label: string): Promise<void> => {
    for (let i = 0; i < 100; i++) {
      await settle(1);
      if (condition()) return;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error(`timeout: ${label}\n${(fixture.nativeElement as HTMLElement).innerHTML.slice(0, 1500)}`);
  };
  await settle();
  return { fixture, el: fixture.nativeElement as HTMLElement, requests, toasts, navigations, reports, permissions, settle, until };
}

/** Text without multiple spaces or non-breaking spaces (those of the number formats). */
export const plain = (text: string | null | undefined): string => (text ?? '').replace(/[  \s]+/g, ' ').trim();

/** Texts of the cells of a column (0 = first column) of the data rows. */
export const columnTexts = (el: HTMLElement, column: number, table = 0): string[] =>
  [...(el.querySelectorAll('nz-table')[table]?.querySelectorAll('tbody tr:not(.ant-table-placeholder)') ?? [])]
    .filter((tr) => !tr.classList.contains('lc-extra-row'))
    .map((tr) => plain(tr.querySelectorAll('td')[column]?.textContent));
