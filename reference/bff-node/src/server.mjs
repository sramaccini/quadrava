// Starts the BFF: configuration, permissions, discovery of the identity provider (retried while it starts), HTTP.
//
//   npm start          (configuration from BFF_* variables: README.md)
import { createServer } from 'node:http';
import { createBff } from './app.mjs';
import { loadConfig } from './config.mjs';
import { openIdProvider } from './oidc.mjs';
import { loadRolePermissions } from './permissions.mjs';
import { SessionStore } from './sessions.mjs';

const say = (/** @type {string} */ line) => console.log(`[bff-node] ${line}`);

let config;
let rolePermissions;
try {
  config = loadConfig();
  rolePermissions = loadRolePermissions(config.permissionsFile);
} catch (e) {
  console.error(`[bff-node] ${e instanceof Error ? e.message : e}`);
  process.exit(1);
}

/** The identity provider may still be starting (Docker): two minutes of retries before giving up. */
async function discover() {
  for (let attempt = 1; ; attempt++) {
    try {
      return await openIdProvider(config);
    } catch (e) {
      if (attempt >= 60) throw e;
      if (attempt === 1) say(`waiting for the identity provider at ${config.issuer}…`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

const provider = await discover();
const store = new SessionStore({ idleSeconds: config.idleSeconds, maxSeconds: config.maxSeconds });
setInterval(() => store.sweep(), 60_000).unref();

const handle = createBff({ config, provider, store, rolePermissions, log: (line) => console.error(`[bff-node] ${line}`) });
const server = createServer({ requestTimeout: 0 }, (req, res) => void handle(req, res));
server.listen(config.port, config.host, () => {
  say(`listening on ${config.host ?? '*'}:${config.port}, issuer ${config.issuer}, routes ${config.routes.map((r) => `${r.prefix} → ${r.target}`).join(', ')}`);
  if (config.developmentDefaults.length) say(`development defaults in use: ${config.developmentDefaults.join(', ')} (not for production)`);
});

for (const signal of /** @type {const} */ (['SIGINT', 'SIGTERM'])) {
  process.on(signal, () => {
    say('stopping');
    server.close();
    server.closeAllConnections();
    process.exit(0);
  });
}
