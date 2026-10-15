// Kit di conformità al contratto di ingestione della telemetria (contracts/telemetry.yaml): verifica via HTTP che un
// servizio di telemetria (quello di riferimento o quello di un cliente) si comporti come descrive il contratto.
//
//   node tools/conformance-telemetry.mjs --telemetry http://localhost:8083
//        [--token <JWT> | --user <utente> --password <password>] [--issuer …] [--max-bytes 1000000]
//
// Manda solo dati di prova (servizio «lowcode-conformance»). Esce con codice 1 se una prova fallisce.
import { call as httpCall, expect, isProblem, parseArgs, suite, tokenFromArgs } from './conformance-lib.mjs';

const args = parseArgs();
const base = (args.telemetry ?? 'http://localhost:8083').replace(/\/+$/, '');
const maxBytes = Number(args['max-bytes'] ?? 1_000_000);
const token = await tokenFromArgs(args);
const call = (method, path, options = {}) => httpCall(base, method, path, { token, ...options });
const { check, report } = suite();

const resource = { attributes: [{ key: 'service.name', value: { stringValue: 'lowcode-conformance' } }] };
const now = String(BigInt(Date.now()) * 1_000_000n);
const traces = {
  resourceSpans: [
    {
      resource,
      scopeSpans: [{ scope: { name: 'conformance' }, spans: [{ traceId: '4bf92f3577b34da6a3ce929d0e0e4736', spanId: '00f067aa0ba902b7', name: 'prova', kind: 1, startTimeUnixNano: now, endTimeUnixNano: now }] }],
    },
  ],
};
const logs = {
  resourceLogs: [{ resource, scopeLogs: [{ scope: { name: 'conformance' }, logRecords: [{ timeUnixNano: now, severityNumber: 9, severityText: 'INFO', body: { stringValue: 'prova di conformità' } }] }] }],
};

await check('senza token: 401', async () => {
  const r = await call('POST', '/telemetry/v1/traces', { body: traces, token: null });
  expect(r.status === 401, `atteso 401, ricevuto ${r.status}`);
}, { skip: !token });

await check('tracce OTLP/HTTP JSON: 202', async () => {
  const r = await call('POST', '/telemetry/v1/traces', { body: traces });
  expect(r.status === 202, `atteso 202, ricevuto ${r.status}`);
});

await check('log OTLP/HTTP JSON: 202', async () => {
  const r = await call('POST', '/telemetry/v1/logs', { body: logs });
  expect(r.status === 202, `atteso 202, ricevuto ${r.status}`);
});

await check('corpo non JSON: 400 in formato Problem', async () => {
  const r = await call('POST', '/telemetry/v1/logs', { raw: '{non json' });
  expect(r.status === 400, `atteso 400, ricevuto ${r.status}`);
  expect(isProblem(r), 'la risposta non è un Problem (title, status)');
});

await check('JSON che non è un payload OTLP del segnale: 400', async () => {
  const wrongSignal = await call('POST', '/telemetry/v1/traces', { body: logs });
  expect(wrongSignal.status === 400, `log mandati come tracce: atteso 400, ricevuto ${wrongSignal.status}`);
  const notObject = await call('POST', '/telemetry/v1/logs', { raw: '[1, 2, 3]' });
  expect(notObject.status === 400, `elenco al posto di un oggetto: atteso 400, ricevuto ${notObject.status}`);
});

await check(`corpo oltre il limite (${maxBytes} byte): 413 in formato Problem`, async () => {
  const big = { resourceLogs: [{ resource, scopeLogs: [{ scope: { name: 'conformance' }, logRecords: [{ timeUnixNano: now, body: { stringValue: 'x'.repeat(maxBytes + 1) } }] }] }] };
  const r = await call('POST', '/telemetry/v1/logs', { body: big });
  expect(r.status === 413, `atteso 413, ricevuto ${r.status}`);
  expect(isProblem(r), 'la risposta non è un Problem');
});

report(`Conformità al contratto della telemetria (${base})`);
