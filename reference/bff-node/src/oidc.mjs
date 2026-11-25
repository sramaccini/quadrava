// The identity provider, through openid-client: Authorization Code with PKCE, renewal with the refresh token and the
// logout address. Everything else of the BFF sees only this small interface, so the tests use a fake provider.
import * as client from 'openid-client';

/**
 * @typedef {object} TokenSet
 * @property {string} accessToken
 * @property {string | undefined} refreshToken
 * @property {string | undefined} idToken
 * @property {number} expiresAt  milliseconds
 *
 * @typedef {object} Provider
 * @property {(login: { redirectUri: string, state: string, nonce: string, verifier: string, maxAge?: number }) => Promise<string>} authorizationUrl
 * @property {(callback: { url: URL, redirectUri: string, state: string, nonce: string, verifier: string, maxAge?: number }) => Promise<{ tokens: TokenSet, claims: Record<string, unknown> }>} exchange
 *   the tokens of a callback, and the claims of the ID token (checked by openid-client) with those of the access token
 * @property {(tokens: TokenSet) => Promise<TokenSet>} refresh  new tokens with the refresh token; what is not sent again is kept
 * @property {(logout: { idToken?: string, postLogoutRedirectUri: string }) => string} logoutUrl
 */

/** A PKCE code verifier (random, 43 characters or more). */
export const randomVerifier = () => client.randomPKCECodeVerifier();

/**
 * The claims of a JWT, without checking its signature: only for a token the BFF has just received from the token
 * endpoint of the provider, over its own connection.
 * @param {string | undefined} jwt
 * @returns {Record<string, unknown>}
 */
export function unverifiedClaims(jwt) {
  try {
    const claims = JSON.parse(Buffer.from(String(jwt).split('.')[1] ?? '', 'base64url').toString('utf8'));
    return claims && typeof claims === 'object' ? claims : {};
  } catch {
    return {};
  }
}

/**
 * @param {import('openid-client').TokenEndpointResponse} response
 * @param {TokenSet} [previous]  what the provider does not send again on a renewal
 * @returns {TokenSet}
 */
function tokenSet(response, previous) {
  return {
    accessToken: response.access_token,
    refreshToken: response.refresh_token ?? previous?.refreshToken,
    idToken: response.id_token ?? previous?.idToken,
    expiresAt: Date.now() + (response.expires_in ?? 60) * 1000,
  };
}

/**
 * Reads the discovery document of the provider and returns the provider of the BFF.
 * @param {import('./config.mjs').Config} config
 * @returns {Promise<Provider>}
 */
export async function openIdProvider(config) {
  // The development Keycloak of idp/ is plain HTTP; openid-client refuses it unless told otherwise.
  const insecure = new URL(config.issuer).protocol === 'http:';
  const oidc = await client.discovery(new URL(config.issuer), config.clientId, undefined, client.ClientSecretBasic(config.clientSecret),
    insecure ? { execute: [client.allowInsecureRequests] } : undefined);

  return {
    async authorizationUrl({ redirectUri, state, nonce, verifier, maxAge }) {
      return client.buildAuthorizationUrl(oidc, {
        redirect_uri: redirectUri,
        scope: config.scope,
        state,
        nonce,
        code_challenge: await client.calculatePKCECodeChallenge(verifier),
        code_challenge_method: 'S256',
        ...(maxAge !== undefined ? { max_age: String(maxAge) } : {}),
      }).href;
    },
    async exchange({ url, redirectUri, state, nonce, verifier, maxAge }) {
      const response = await client.authorizationCodeGrant(oidc, url,
        { pkceCodeVerifier: verifier, expectedState: state, expectedNonce: nonce, idTokenExpected: true, ...(maxAge !== undefined ? { maxAge } : {}) },
        { redirect_uri: redirectUri });
      return { tokens: tokenSet(response), claims: { ...unverifiedClaims(response.access_token), ...response.claims() } };
    },
    async refresh(tokens) {
      return tokenSet(await client.refreshTokenGrant(oidc, String(tokens.refreshToken)), tokens);
    },
    logoutUrl({ idToken, postLogoutRedirectUri }) {
      return client.buildEndSessionUrl(oidc, {
        post_logout_redirect_uri: postLogoutRedirectUri,
        client_id: config.clientId,
        ...(idToken ? { id_token_hint: idToken } : {}),
      }).href;
    },
  };
}
