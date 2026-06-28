// Transport-agnostic read-only tool layer for the Grimoire MCP server.
//
// `listTools()` returns MCP tool definitions; `callTool(ctx, name, args)` runs one
// and returns plain data (the transport wraps it as MCP content). All queries go
// through `ctx.supabase`, a client carrying the DM's OAuth JWT, so RLS does the
// tenant scoping — this layer never filters by user_id itself.
//
// Kept deliberately transport-agnostic so a future in-app agent can reuse it.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ENTITY_REGISTRY, ENTITY_TYPES, listColumns } from "./registry.ts";
import type { EntityDef } from "./registry.ts";

export interface ToolContext {
  supabase: SupabaseClient;
  /** The authenticated DM's user id (from the validated JWT). */
  userId: string;
}

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;
const SEARCH_PER_TYPE = 8;

function clampLimit(n: unknown, fallback = DEFAULT_LIMIT): number {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.floor(n) : fallback;
  return Math.max(1, Math.min(MAX_LIMIT, v));
}

function resolveDef(type: unknown): EntityDef {
  const key = String(type ?? "").toLowerCase().trim();
  const def = ENTITY_REGISTRY[key];
  if (!def) {
    throw new Error(
      `Unknown entity type "${type}". Valid types: ${ENTITY_TYPES.join(", ")}.`,
    );
  }
  return def;
}

// PostgREST `.or()` filters use `,` `(` `)` as syntax and `*` as the ilike
// wildcard, so strip those (plus `%`/`\`/quotes/`:`) from user input before
// interpolating, then wrap the cleaned term in `*…*`.
function sanitizeQuery(q: unknown): string {
  return String(q ?? "")
    .replace(/[,()*%\\":]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Normalize a raw row into a compact hit with a uniform `name` key. */
function toHit(def: EntityDef, row: Record<string, unknown>) {
  return {
    type: def.type,
    id: row.id,
    name: row[def.nameField] ?? null,
    summary: def.summaryField ? (row[def.summaryField] ?? null) : null,
    campaign_id: def.campaignScoped ? (row.campaign_id ?? null) : undefined,
  };
}

export function listTools(): ToolDef[] {
  const typeEnum = { type: "string", enum: ENTITY_TYPES };
  return [
    {
      name: "list_campaigns",
      description:
        "List the DM's campaigns (id, name, setting). Use this first to find a campaign_id to scope other calls to.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
    },
    {
      name: "search",
      description:
        "Full-text-ish search across the DM's content by name and key text fields. Returns lightweight hits (type, id, name, summary). Use `get` to fetch full details for a hit. Optionally restrict to certain types or a campaign.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Text to search for (matched against names and descriptions)." },
          types: { type: "array", items: typeEnum, description: "Limit to these entity types. Omit to search all." },
          campaign_id: { type: "string", description: "Restrict campaign-scoped types to this campaign." },
          limit: { type: "number", description: `Max hits per type (1-${MAX_LIMIT}, default ${SEARCH_PER_TYPE}).` },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
    {
      name: "get",
      description:
        "Fetch the full record for a single entity by type and id — including stat blocks and all details. Use after `search`/`list`.",
      inputSchema: {
        type: "object",
        properties: {
          type: typeEnum,
          id: { type: "string", description: "The entity's id (UUID)." },
        },
        required: ["type", "id"],
        additionalProperties: false,
      },
    },
    {
      name: "list",
      description:
        "List entities of one type (most recently updated first). Returns lightweight rows; use `get` for full details. Optionally filter campaign-scoped types by campaign.",
      inputSchema: {
        type: "object",
        properties: {
          type: typeEnum,
          campaign_id: { type: "string", description: "Restrict campaign-scoped types to this campaign." },
          limit: { type: "number", description: `Max rows (1-${MAX_LIMIT}, default ${DEFAULT_LIMIT}).` },
        },
        required: ["type"],
        additionalProperties: false,
      },
    },
    {
      name: "campaign_overview",
      description:
        "A quick digest of one campaign: its setting, party members, active quests, and most recent notes. Good for a mid-session 'where are we' recap.",
      inputSchema: {
        type: "object",
        properties: {
          campaign_id: { type: "string", description: "The campaign to summarize." },
        },
        required: ["campaign_id"],
        additionalProperties: false,
      },
    },
  ];
}

export async function callTool(
  ctx: ToolContext,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case "list_campaigns":
      return listCampaigns(ctx);
    case "search":
      return search(ctx, args);
    case "get":
      return get(ctx, args);
    case "list":
      return list(ctx, args);
    case "campaign_overview":
      return campaignOverview(ctx, args);
    default:
      throw new Error(`Unknown tool "${name}".`);
  }
}

async function listCampaigns(ctx: ToolContext) {
  const { data, error } = await ctx.supabase
    .from("campaigns")
    .select("id, name, setting, description, updated_at")
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return { campaigns: data ?? [] };
}

async function search(ctx: ToolContext, args: Record<string, unknown>) {
  const q = sanitizeQuery(args.query);
  if (!q) throw new Error("`query` must contain searchable text.");
  const pattern = `*${q}*`;
  const perType = clampLimit(args.limit, SEARCH_PER_TYPE);
  const campaignId = typeof args.campaign_id === "string" ? args.campaign_id : null;

  const requested = Array.isArray(args.types) && args.types.length
    ? (args.types as unknown[]).map(resolveDef)
    : ENTITY_TYPES.map((t) => ENTITY_REGISTRY[t]);

  const perQuery = await Promise.all(
    requested.map(async (def) => {
      let query = ctx.supabase
        .from(def.table)
        .select(listColumns(def))
        .or(def.searchFields.map((f) => `${f}.ilike.${pattern}`).join(","))
        .limit(perType);
      if (campaignId && def.campaignScoped) query = query.eq("campaign_id", campaignId);
      const { data, error } = await query;
      // A single bad table shouldn't sink the whole multi-type search.
      if (error) return { type: def.type, error: error.message, hits: [] as unknown[] };
      return { type: def.type, hits: (data ?? []).map((r) => toHit(def, r as Record<string, unknown>)) };
    }),
  );

  const hits = perQuery.flatMap((r) => r.hits);
  const errors = perQuery.filter((r) => "error" in r && r.error).map((r) => ({ type: r.type, error: (r as { error: string }).error }));
  return { query: q, count: hits.length, hits, ...(errors.length ? { errors } : {}) };
}

async function get(ctx: ToolContext, args: Record<string, unknown>) {
  const def = resolveDef(args.type);
  const id = String(args.id ?? "").trim();
  if (!id) throw new Error("`id` is required.");
  const { data, error } = await ctx.supabase.from(def.table).select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(`No ${def.label} found with id ${id} (it may not exist or you may not have access).`);
  return data;
}

async function list(ctx: ToolContext, args: Record<string, unknown>) {
  const def = resolveDef(args.type);
  const limit = clampLimit(args.limit);
  const campaignId = typeof args.campaign_id === "string" ? args.campaign_id : null;
  let query = ctx.supabase
    .from(def.table)
    .select(listColumns(def))
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (campaignId && def.campaignScoped) query = query.eq("campaign_id", campaignId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return { type: def.type, count: (data ?? []).length, items: (data ?? []).map((r) => toHit(def, r as Record<string, unknown>)) };
}

async function campaignOverview(ctx: ToolContext, args: Record<string, unknown>) {
  const campaignId = String(args.campaign_id ?? "").trim();
  if (!campaignId) throw new Error("`campaign_id` is required.");

  const [campaign, party, quests, notes] = await Promise.all([
    ctx.supabase.from("campaigns").select("id, name, setting, description").eq("id", campaignId).maybeSingle(),
    ctx.supabase.from("party_members").select("id, name, class, level, current_hp, max_hp, ac").eq("campaign_id", campaignId),
    ctx.supabase.from("quests").select("id, title, summary, status").eq("campaign_id", campaignId).eq("status", "active"),
    ctx.supabase.from("notes").select("id, title, category, updated_at").eq("campaign_id", campaignId).order("updated_at", { ascending: false }).limit(5),
  ]);

  if (campaign.error) throw new Error(campaign.error.message);
  if (!campaign.data) throw new Error(`No campaign found with id ${campaignId} (it may not exist or you may not have access).`);

  return {
    campaign: campaign.data,
    party: party.data ?? [],
    active_quests: quests.data ?? [],
    recent_notes: notes.data ?? [],
  };
}
