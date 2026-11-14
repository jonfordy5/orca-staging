// Central ORCA OAuth MCP read authorization.
//
// This is deliberately transport-agnostic so we can exercise the EXACT
// server-side check with two distinct accounts before enabling a real client.
// All information comes from verified Supabase Auth methods and an owner-scoped
// GET /user/oauth/grants. The request never supplies an owner ID.
import { authorizeReadOnlyMcpClaims } from './token-policy.mjs';
import { hasCurrentOAuthGrant } from './grant-policy.mjs';
import { readCurrentGrants } from './grant-request.mjs';

export async function verifyAuthorizedOAuthOwner({
  request, auth, approvedClientIds, fetcher, publishableKey
} = {}) {
  if (!request || !auth || typeof auth.getClaims!=='function' ||
      typeof auth.getUser!=='function') {
    throw new Error('OAuth user authentication unavailable');
  }

  // These methods must operate on the already authenticated caller's
  // Supabase client, scoped by withSupabase({ auth: 'user' }).
  const verifiedClaims = await auth.getClaims();
  if (verifiedClaims?.error || !verifiedClaims?.data?.claims) {
    throw new Error('OAuth access token cannot be verified');
  }
  const identity = await auth.getUser();
  if (identity?.error || typeof identity?.data?.user?.id!=='string' ||
      !identity.data.user.id) {
    throw new Error('Verified ORCA user identity required');
  }

  const claims = verifiedClaims.data.claims;
  const ownerId = identity.data.user.id;
  const decision = authorizeReadOnlyMcpClaims(claims,approvedClientIds,ownerId);
  if (!decision.ok) {
    throw new Error('OAuth client, resource audience or identity not authorized');
  }

  // Auth lists only grants of the bearer holder. Requery it every time:
  // a disconnected app must fail on its very next MCP call, even while
  // an earlier signed bearer remains within its original expiry.
  const grants = await readCurrentGrants(request,{fetcher,publishableKey});
  if (!hasCurrentOAuthGrant(grants,claims.client_id)) {
    throw new Error('OAuth authorization is missing or has been revoked');
  }

  return ownerId;
}
