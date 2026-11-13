/**
 * ORCA staging: owner-only grant display/revocation helpers.
 * Authoritative data always comes from Supabase Auth's user-scoped
 * oauth.listGrants() endpoint. No local browser flag proves connection.
 *
 * Pure functions, dependency-injected API for no-network unit tests.
 */
function validClientId(id) {
  return typeof id === 'string' &&
    id.length >= 1 && id.length <= 1024 &&
    !Array.from(id).some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127);
}

export function readGrants(data) {
  if (!Array.isArray(data)) {
    throw new Error('Authorization grant list was unavailable or invalid');
  }
  const seen = new Set();
  return data.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item) ||
        !item.client || typeof item.client !== 'object' ||
        !validClientId(item.client.id) ||
        typeof item.client.name !== 'string' ||
        !Array.isArray(item.scopes) ||
        !item.scopes.every(scope => typeof scope === 'string')) {
      throw new Error('Unexpected authorization grant format');
    }
    if (seen.has(item.client.id)) {
      throw new Error('Duplicate OAuth client entry');
    }
    seen.add(item.client.id);
    return {
      id: item.client.id,
      name: item.client.name.trim() || 'Unnamed application',
      scopes: [...item.scopes],
      grantedAt: typeof item.granted_at === 'string' ? item.granted_at : '',
    };
  });
}

export async function listOwnedGrants(oauthApi) {
  if (!oauthApi || typeof oauthApi.listGrants !== 'function') {
    throw new Error('OAuth grant management is unavailable');
  }
  const response = await oauthApi.listGrants();
  if (response?.error || !response || !('data' in response)) {
    throw new Error('Could not verify authorized applications');
  }
  return readGrants(response.data);
}

/**
 * Must be called ONLY by a direct, explicit confirmed user click. The client
 * id is selected from a fresh listing for the SAME currently logged-in user.
 * Never obtain it from a query string, prompt, alias, or metadata URL.
 *
 * Return new authoritative state only when re-listing proves it was revoked.
 */
export async function revokeOwnedGrant(oauthApi, selectedClientId) {
  if (!validClientId(selectedClientId)) {
    throw new Error('Invalid authorization target');
  }
  const before = await listOwnedGrants(oauthApi);
  if (!before.some(grant => grant.id === selectedClientId)) {
    throw new Error('This authorization is not present in your account');
  }
  if (typeof oauthApi.revokeGrant !== 'function') {
    throw new Error('Authorization revocation is unavailable');
  }
  const result = await oauthApi.revokeGrant({ clientId: selectedClientId });
  if (result?.error) {
    throw new Error('Revocation failed; access may still be authorized');
  }
  const after = await listOwnedGrants(oauthApi);
  if (after.some(grant => grant.id === selectedClientId)) {
    throw new Error('Revocation could not be verified; do not assume access was removed');
  }
  return after;
}
