import { Injector } from '@angular/core';
import type { ScreenDefinition } from 'schema';
import { runSteps } from './action-engine';
import {
  Authorization,
  Confirmation,
  DataClient,
  FormDialog,
  Notifier,
  RuntimeDiagnostics,
  RuntimeTracer,
  ScreenNavigator,
  UserProvider,
  type DataRequest,
  type DataRequestOptions,
  type FormDialogRequest,
  type SpanAttributes,
  type SpanContext,
} from './ports';
import { I18n } from './i18n';
import { ScreenRuntime } from './screen-runtime';

/** Span recorded by the fake tracer: `ok` stays undefined while the span is open. */
export interface RecordedSpan {
  name: string;
  attributes: SpanAttributes;
  parent?: SpanContext;
  context: SpanContext;
  ok?: boolean;
  endAttributes?: SpanAttributes;
}

/** Test doubles for the ports: they record the calls and let tests choose the responses. */
export class Fakes {
  permissions = new Set<string>();
  requests: DataRequest[] = [];
  /** Options of every request, in the same order as `requests`. */
  requestOptions: (DataRequestOptions | undefined)[] = [];
  spans: RecordedSpan[] = [];
  toasts: { message: string; kind?: string }[] = [];
  navigations: { screen: string; params: Record<string, unknown> }[] = [];
  reports: { screen: string; source: string; error: string }[] = [];
  /** Confirmation messages requested and answers to give in order (when they run out, the user gives up). */
  confirmations: string[] = [];
  confirmAnswers: boolean[] = [];
  /** Form windows opened and values to «enter» in order (when they run out, the user cancels). */
  dialogs: FormDialogRequest[] = [];
  dialogValues: Record<string, unknown>[] = [];
  i18n = new I18n();
  respond: (request: DataRequest) => unknown = () => ({ items: [], total: 0 });

  readonly deps = {
    authorization: { can: (p: string) => this.permissions.has(p) } as Authorization,
    userProvider: { user: () => ({ username: 'test' }) } as UserProvider,
    data: {
      request: async (r: DataRequest, options?: DataRequestOptions) => {
        this.requests.push(r);
        this.requestOptions.push(options);
        return this.respond(r);
      },
    } as DataClient,
    navigator: { navigate: (screen: string, params: Record<string, unknown>) => this.navigations.push({ screen, params }) } as ScreenNavigator,
    notifier: { toast: (message: string, kind?: string) => this.toasts.push({ message, kind }) } as Notifier,
    confirmation: { confirm: async (message: string) => { this.confirmations.push(message); return this.confirmAnswers.shift() ?? false; } } as Confirmation,
    formDialog: {
      open: async (request: FormDialogRequest) => {
        this.dialogs.push(request);
        const values = this.dialogValues.shift();
        if (!values) return false;
        return runSteps(request.runtime, request.form.actions?.[0]?.onClick ?? [], { ...request.scope, form: values });
      },
    } as FormDialog,
    i18n: this.i18n,
    tracer: {
      start: (name: string, attributes: SpanAttributes, parent?: SpanContext) => {
        const id = String(this.spans.length + 1).padStart(16, '0');
        const span: RecordedSpan = { name, attributes, parent, context: { traceId: parent?.traceId ?? id.padStart(32, '0'), spanId: id, sampled: true } };
        this.spans.push(span);
        return {
          context: span.context,
          end: (ok: boolean, endAttributes?: SpanAttributes) => {
            if (span.ok !== undefined) return;
            span.ok = ok;
            span.endAttributes = endAttributes;
          },
        };
      },
    } as RuntimeTracer,
    diagnostics: { report: (e: { screen: string; source: string; error: string }) => this.reports.push(e) } as RuntimeDiagnostics,
  };

  runtime(definition: ScreenDefinition, injector: Injector, params: Record<string, unknown> = {}): ScreenRuntime {
    return new ScreenRuntime(definition, this.deps, injector, params);
  }
}
