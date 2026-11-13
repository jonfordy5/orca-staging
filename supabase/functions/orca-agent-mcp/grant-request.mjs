// ORCA MCP OAuth grant transport: the canonical Supabase Auth URL is fixed.
// The caller MUST first verify the bearer signature, issuer, resource audience,
// client_id, and user with the Supabase user middleware and Auth service.
// A successful response proves only that Auth currently lists this user's grant.
import { ORCA_MCP_STAGING_ISSUER } from './token-policy.mjs';

export const ORCA_AUTH_GRANTS_ENDPOINT=ORCA_MCP_STAGING_ISSUER+'/user/oauth/grants';

export async function readCurrentGrants(request,{fetcher,publishableKey}={}) {
  const bearer=request?.headers?.get?.('authorization');
  // Supabase access tokens are signed JWTs. This shape check is not a
  // signature validation; actual authentication happens upstream.
  const validBearer=typeof bearer==='string' &&
    /^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/i.test(bearer);
  if(!validBearer)throw new Error('Verified OAuth bearer required');
  if(typeof publishableKey!=='string'||!publishableKey.trim()) {
    throw new Error('Auth API key not configured');
  }
  if(typeof fetcher!=='function')throw new Error('Auth grant lookup unavailable');

  // NEVER log Authorization or return it to the MCP client.
  const response=await fetcher(ORCA_AUTH_GRANTS_ENDPOINT,{
    method:'GET',
    headers:{Authorization:bearer,apikey:publishableKey,Accept:'application/json'},
    credentials:'omit',
    cache:'no-store',
    redirect:'error',
    signal:AbortSignal.timeout(6000)
  });
  if(!response?.ok)throw new Error('Active OAuth grants could not be verified');
  const grants=await response.json();
  if(!Array.isArray(grants))throw new Error('Invalid active OAuth grant response');
  return grants;
}
