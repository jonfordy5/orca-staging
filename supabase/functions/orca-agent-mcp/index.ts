// ORCA Commons: read-only OAuth/MCP prototype.
// This function MUST remain un-deployed until OAuth and backend client_id isolation
// are configured, reviewed, and tested. No service_role or administrator client.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createMcpHandler, McpServer } from 'npm:@modelcontextprotocol/server@2.0.0';
import { pipeline } from 'npm:@supabase/middleware@1.0.0';
import { withOAuthProtectedResource, withSupabase } from 'npm:@supabase/server@1.6.0';
import { z } from 'npm:zod@4.3.6';
import { readAgentState } from '../orca-agent-readonly/policy.mjs';
import { verifyAuthorizedOAuthOwner } from './owner-authorization.mjs';

const serverIdentity = { name: 'orca-commons-staging', version: '0.1.0' };

// Fresh grant verification now lives in separately testable fixed-origin transport.
// All MCP tools share the same server-side verified owner and grant check.

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
          // The same centralized, integration-tested check gates every tool.
          // No request parameter can substitute for the Auth-verified owner.
          const approvedClientIds = new Set((Deno.env.get('ORCA_MCP_APPROVED_CLIENT_IDS') || '')
            .split(',').map(id => id.trim()).filter(Boolean));
          return verifyAuthorizedOAuthOwner({
            request: req,
            auth: supabase.auth,
            approvedClientIds,
            fetcher: fetch,
            publishableKey: Deno.env.get('SUPABASE_ANON_KEY')
          });
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
