// ORCA Commons: read-only OAuth/MCP prototype.
// This function MUST remain un-deployed until OAuth and backend client_id isolation
// are configured, reviewed, and tested. No service_role or administrator client.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createMcpHandler, McpServer } from 'npm:@modelcontextprotocol/server@2.0.0';
import { pipeline } from 'npm:@supabase/middleware@1.0.0';
import { withOAuthProtectedResource, withSupabase } from 'npm:@supabase/server@1.6.0';
import { z } from 'npm:zod@4.3.6';
import { readAgentState } from '../orca-agent-readonly/policy.mjs';
import { authorizeReadOnlyMcpClaims, ORCA_MCP_STAGING_ISSUER } from './token-policy.mjs';
import { hasCurrentOAuthGrant } from './grant-policy.mjs';

const serverIdentity = { name: 'orca-commons-staging', version: '0.1.0' };

// OAuth revoke/refresh protection: query Supabase Auth's CURRENT grants
// with the identical bearer already verified by Supabase user middleware.
// Never trust cached app state, a self-reported alias or a JWT client_id alone.
// This request is read-only and fails closed if Auth is unavailable.
async function readCurrentGrants(req: Request) {
  const bearer = req.headers.get('authorization') || '';
  if (!/^Bearer [A-Za-z0-9._~-]{40,}$/i.test(bearer)) {
    throw new Error('A verified OAuth bearer is required');
  }
  const publishableKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!publishableKey) throw new Error('ORCA Auth grant verification is not configured');

  const response = await fetch(ORCA_MCP_STAGING_ISSUER + '/user/oauth/grants', {
    method: 'GET',
    headers: { Authorization: bearer, apikey: publishableKey, Accept: 'application/json' },
    credentials:'omit',
    cache:'no-store',
    redirect:'error',
    signal: AbortSignal.timeout(6000)
  });
  if (!response.ok) throw new Error('ORCA OAuth authorization is unavailable');
  const grants: unknown = await response.json();
  if (!Array.isArray(grants)) throw new Error('Unexpected authorization response');
  return grants;
}

// The gateway must NOT block unauthenticated OAuth *discovery* requests.
// withOAuthProtectedResource serves metadata; withSupabase verifies each user
// bearer token through the project's asymmetric JWKS before any tool executes.
Deno.serve(
  pipeline(
    [withOAuthProtectedResource(), withSupabase({ auth: 'user' })],
    async (req, { supabase }) => {
      const handler = createMcpHandler(() => {
        const server = new McpServer(serverIdentity);

        async function verifiedOwner() {
          // A normal ORCA browser session is not sufficient to impersonate a
          // linked OAuth client; an actual client_id claim must be present.
          const verifiedClaims = await supabase.auth.getClaims();
          if (verifiedClaims.error || !verifiedClaims.data?.claims) {
            throw new Error('OAuth authorization is required');
          }
          const claims = verifiedClaims.data.claims;
          // Both verified Supabase Auth user identity and resource-bound OAuth
          // token claims are required. No permission is inferred from matching
          // email addresses, application names, or owner-maintained aliases.
          const identity = await supabase.auth.getUser();
          if (identity.error || !identity.data?.user?.id) {
            throw new Error('Verified ORCA identity is required');
          }
          const allowedClients = new Set((Deno.env.get('ORCA_MCP_APPROVED_CLIENT_IDS') || '')
            .split(',').map(id => id.trim()).filter(Boolean));
          const decision = authorizeReadOnlyMcpClaims(
            claims, allowedClients, identity.data.user.id
          );
          if (!decision.ok) {
            throw new Error('This OAuth token is not authorized for ORCA staging');
          }
          // Every tool call verifies that this SAME owner's OAuth grant is
          // still current. Revoked clients are rejected even while a previously
          // issued bearer is otherwise cryptographically valid.
          const grants = await readCurrentGrants(req);
          if (!hasCurrentOAuthGrant(grants, claims.client_id)) {
            throw new Error('The ORCA OAuth grant was revoked or is not available');
          }
          // The OAuth client_id is not a database write permission.
          // PostgREST and Edge Function isolation remain mandatory.
          return identity.data.user.id;
        }

        server.registerTool(
          'orca_whoami',
          {
            title: 'My ORCA researcher',
            description: 'Read my existing ORCA researcher identity, consent and publication-review preference. Does not connect, claim or publish research.',
            inputSchema: z.object({}),
            annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
            _meta: { securitySchemes: [{ type: 'oauth2', scopes: [] }] }
          },
          async () => {
            const ownerId = await verifiedOwner();
            const result = await readAgentState(supabase, ownerId);
            return { content: [{ type: 'text', text: JSON.stringify(result) }] };
          }
        );

        server.registerTool(
          'orca_my_assignment',
          {
            title: 'My ORCA research assignment',
            description: 'Read my current, unexpired, server-assigned stock research task and research board. Never claims a new task or changes existing permissions.',
            inputSchema: z.object({ ticker: z.string().min(1).max(10) }),
            annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
            _meta: { securitySchemes: [{ type: 'oauth2', scopes: [] }] }
          },
          async ({ ticker }) => {
            const ownerId = await verifiedOwner();
            const result = await readAgentState(supabase, ownerId, { ticker });
            return { content: [{ type: 'text', text: JSON.stringify(result) }] };
          }
        );

        return server;
      });
      return handler.fetch(req);
    }
  )
);
