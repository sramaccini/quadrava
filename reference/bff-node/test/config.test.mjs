// Configuration from the environment.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { loadConfig } from '../src/config.mjs';
import { loadRolePermissions } from '../src/permissions.mjs';

describe('configuration', () => {
  it('has the development defaults, and says which are in use', () => {
    const config = loadConfig({});
    assert.equal(config.port, 8080);
    assert.equal(config.issuer, 'http://localhost:8180/realms/quadrava');
    assert.deepEqual(config.routes, [{ prefix: '/api', target: 'http://localhost:8084' }]);
    assert.ok(config.allowedOrigins.includes('http://localhost:4200'));
    assert.ok(config.developmentDefaults.includes('BFF_CLIENT_SECRET'));
    assert.equal(loadConfig({ BFF_CLIENT_SECRET: 's' }).developmentDefaults.includes('BFF_CLIENT_SECRET'), false);
  });

  it('reads several routes and normalises the origins', () => {
    const config = loadConfig({ BFF_ROUTES: '/api=http://api:8084/, /telemetry=http://telemetry:8083', BFF_ALLOWED_ORIGINS: 'https://app.example/' });
    assert.deepEqual(config.routes.map((r) => r.target), ['http://api:8084', 'http://telemetry:8083']);
    assert.deepEqual(config.allowedOrigins, ['https://app.example']);
  });

  it('refuses wrong values with a readable message', () => {
    assert.throws(() => loadConfig({ BFF_ROUTES: 'api=http://x' }), /BFF_ROUTES/);
    assert.throws(() => loadConfig({ BFF_ROUTES: '/bff=http://x' }), /answered by the BFF/);
    assert.throws(() => loadConfig({ BFF_ALLOWED_ORIGINS: 'not an address' }), /BFF_ALLOWED_ORIGINS/);
    assert.throws(() => loadConfig({ BFF_TRUST_PROXY: 'yes' }), /BFF_TRUST_PROXY/);
    assert.throws(() => loadConfig({ BFF_PORT: '-1' }), /BFF_PORT/);
  });

  it('the permissions file of the example is valid', () => {
    const roles = loadRolePermissions(loadConfig({}).permissionsFile);
    assert.deepEqual([...roles.keys()], ['user', 'operator', 'manager', 'administrator']);
    assert.deepEqual([...roles].filter(([, r]) => r.base).map(([id]) => id), ['user']);
  });
});
