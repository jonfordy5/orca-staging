// Pure fail-closed authorization checks for ORCA's READ-ONLY OAuth MCP tools.
// This function does NOT verify JWT signatures, expiry, active sessions,
// registered grants, or token revocation. The Supabase user middleware and
// getClaims/getUser calls MUST verify those independently before any reads.
//
// Public resource identity is exact: no origin or prefix matching.
export const ORCA_MCP_STAGING_ISSUER =
  'https://vbziibatnejoswsdggga.supabase.co/auth/v1';
export const ORCA_MCP_STAGING_RESOURCE =
  'https://vbziibatnejoswsdggga.supabase.co/functions/v1/orca-agent-mcp';

export function authorizeReadOnlyMcpClaims(claims, allowedClientIds, verifiedUserId) {
  if (!claims || typeof claims !== 'object' || Array.isArray(claims)) {
    return { ok: false, reason: 'invalid_claims' };
  }
  if (claims.iss !== ORCA_MCP_STAGING_ISSUER) {
    return { ok: false, reason: 'invalid_issuer' };
  }
  const audiences = typeof claims.aud === 'string'
    ? [claims.aud] : Array.isArray(claims.aud) ? claims.aud : [];
  // Upcoming native Supabase RFC 8707 implementation may use
  // ["authenticated", "https://.../orca-agent-mcp"].
  // An OAuth token with only ["authenticated"] is explicitly rejected.
  if (!audiences.includes(ORCA_MCP_STAGING_RESOURCE)) {
    return { ok: false, reason: 'wrong_resource_audience' };
  }
  const clientId = claims.client_id;
  if (typeof clientId !== 'string' ||
      clientId.trim() !== clientId ||
      !/^[A-Za-z0-9._~-]{10,256}$/.test(clientId)) {
    return { ok: false, reason: 'invalid_oauth_client' };
  }
  // Allowlist is empty by default. No dynamic-client-registration entry
  // gains permission until ORCA's operator explicitly approves it.
  if (!(allowedClientIds instanceof Set) || !allowedClientIds.has(clientId)) {
    return { ok: false, reason: 'unapproved_client' };
  }
  if (typeof claims.sub !== 'string' || claims.sub.length === 0 ||
      typeof verifiedUserId !== 'string' ||
      claims.sub !== verifiedUserId) {
    return { ok: false, reason: 'identity_mismatch' };
  }
  return { ok: true };
}
