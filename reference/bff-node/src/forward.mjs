// Forwarding of a route (/api by default) to its service, with the user's access token.
//
// - Only a few headers reach the service (format, conditional requests, language, trace context): never the cookies
//   of the browser nor an `Authorization` of its own.
// - Only status, body and a few safe headers come back.
// - The bodies are streamed both ways. An event stream (`text/event-stream`) is passed on chunk by chunk as it arrives,
//   with no time limit while it stays open.
import { sendProblem } from './http.mjs';

const REQUEST_HEADERS = ['accept', 'accept-language', 'content-type', 'if-none-match', 'if-match', 'if-modified-since', 'traceparent', 'tracestate', 'baggage'];
const RESPONSE_HEADERS = ['content-type', 'etag', 'cache-control', 'last-modified', 'content-disposition'];
const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
/** Time allowed to the service to start its answer; once it has started, a stream may stay open. */
const HEADERS_TIMEOUT_MS = 60_000;

/**
 * The route of a path, if any.
 * @param {string} path
 * @param {import('./config.mjs').Route[]} routes
 */
export function routeFor(path, routes) {
  return routes.find((r) => path === r.prefix || path.startsWith(`${r.prefix}/`) || path.startsWith(`${r.prefix}?`));
}

/**
 * Is the raw path safe to append to the address of the service? No relative segments, encoded or not.
 * @param {string} rawUrl  the path and query of the request, as received
 */
export function safePath(rawUrl) {
  const path = rawUrl.split('?')[0];
  return !/\.\.|%2e|%2f|%5c|\\/i.test(path);
}

/**
 * The body of the request, failing once it passes `limit` bytes.
 * @param {AsyncIterable<Buffer>} body
 * @param {number} limit
 */
async function* limited(body, limit) {
  let size = 0;
  for await (const chunk of body) {
    size += chunk.length;
    if (size > limit) throw new Error('body too large');
    yield chunk;
  }
}

/**
 * Forwards the request and streams the answer back.
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {{ route: import('./config.mjs').Route, token: string, maxBodyBytes: number, fetch?: typeof fetch, log?: (line: string) => void }} options
 */
export async function forward(req, res, { route, token, maxBodyBytes, fetch: fetchImpl = fetch, log = console.error }) {
  const rawUrl = req.url ?? '/';
  if (!safePath(rawUrl)) return sendProblem(res, 400, 'Invalid path');
  const length = Number(req.headers['content-length'] ?? 0);
  if (length > maxBodyBytes) return sendProblem(res, 413, 'Body too large');

  /** @type {Record<string, string>} */
  const headers = {};
  for (const name of REQUEST_HEADERS) {
    const value = req.headers[name];
    if (typeof value === 'string') headers[name] = value;
  }
  headers.authorization = `Bearer ${token}`;
  const method = req.method ?? 'GET';
  const hasBody = BODY_METHODS.has(method);

  const abort = new AbortController();
  // The browser went away (a closed page, a stream no longer read): stop the call to the service too.
  res.on('close', () => abort.abort());
  const timer = setTimeout(() => abort.abort(), HEADERS_TIMEOUT_MS);

  /** @type {Response} */
  let reply;
  try {
    reply = await fetchImpl(route.target + rawUrl, {
      method,
      headers,
      redirect: 'manual',
      signal: abort.signal,
      ...(hasBody ? { body: /** @type {any} streamed request body */ (limited(req, maxBodyBytes)), duplex: 'half' } : {}),
    });
  } catch (e) {
    clearTimeout(timer);
    if (res.headersSent || res.destroyed) return;
    log(`forward ${method} ${route.prefix}: ${e instanceof Error ? e.message : e}`);
    return sendProblem(res, 502, 'Service unreachable');
  } finally {
    clearTimeout(timer);
  }

  /** @type {Record<string, string>} */
  const back = {};
  for (const name of RESPONSE_HEADERS) {
    const value = reply.headers.get(name);
    if (value !== null) back[name] = value;
  }
  const events = (back['content-type'] ?? '').startsWith('text/event-stream');
  if (events) {
    // A proxy in front (nginx) must not hold the events back either.
    back['x-accel-buffering'] = 'no';
    back['cache-control'] ??= 'no-cache';
  }
  res.writeHead(reply.status, back);
  if (!reply.body) return res.end();
  if (events) res.flushHeaders();
  try {
    for await (const chunk of reply.body) {
      // Every chunk goes out at once: node:http does not buffer what is written.
      res.write(chunk);
    }
    res.end();
  } catch {
    // The service or the browser closed the connection in the middle: nothing more can be said to the browser.
    res.destroy();
  }
}
