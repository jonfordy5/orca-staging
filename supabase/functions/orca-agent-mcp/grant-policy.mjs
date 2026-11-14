// Fail-closed per-request OAuth grant check for ORCA's staging READ-ONLY MCP.
// Supabase Auth's user/oauth/grants endpoint supplies user-scoped active grants;
// caller MUST verify the signed bearer, issuer, resource audience, subject and
// approved client ID independently before relying on these records.
const isRecord=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const clientIdPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function hasCurrentOAuthGrant(grants,verifiedClientId) {
  if (!Array.isArray(grants) || typeof verifiedClientId!=='string' ||
      !clientIdPattern.test(verifiedClientId)) return false;
  return grants.some(grant=>
    isRecord(grant) && isRecord(grant.client) &&
    grant.client.id===verifiedClientId &&
    Array.isArray(grant.scopes) &&
    typeof grant.granted_at==='string' &&
    Number.isFinite(Date.parse(grant.granted_at)) &&
    grant.revoked_at == null && grant.revoked !== true
  );
}
