// Conformance kit for the telemetry ingestion contract (contracts/telemetry.yaml): checks over HTTP that a telemetry
// service (the reference one or a customer's) behaves as the contract describes.
//
//   node tools/conformance-telemetry.mjs --telemetry http://localhost:8083
//        [--token <JWT> | --user <user> --password <password>] [--issuer …] [--max-bytes 1000000]
//
// It sends test data only (service «lowcode-conformance»). Exits with code 1 if a check fails.
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
      scopeSpans: [{ scope: { name: 'conformance' }, spans: [{ traceId: '4bf92f3577b34da6a3ce929d0e0e4736', spanId: '00f067aa0ba902b7', name: 'probe', kind: 1, startTimeUnixNano: now, endTimeUnixNano: now }] }],
    },
  ],
};
const logs = {
  resourceLogs: [{ resource, scopeLogs: [{ scope: { name: 'conformance' }, logRecords: [{ timeUnixNano: now, severityNumber: 9, severityText: 'INFO', body: { stringValue: 'conformance probe' } }] }] }],
};

await check('without a token: 401', async () => {
  const r = await call('POST', '/telemetry/v1/traces', { body: traces, token: null });
  expect(r.status === 401, `expected 401, got ${r.status}`);
}, { skip: !token });

await check('OTLP/HTTP JSON traces: 202', async () => {
  const r = await call('POST', '/telemetry/v1/traces', { body: traces });
  expect(r.status === 202, `expected 202, got ${r.status}`);
});

await check('OTLP/HTTP JSON logs: 202', async () => {
  const r = await call('POST', '/telemetry/v1/logs', { body: logs });
  expect(r.status === 202, `expected 202, got ${r.status}`);
});

await check('body is not JSON: 400 in Problem format', async () => {
  const r = await call('POST', '/telemetry/v1/logs', { raw: '{not json' });
  expect(r.status === 400, `expected 400, got ${r.status}`);
  expect(isProblem(r), 'the response is not a Problem (title, status)');
});

await check('JSON that is not an OTLP payload of the signal: 400', async () => {
  const wrongSignal = await call('POST', '/telemetry/v1/traces', { body: logs });
  expect(wrongSignal.status === 400, `logs sent as traces: expected 400, got ${wrongSignal.status}`);
  const notObject = await call('POST', '/telemetry/v1/logs', { raw: '[1, 2, 3]' });
  expect(notObject.status === 400, `a list instead of an object: expected 400, got ${notObject.status}`);
});

await check(`body over the limit (${maxBytes} bytes): 413 in Problem format`, async () => {
  const big = { resourceLogs: [{ resource, scopeLogs: [{ scope: { name: 'conformance' }, logRecords: [{ timeUnixNano: now, body: { stringValue: 'x'.repeat(maxBytes + 1) } }] }] }] };
  const r = await call('POST', '/telemetry/v1/logs', { body: big });
  expect(r.status === 413, `expected 413, got ${r.status}`);
  expect(isProblem(r), 'the response is not a Problem');
});

report(`Conformance with the telemetry contract (${base})`);
