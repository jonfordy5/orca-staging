/**
 * Browser-only endpoint guard for ORCA Edge Functions that invoke privileged
 * service-role operations after Supabase Auth verifies a signed-in user.
 *
 * IMPORTANT: Call ONLY AFTER await supabase.auth.getUser(bearer) succeeds.
 * This helper decodes claims from that SAME previously verified bearer, but
 * does NOT perform cryptographic signature verification itself.
 *
 * First-phase ORCA OAuth clients may only use the dedicated read-only MCP;
 * they are not authorized to call existing site-only generation/write routes.
 * Never infer authorization from Origin/CORS or a mutable researcher alias.
 */
export function isVerifiedOrcaBrowserToken(
  verifiedBearer: string,
  verifiedUserId: string
): boolean {
  if (typeof verifiedBearer !== 'string' ||
      typeof verifiedUserId !== 'string' ||
      verifiedUserId.length === 0) return false;

  const segments = verifiedBearer.split('.');
  if (segments.length !== 3 || !segments.every(Boolean)) return false;

  try {
    const payloadB64 = segments[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = payloadB64.padEnd(Math.ceil(payloadB64.length / 4) * 4, '=');
    const claims = JSON.parse(atob(padded));

    if (!claims || typeof claims !== 'object' || Array.isArray(claims)) {
      return false;
    }
    if (claims.sub !== verifiedUserId || claims.role !== 'authenticated') {
      return false;
    }
    // Explicitly reject any OAuth client_id, even null/empty/malformed.
    return !Object.prototype.hasOwnProperty.call(claims, 'client_id');
  } catch {
    // Invalid token encoding must never fail open.
    return false;
  }
}
