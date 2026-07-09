// Grimoire MCP server — read-only "traverse your campaign from your own AI".
//
// A thin OAuth 2.1 *resource server*: Supabase Auth's OAuth 2.1 Server is the
// authorization server (it hosts /authorize, /token, JWKS, discovery and DCR).
// This function only:
//   1. publishes Protected Resource Metadata + answers unauthenticated calls with
//      401 + WWW-Authenticate so MCP clients can discover where to log in;
//   2. validates the Supabase-issued OAuth JWT and runs the read-only tools through
//      an RLS-scoped client (so existing RLS policies enforce tenancy).
//
// Gateway JWT verification is OFF (`[functions.mcp] verify_jwt = false` in
// config.toml) because we must serve the public discovery document and emit our
// own 401/WWW-Authenticate; the function validates the token itself.

import { createClient } from "@supabase/supabase-js";
import { callTool, isMcpContentResult, listTools } from "../_shared/mcp/tools.ts";
import type { ToolContext } from "../_shared/mcp/tools.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const SERVER_INFO = { name: "grimoire", version: "0.1.0" };
const DEFAULT_PROTOCOL = "2025-06-18";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, mcp-protocol-version, mcp-session-id",
  "Access-Control-Expose-Headers": "WWW-Authenticate, mcp-session-id",
};

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

// ── JSON-RPC helpers ──────────────────────────────────────────────────────────
function rpcResult(id: unknown, result: unknown) {
  return { jsonrpc: "2.0", id: id ?? null, result };
}
function rpcError(id: unknown, code: number, message: string) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

// ── OAuth discovery ───────────────────────────────────────────────────────────
// The canonical resource identifier is the PUBLIC function URL. We must NOT derive
// it from `req.url`: inside a Supabase edge function that is the internal request
// (plain `http`, with the `/functions/v1` prefix stripped), so it would advertise
// e.g. `http://<ref>.supabase.co/mcp` — which fails the client's RFC 9728 check
// that the PRM `resource` matches the URL it actually connected to. Build it from
// the project URL env instead.
const RESOURCE_URL = `${SUPABASE_URL}/functions/v1/mcp`;
const PRM_URL = `${RESOURCE_URL}/.well-known/oauth-protected-resource`;

function protectedResourceMetadata() {
  return {
    resource: RESOURCE_URL,
    authorization_servers: [`${SUPABASE_URL}/auth/v1`],
    scopes_supported: ["openid", "email", "profile"],
    bearer_methods_supported: ["header"],
  };
}

function unauthorized(detail: string): Response {
  return new Response(JSON.stringify({ error: "unauthorized", error_description: detail }), {
    status: 401,
    headers: {
      ...jsonHeaders,
      "WWW-Authenticate": `Bearer realm="grimoire", resource_metadata="${PRM_URL}"`,
    },
  });
}

// ── MCP method dispatch ───────────────────────────────────────────────────────
async function handleRpc(message: Record<string, unknown>, ctx: ToolContext): Promise<unknown | null> {
  const { id, method, params } = message as { id?: unknown; method?: string; params?: Record<string, unknown> };

  switch (method) {
    case "initialize":
      return rpcResult(id, {
        protocolVersion: (params?.protocolVersion as string) ?? DEFAULT_PROTOCOL,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
      });

    // Notifications carry no id and expect no response.
    case "notifications/initialized":
    case "notifications/cancelled":
      return null;

    case "ping":
      return rpcResult(id, {});

    case "tools/list":
      return rpcResult(id, { tools: listTools() });

    case "tools/call": {
      const name = params?.name as string;
      const args = (params?.arguments as Record<string, unknown>) ?? {};
      try {
        const data = await callTool(ctx, name, args);
        // Most tools return plain data → one text block. `get_image` returns
        // pre-built MCP content (an image block + the URL) — pass it through.
        const content = isMcpContentResult(data)
          ? data._mcpContent
          : [{ type: "text", text: JSON.stringify(data, null, 2) }];
        return rpcResult(id, { content });
      } catch (e) {
        // Tool-level failures are reported in-band per MCP (isError), not as RPC errors.
        return rpcResult(id, {
          content: [{ type: "text", text: e instanceof Error ? e.message : "Tool failed." }],
          isError: true,
        });
      }
    }

    default:
      return rpcError(id, -32601, `Method not found: ${method}`);
  }
}

// ── HTTP entry ────────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);

  // Public discovery document (no auth).
  if (req.method === "GET" && url.pathname.endsWith("/.well-known/oauth-protected-resource")) {
    return new Response(JSON.stringify(protectedResourceMetadata()), { headers: jsonHeaders });
  }

  // Stateless server: no server-initiated SSE stream on GET.
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
  }

  // ── Authenticate: validate the Supabase-issued OAuth JWT ──────────────────────
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.toLowerCase().startsWith("bearer ")) {
    return unauthorized("Missing bearer token.");
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return unauthorized("Invalid or expired token.");

  const ctx: ToolContext = { supabase, userId: user.id };

  // ── Parse + dispatch JSON-RPC (single message; batching removed in 2025 spec) ─
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify(rpcError(null, -32700, "Parse error")), { status: 400, headers: jsonHeaders });
  }

  if (Array.isArray(body)) {
    const responses = (await Promise.all(body.map((m) => handleRpc(m as Record<string, unknown>, ctx)))).filter(
      (r) => r !== null,
    );
    return new Response(responses.length ? JSON.stringify(responses) : null, {
      status: responses.length ? 200 : 202,
      headers: jsonHeaders,
    });
  }

  const response = await handleRpc(body as Record<string, unknown>, ctx);
  // Notifications → 202 with no body.
  return new Response(response === null ? null : JSON.stringify(response), {
    status: response === null ? 202 : 200,
    headers: jsonHeaders,
  });
});
