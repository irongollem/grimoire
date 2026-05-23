/**
 * Supabase DB helpers for `scripts/import-chapter-npcs.ts`.
 *
 * Uses the service-role key (RLS bypass) so the script can read/write campaign
 * data without an authenticated session. Reads VITE_SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY from the environment — invoke via:
 *   tsx --env-file=.env.local scripts/import-chapter-npcs.ts ...
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { LocationType } from "@/types/location.types";
import type { NpcRelationship, NpcStatus } from "@/types/npc.types";

import type { LocationSpec, NpcRecord } from "./parse-chapter-npcs";
import { normalizeName } from "./parse-chapter-npcs";
import { type FieldSpec, type RowMergePlan } from "./merge-fields";
import { NPC_RICHTEXT_FIELDS, tiptapifyFields } from "./tiptap";

/**
 * Field merge schema for the NPC enrich-merge path. Only fields the parser
 * actually produces appear here — other columns (portrait_url, stat_block,
 * disguise_*, etc.) are deliberately untouched so the importer never overwrites
 * manual UI work outside its scope.
 */
export const NPC_MERGE_FIELDS: Record<string, FieldSpec> = {
  race: { kind: "scalar" },
  occupation: { kind: "scalar" },
  appearance: { kind: "prose" },
  personality: { kind: "prose" },
  backstory: { kind: "prose" },
  notes: { kind: "prose" },
  status: { kind: "scalar" },
  relationship: { kind: "scalar" },
  relevance: { kind: "scalar" },
  tags: { kind: "array" },
  location_id: { kind: "scalar" },
};

export function createServiceClient(): SupabaseClient {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Run via:\n" +
      "  tsx --env-file=.env.local scripts/import-chapter-npcs.ts ...",
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Existing NPC row content needed for the enrich-merge planning step.
 *
 * We fetch every field listed in `NPC_MERGE_FIELDS` so the planner can compare
 * existing values against the source record. Untouched columns (stat_block,
 * portrait_url, etc.) are left out — they're not part of the merge contract.
 */
export interface ExistingNpc {
  id: string;
  name: string;
  normalized: string;
  race: string | null;
  occupation: string | null;
  appearance: string | null;
  personality: string | null;
  backstory: string | null;
  notes: string | null;
  status: NpcStatus;
  relationship: NpcRelationship;
  relevance: number;
  tags: string[];
  location_id: string | null;
}

export interface ExistingLocation {
  id: string;
  name: string;
}

export interface DbState {
  npcs: ExistingNpc[];
  locations: ExistingLocation[];
  /** Convenience map: location name → id. */
  locationByName: Map<string, string>;
  /** Convenience map: normalized NPC name → row. */
  npcByNormalizedName: Map<string, ExistingNpc>;
}

export async function fetchDbState(
  supabase: SupabaseClient,
  userId: string,
  campaignId: string,
): Promise<DbState> {
  const [npcRes, locRes] = await Promise.all([
    supabase
      .from("npcs")
      .select("id, name, race, occupation, appearance, personality, backstory, notes, status, relationship, relevance, tags, location_id")
      .eq("user_id", userId)
      .eq("campaign_id", campaignId),
    supabase.from("locations").select("id, name").eq("user_id", userId).eq("campaign_id", campaignId),
  ]);
  if (npcRes.error) throw npcRes.error;
  if (locRes.error) throw locRes.error;

  const npcs: ExistingNpc[] = (npcRes.data ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    normalized: normalizeName(r.name as string),
    race: (r.race as string | null) ?? null,
    occupation: (r.occupation as string | null) ?? null,
    appearance: (r.appearance as string | null) ?? null,
    personality: (r.personality as string | null) ?? null,
    backstory: (r.backstory as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
    status: (r.status as NpcStatus) ?? "alive",
    relationship: (r.relationship as NpcRelationship) ?? "neutral",
    relevance: (r.relevance as number) ?? 3,
    tags: (r.tags as string[] | null) ?? [],
    location_id: (r.location_id as string | null) ?? null,
  }));
  const locations: ExistingLocation[] = (locRes.data ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
  }));

  const locationByName = new Map<string, string>();
  for (const l of locations) locationByName.set(l.name, l.id);
  const npcByNormalizedName = new Map<string, ExistingNpc>();
  for (const n of npcs) npcByNormalizedName.set(n.normalized, n);

  return { npcs, locations, locationByName, npcByNormalizedName };
}

export interface LocationInsertPayload {
  user_id: string;
  campaign_id: string;
  parent_id: string | null;
  name: string;
  location_type: LocationType;
  description: string;
  tags: string[];
}

/**
 * Create the locations that aren't already in the campaign.
 * Returns a name→id map covering both newly-inserted and pre-existing locations.
 *
 * Processes new locations in dependency order (parents before children) so that
 * a parent and its children can be created in the same import run without
 * landing with parent_id=NULL. Each round inserts all specs whose parent is
 * already resolved (either pre-existing or created in a previous round).
 */
export async function ensureLocations(
  supabase: SupabaseClient,
  userId: string,
  campaignId: string,
  specs: LocationSpec[],
  state: DbState,
): Promise<{
  created: ExistingLocation[];
  reused: ExistingLocation[];
  byKey: Map<string, string>;
}> {
  const created: ExistingLocation[] = [];
  const reused: ExistingLocation[] = [];
  const byKey = new Map<string, string>();

  // Growing name→id map: starts from DB state, accumulates newly created rows.
  const nameToId = new Map<string, string>(state.locationByName);

  // Separate pre-existing from those that need creating.
  let pending: LocationSpec[] = [];
  for (const spec of specs) {
    const existingId = nameToId.get(spec.name);
    if (existingId) {
      reused.push({ id: existingId, name: spec.name });
      byKey.set(spec.key, existingId);
    } else {
      pending.push(spec);
    }
  }

  // Insert in rounds. Each round takes all specs whose parent is now resolved.
  // Terminates when pending is empty or nothing was resolved (circular / missing
  // parent — fall through with a warning and NULL parent_id).
  while (pending.length > 0) {
    const ready = pending.filter(
      (s) => !s.parent_name || nameToId.has(s.parent_name),
    );
    const notReady = pending.filter(
      (s) => s.parent_name && !nameToId.has(s.parent_name),
    );

    // If nothing is ready, all remaining have unresolvable parents. Warn and
    // insert anyway with NULL parent_id so the rest of the import can proceed.
    const batch = ready.length > 0 ? ready : notReady;
    pending = ready.length > 0 ? notReady : [];

    for (const spec of batch) {
      if (ready.length === 0) {
        // eslint-disable-next-line no-console
        console.warn(
          `WARN: location ${spec.name} has parent_name=${spec.parent_name} but it ` +
          `could not be resolved — inserting with parent_id=NULL`,
        );
      }
    }

    const payload: LocationInsertPayload[] = batch.map((spec) => ({
      user_id: userId,
      campaign_id: campaignId,
      parent_id: spec.parent_name ? (nameToId.get(spec.parent_name) ?? null) : null,
      name: spec.name,
      location_type: spec.type,
      description: spec.description,
      tags: spec.tags,
    }));

    const { data, error } = await supabase
      .from("locations")
      .insert(payload)
      .select("id, name");
    if (error) throw error;

    for (let i = 0; i < (data ?? []).length; i++) {
      const row = data![i]!;
      const spec = batch[i]!;
      const id = row.id as string;
      created.push({ id, name: row.name as string });
      byKey.set(spec.key, id);
      nameToId.set(row.name as string, id); // make available to subsequent rounds
    }
  }

  return { created, reused, byKey };
}

export interface NpcInsertPayload {
  user_id: string;
  campaign_id: string;
  location_id: string | null;
  name: string;
  race: string | null;
  occupation: string | null;
  appearance: string | null;
  personality: string | null;
  backstory: string | null;
  notes: string | null;
  status: NpcStatus;
  relationship: NpcRelationship;
  tags: string[];
  // Other columns (alignment, age, portrait_*, disguise_*, is_revealed, stat_block,
  // scriptorium_doc_id, player_visible_*) take DB defaults — see migrations.
  // `relevance` is not in this payload because the column rejects writes from
  // the service-role client unless we set it explicitly; we do that below.
  relevance: number;
}

/**
 * Apply an enrich-merge to a single existing NPC row. Issues UPDATE with only
 * the fields in `plan.updates`. Rich-text fields (appearance, personality,
 * backstory, notes) are converted from plain markdown to Tiptap JSON at this
 * write boundary so they render correctly in the `RichTextEditor` UI.
 * Returns the updated row's name (echo for log).
 */
export async function enrichNpc(
  supabase: SupabaseClient,
  npcId: string,
  plan: RowMergePlan,
): Promise<{ id: string; name: string }> {
  const updates = tiptapifyFields(plan.updates, NPC_RICHTEXT_FIELDS);
  const { data, error } = await supabase
    .from("npcs")
    .update(updates)
    .eq("id", npcId)
    .select("id, name")
    .single();
  if (error) throw error;
  return { id: data!.id as string, name: data!.name as string };
}

/** Insert NPCs in one batch. Returns inserted rows. */
export async function insertNpcs(
  supabase: SupabaseClient,
  userId: string,
  campaignId: string,
  records: NpcRecord[],
  locationByKey: Map<string, string>,
): Promise<Array<{ id: string; name: string; location_id: string | null }>> {
  if (records.length === 0) return [];

  const payload = records.map((r) => {
    const base: NpcInsertPayload = {
      user_id: userId,
      campaign_id: campaignId,
      location_id: r.location_key ? (locationByKey.get(r.location_key) ?? null) : null,
      name: r.name,
      race: r.race || null,
      occupation: r.occupation || null,
      appearance: r.appearance || null,
      personality: r.personality || null,
      backstory: r.backstory || null,
      notes: r.notes || null,
      status: r.status,
      relationship: r.relationship,
      relevance: r.relevance,
      tags: r.tags,
    };
    // Convert rich-text fields from plain markdown to Tiptap JSON at the
    // write boundary so they land in a form the editor renders correctly.
    // Cast to widen `NpcInsertPayload` (strict interface, no index signature)
    // to the generic Record<string, unknown> that `tiptapifyFields` expects.
    return tiptapifyFields(base as unknown as Record<string, unknown>, NPC_RICHTEXT_FIELDS) as unknown as NpcInsertPayload;
  });

  const { data, error } = await supabase
    .from("npcs")
    .insert(payload)
    .select("id, name, location_id");
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    location_id: (row.location_id as string | null) ?? null,
  }));
}
