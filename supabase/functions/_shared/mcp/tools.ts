// Transport-agnostic tool layer for the Grimoire MCP server.
//
// `listTools()` returns MCP tool definitions; `callTool(ctx, name, args)` runs one
// and returns plain data (the transport wraps it as MCP content). All queries go
// through `ctx.supabase`, a client carrying the DM's OAuth JWT, so RLS does the
// tenant scoping — this layer never filters by user_id itself.
//
// Kept deliberately transport-agnostic so a future in-app agent can reuse it.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CREATABLE_TYPES,
  describeCreatableFields,
  describeImageFields,
  ENTITY_REGISTRY,
  ENTITY_TYPES,
  IMAGE_WHICH_VALUES,
  IMAGEABLE_TYPES,
  listColumns,
} from "./registry.ts";
import type { EntityDef, FieldDef } from "./registry.ts";

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

/**
 * MCP content blocks a tool can return directly (text or inline image). Most
 * tools return plain data that the transport JSON-stringifies into a text
 * block; `get_image` returns this shape so the transport emits a real image
 * block instead. `isMcpContentResult` lets the transport tell them apart.
 */
export type McpContent =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string };

export interface McpContentResult {
  _mcpContent: McpContent[];
}

export function isMcpContentResult(x: unknown): x is McpContentResult {
  return (
    typeof x === "object" &&
    x !== null &&
    Array.isArray((x as { _mcpContent?: unknown })._mcpContent)
  );
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Coerce + validate a single field value against its declared type. */
function coerceField(name: string, f: FieldDef, raw: unknown): unknown {
  switch (f.type) {
    case "text": {
      if (typeof raw !== "string") throw new Error(`Field "${name}" must be a string.`);
      return raw.trim();
    }
    case "uuid": {
      if (typeof raw !== "string") throw new Error(`Field "${name}" must be a UUID string.`);
      const v = raw.trim();
      // Blank is treated as absence upstream, so anything reaching here must be a real UUID.
      if (!UUID_RE.test(v)) throw new Error(`Field "${name}" must be a valid UUID.`);
      return v;
    }
    case "enum": {
      const v = typeof raw === "string" ? raw.trim() : raw;
      if (typeof v !== "string" || !f.values?.includes(v)) {
        throw new Error(`Field "${name}" must be one of: ${f.values?.join(", ")}.`);
      }
      return v;
    }
    case "number": {
      // Reject blank strings (Number("") and Number("  ") are 0, not absence).
      if (typeof raw === "string" && raw.trim() === "") throw new Error(`Field "${name}" must be a number.`);
      const n = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isFinite(n)) throw new Error(`Field "${name}" must be a number.`);
      // Mirrors the column's CHECK constraint, so an out-of-range value comes
      // back as a sentence the agent can act on rather than a raw Postgres
      // constraint-violation string.
      if (f.min !== undefined && n < f.min) throw new Error(`Field "${name}" must be at least ${f.min}.`);
      if (f.max !== undefined && n > f.max) throw new Error(`Field "${name}" must be at most ${f.max}.`);
      return n;
    }
    case "boolean": {
      if (typeof raw !== "boolean") throw new Error(`Field "${name}" must be true or false.`);
      return raw;
    }
    case "text[]": {
      if (!Array.isArray(raw) || raw.some((x) => typeof x !== "string")) {
        throw new Error(`Field "${name}" must be an array of strings.`);
      }
      return (raw as string[]).map((x) => x.trim());
    }
    case "uuid[]": {
      if (!Array.isArray(raw) || raw.some((x) => typeof x !== "string")) {
        throw new Error(`Field "${name}" must be an array of UUID strings.`);
      }
      return (raw as string[]).map((x) => {
        const v = x.trim();
        if (!UUID_RE.test(v)) throw new Error(`Field "${name}" contains "${x}", which is not a valid UUID.`);
        return v;
      });
    }
    case "json": {
      // Objects and arrays only. A bare scalar would be valid JSON but never the
      // shape any of these columns holds, and a JSON *string* is the classic
      // near-miss — an agent stringifying the payload it meant to send.
      if (typeof raw === "string") {
        throw new Error(
          `Field "${name}" must be a JSON object/array, not a string — send the value itself, shaped ${f.shape ?? "as documented"}.`,
        );
      }
      if (typeof raw !== "object") {
        throw new Error(`Field "${name}" must be a JSON object/array shaped ${f.shape ?? "as documented"}.`);
      }
      return raw;
    }
  }
}

/**
 * Whitelist + validate caller-supplied fields against the entity's `create`
 * block. Unknown fields are rejected (catches typos and any attempt to write
 * `user_id`/`id`/timestamps, which are never declared). On create, all required
 * fields must be present; on update, at least one field must be given.
 */
export function validateFields(def: EntityDef, input: unknown, opts: { partial: boolean }): Record<string, unknown> {
  const create = def.create;
  if (!create) {
    throw new Error(`Type "${def.type}" is read-only. Creatable types: ${CREATABLE_TYPES.join(", ")}.`);
  }
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("`fields` must be an object.");
  }

  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(input as Record<string, unknown>)) {
    if (raw === undefined || raw === null) continue; // absence = keep default / leave unchanged
    const fdef = create.fields[key];
    if (!fdef) {
      throw new Error(`Unknown field "${key}" for type "${def.type}". Allowed: ${Object.keys(create.fields).join(", ")}.`);
    }
    // A blank/whitespace string means "not provided" for every type except free
    // text — so an empty uuid/number/enum is dropped (kept null/default) rather
    // than coerced to "" / 0 or sent on to fail as a raw DB cast error.
    if (typeof raw === "string" && raw.trim() === "" && fdef.type !== "text") continue;
    out[key] = coerceField(key, fdef, raw);
  }

  if (opts.partial) {
    if (Object.keys(out).length === 0) throw new Error("`fields` must contain at least one field to update.");
  } else {
    const missing = Object.entries(create.fields)
      .filter(([name, f]) => f.required && (out[name] === undefined || out[name] === ""))
      .map(([name]) => name);
    if (missing.length) throw new Error(`Missing required field(s) for ${def.label}: ${missing.join(", ")}.`);
  }
  return out;
}

/**
 * Pick the storage-URL column for a `get_image` request. `which` defaults to the
 * entity's first declared image. Rejects entities with no art and unknown
 * selectors with a list of the valid options. Pure — no I/O — so it's unit-tested
 * directly while the fetch/encode path stays an integration concern.
 */
export function resolveImageColumn(def: EntityDef, which: unknown): { which: string; column: string } {
  const fields = def.imageFields;
  if (!fields) {
    throw new Error(`Type "${def.type}" has no images. Imageable types: ${IMAGEABLE_TYPES.join(", ")}.`);
  }
  const keys = Object.keys(fields);
  const requested = which === undefined || which === null || which === ""
    ? keys[0]
    : String(which).toLowerCase().trim();
  const column = fields[requested];
  if (!column) {
    throw new Error(`Unknown image "${requested}" for ${def.label}. Available: ${keys.join(", ")}.`);
  }
  return { which: requested, column };
}

/** Public prefix of this project's Supabase storage, or null outside Deno (tests). */
function storageObjectPrefix(): string | null {
  const deno = (globalThis as { Deno?: { env?: { get(k: string): string | undefined } } }).Deno;
  const url = deno?.env?.get("SUPABASE_URL");
  return url ? `${url}/storage/v1/object/` : null;
}

/** Base64-encode bytes in chunks (avoids the arg-count limit of `btoa(String.fromCharCode(...))`). */
function base64FromBytes(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * Translate a Supabase write error into a user-facing message. The free-tier
 * quota triggers raise `quota_exceeded`; enrich that with the actual limit via
 * `check_quota` (which counts the caller's own rows) so the AI can relay it.
 */
async function writeError(ctx: ToolContext, error: { message?: string }, def: EntityDef): Promise<Error> {
  const msg = typeof error?.message === "string" ? error.message : "";
  if (msg.includes("quota_exceeded")) {
    try {
      const { data } = await ctx.supabase.rpc("check_quota", { resource_type: def.table });
      const limit = (data as { limit?: number } | null)?.limit;
      if (typeof limit === "number" && limit >= 0) {
        return new Error(
          `Free-tier limit reached (${limit}) for ${def.label} content. Upgrade to Pro for unlimited, or delete some first.`,
        );
      }
    } catch { /* fall through to the generic message */ }
    return new Error(`Free-tier limit reached for ${def.label} content. Upgrade to Pro for unlimited.`);
  }
  return new Error(msg || "Write failed.");
}

/** Normalize a raw row into a compact hit with a uniform `name` key. */
/**
 * Columns are chosen at runtime from the entity registry, so PostgREST cannot
 * infer a row shape from the `.select()` string. Rows are keyed lookups only.
 */
type EntityRow = Record<string, unknown>;

function toHit(def: EntityDef, row: EntityRow) {
  return {
    type: def.type,
    id: row.id,
    name: row[def.nameField] ?? null,
    summary: def.summaryField ? (row[def.summaryField] ?? null) : null,
    campaign_id: row.campaign_id ?? null,
  };
}

/** Read an optional `campaign_id` argument, rejecting anything that isn't a UUID. */
function campaignArg(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const v = raw.trim();
  if (!UUID_RE.test(v)) throw new Error("`campaign_id` must be a valid UUID.");
  return v;
}

/**
 * The minimal slice of a PostgREST query builder the campaign filter needs.
 * Structural rather than imported so this stays a pure, unit-testable function
 * instead of dragging the full generic builder type through.
 */
interface CampaignFilterable<T> {
  eq(column: string, value: string): T;
  or(filters: string): T;
}

/**
 * Narrow a query to one campaign, honouring what `campaign_id` means for the
 * table (see `campaignScope` in the registry). On a "shared" library table NULL
 * means "available in every campaign", so an equality match would hide the DM's
 * entire general catalogue from a campaign-scoped question — those tables get
 * `is null OR eq` instead.
 *
 * `campaignId` is interpolated into a PostgREST filter string here, where `,`
 * and `)` are syntax, so it MUST already be UUID-validated by `campaignArg`.
 */
export function applyCampaignFilter<T extends CampaignFilterable<T>>(
  query: T,
  def: EntityDef,
  campaignId: string,
): T {
  return def.campaignScope === "shared"
    ? query.or(`campaign_id.is.null,campaign_id.eq.${campaignId}`)
    : query.eq("campaign_id", campaignId);
}

export function listTools(): ToolDef[] {
  const typeEnum = { type: "string", enum: ENTITY_TYPES };
  const creatableEnum = { type: "string", enum: CREATABLE_TYPES };
  // `list` and `search` take the same argument and must explain it the same way.
  const campaignIdArg = {
    type: "string",
    description:
      "Narrow to one campaign. Types whose rows belong to a campaign (npc, quest, party_member, …) are matched exactly; " +
      "the shared library types (item, monster, spell, trap, rule) also keep their general-catalogue rows, which are the " +
      "ones available in every campaign.",
  };
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
          campaign_id: campaignIdArg,
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
      name: "get_image",
      description:
        "Fetch an entity's image as an inline image you can actually view. `get` only returns the storage URL, which the agent sandbox usually can't load; this returns the image bytes through the MCP channel instead. Provide `type`, `id`, and optionally `which` (defaults to the entity's primary image). Available images per type:\n" +
        describeImageFields(),
      inputSchema: {
        type: "object",
        properties: {
          type: { type: "string", enum: IMAGEABLE_TYPES },
          id: { type: "string", description: "The entity's id (UUID)." },
          which: {
            type: "string",
            enum: IMAGE_WHICH_VALUES,
            description: "Which image to fetch (defaults to the primary one for the type).",
          },
        },
        required: ["type", "id"],
        additionalProperties: false,
      },
    },
    {
      name: "list",
      description:
        "List entities of one type (most recently updated first). Returns lightweight rows; use `get` for full details. Optionally filter by campaign.",
      inputSchema: {
        type: "object",
        properties: {
          type: typeEnum,
          campaign_id: campaignIdArg,
          limit: { type: "number", description: `Max rows (1-${MAX_LIMIT}, default ${DEFAULT_LIMIT}).` },
        },
        required: ["type"],
        additionalProperties: false,
      },
    },
    {
      name: "create",
      description:
        "Create a new piece of the DM's content and return the created record. Provide `type` and a `fields` object. " +
        "The owner is set automatically — never pass user_id/id. Free-tier limits apply (some types are capped). " +
        "Images are never writable here; upload art in the app. " +
        "Omitting `campaign_id` on item/monster/spell/trap/rule files the row in the DM's general catalogue, visible from every campaign — " +
        "which is usually what you want when transcribing source material. " +
        "Writable fields per type (`*`=required, `[]`=string array, `[uuid]`=id array, `#`=number, `?`=boolean, `(a|b)`=enum, `{…}`=JSON shape):\n" +
        describeCreatableFields(),
      inputSchema: {
        type: "object",
        properties: {
          type: creatableEnum,
          fields: {
            type: "object",
            description: "Field values for the new entity (see the per-type list in this tool's description).",
            additionalProperties: true,
          },
        },
        required: ["type", "fields"],
        additionalProperties: false,
      },
    },
    {
      name: "update",
      description:
        "Update an existing entity by id and return the updated record. Provide `type`, `id`, and a partial `fields` object containing only what you want to change. Same writable fields as `create` (none required here). You can only update your own content.",
      inputSchema: {
        type: "object",
        properties: {
          type: creatableEnum,
          id: { type: "string", description: "The entity's id (UUID)." },
          fields: {
            type: "object",
            description: "The fields to change (partial — omit the rest).",
            additionalProperties: true,
          },
        },
        required: ["type", "id", "fields"],
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
    case "get_image":
      return getImage(ctx, args);
    case "list":
      return list(ctx, args);
    case "create":
      return create(ctx, args);
    case "update":
      return update(ctx, args);
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
  const campaignId = campaignArg(args.campaign_id);

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
      // A second `.or()` is appended as its own `or=` param, and PostgREST ANDs
      // top-level params — so the campaign group narrows the text match rather
      // than widening it.
      if (campaignId) query = applyCampaignFilter(query, def, campaignId);
      const { data, error } = await query.overrideTypes<EntityRow[]>();
      // A single bad table shouldn't sink the whole multi-type search.
      if (error) return { type: def.type, error: error.message, hits: [] as unknown[] };
      return { type: def.type, hits: (data ?? []).map((r) => toHit(def, r)) };
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

async function getImage(ctx: ToolContext, args: Record<string, unknown>): Promise<McpContentResult> {
  const def = resolveDef(args.type);
  const id = String(args.id ?? "").trim();
  if (!id) throw new Error("`id` is required.");
  const { which, column } = resolveImageColumn(def, args.which);

  // The row is fetched under the caller's JWT, so RLS already gates access — if
  // they can read the entity, they may see its art.
  const { data, error } = await ctx.supabase
    .from(def.table)
    .select(`id, ${column}`)
    .eq("id", id)
    .maybeSingle()
    .overrideTypes<EntityRow, { merge: false }>();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(`No ${def.label} found with id ${id} (it may not exist or you may not have access).`);
  const url = data[column];
  if (typeof url !== "string" || !url) throw new Error(`This ${def.label} has no ${which} image set.`);

  // SSRF guard: only inline-fetch objects from this project's own Supabase
  // storage. Externally-hosted art (or any unexpected URL) is returned as a link
  // for the client to follow itself, never proxied through the server.
  const prefix = storageObjectPrefix();
  if (!prefix || !url.startsWith(prefix)) {
    return { _mcpContent: [{ type: "text", text: `Image is hosted externally; load it directly: ${url}` }] };
  }

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${which} image (HTTP ${res.status}).`);
  const mimeType = res.headers.get("content-type")?.split(";")[0]?.trim() || "image/*";
  const bytes = new Uint8Array(await res.arrayBuffer());
  return {
    _mcpContent: [
      { type: "image", data: base64FromBytes(bytes), mimeType },
      // Keep the URL too, for clients that prefer linking.
      { type: "text", text: url },
    ],
  };
}

async function list(ctx: ToolContext, args: Record<string, unknown>) {
  const def = resolveDef(args.type);
  const limit = clampLimit(args.limit);
  const campaignId = campaignArg(args.campaign_id);
  let query = ctx.supabase
    .from(def.table)
    .select(listColumns(def))
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (campaignId) query = applyCampaignFilter(query, def, campaignId);
  const { data, error } = await query.overrideTypes<EntityRow[]>();
  if (error) throw new Error(error.message);
  return { type: def.type, count: (data ?? []).length, items: (data ?? []).map((r) => toHit(def, r)) };
}

async function create(ctx: ToolContext, args: Record<string, unknown>) {
  const def = resolveDef(args.type);
  const fields = validateFields(def, args.fields, { partial: false });
  // Force ownership to the authenticated caller; never trust a client-supplied id/user_id.
  const row = { ...fields, user_id: ctx.userId };
  const { data, error } = await ctx.supabase.from(def.table).insert(row).select("*").single();
  if (error) throw await writeError(ctx, error, def);
  return data;
}

async function update(ctx: ToolContext, args: Record<string, unknown>) {
  const def = resolveDef(args.type);
  const id = String(args.id ?? "").trim();
  if (!id) throw new Error("`id` is required.");
  const fields = validateFields(def, args.fields, { partial: true });
  // RLS scopes the update to the caller's own rows; no match → not found / no access.
  const { data, error } = await ctx.supabase.from(def.table).update(fields).eq("id", id).select("*").maybeSingle();
  if (error) throw await writeError(ctx, error, def);
  if (!data) throw new Error(`No ${def.label} found with id ${id} (it may not exist or you may not have access).`);
  return data;
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
