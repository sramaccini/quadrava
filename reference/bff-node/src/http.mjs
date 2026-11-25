// Small HTTP helpers on top of node:http: cookies, JSON and Problem answers (contracts/problem.yaml, RFC 9457).

/**
 * The cookies of a request, by name. A repeated name keeps the first value, as browsers send the most specific first.
 * @param {import('node:http').IncomingMessage} req
 * @returns {Map<string, string>}
 */
export function readCookies(req) {
  const cookies = new Map();
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const at = part.indexOf('=');
    if (at < 1) continue;
    const name = part.slice(0, at).trim();
    if (cookies.has(name)) continue;
    try {
      cookies.set(name, decodeURIComponent(part.slice(at + 1).trim()));
    } catch {
      // a value that is not valid percent-encoding is ignored
    }
  }
  return cookies;
}

/**
 * A `Set-Cookie` value. Always `Path=/` and `SameSite=Lax`; `Max-Age=0` deletes the cookie.
 * @param {string} name
 * @param {string} value
 * @param {{ httpOnly?: boolean, secure?: boolean, maxAge?: number }} [options]
 */
export function cookie(name, value, { httpOnly = true, secure = false, maxAge } = {}) {
  return [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'SameSite=Lax',
    ...(httpOnly ? ['HttpOnly'] : []),
    ...(secure ? ['Secure'] : []),
    ...(maxAge !== undefined ? [`Max-Age=${maxAge}`] : []),
  ].join('; ');
}

/**
 * Adds a `Set-Cookie` to those already on the response.
 * @param {import('node:http').ServerResponse} res
 * @param {string} value
 */
export function addCookie(res, value) {
  const current = res.getHeader('Set-Cookie');
  res.setHeader('Set-Cookie', [...(Array.isArray(current) ? current : current ? [String(current)] : []), value]);
}

/**
 * A JSON answer, never cached: the answers of the BFF belong to one session.
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {unknown} body
 * @param {string} [type]
 */
export function sendJson(res, status, body, type = 'application/json') {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': type, 'Content-Length': Buffer.byteLength(text), 'Cache-Control': 'no-store' });
  res.end(text);
}

/**
 * An error in Problem format. `title` and `detail` are for developers: the runtime never shows them.
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {string} title
 * @param {{ type?: string, detail?: string, [key: string]: unknown }} [extra]
 */
export function sendProblem(res, status, title, extra = {}) {
  sendJson(res, status, { type: 'about:blank', title, status, ...extra }, 'application/problem+json');
}

/**
 * A redirect for a browser navigation.
 * @param {import('node:http').ServerResponse} res
 * @param {string} location
 */
export function redirect(res, location) {
  res.writeHead(302, { Location: location, 'Cache-Control': 'no-store' });
  res.end();
}

/**
 * The body of a request as JSON, within `limit` bytes. Throws `BodyError` when it is too large or not JSON.
 * @param {import('node:http').IncomingMessage} req
 * @param {number} limit
 * @returns {Promise<unknown>}
 */
export async function readJson(req, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new BodyError(413, 'Body too large');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new BodyError(400, 'Body is not JSON');
  }
}

export class BodyError extends Error {
  /** @param {number} status @param {string} message */
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
