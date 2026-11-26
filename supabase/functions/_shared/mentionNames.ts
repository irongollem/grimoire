// The names behind the @mentions in canon text, read for the AI and for search. A stored mention carries no name
// (`src/lib/tiptap/EntityMention.ts`: a stored name leaked a disguised NPC's true one to players, #932), so the plain
// text an AI is told would lose it. By default these are the TRUE names, for the DM's own tools. A caller whose words
// reach the players (the Narrator, `agent-turn`) asks for the table's names: an NPC still in disguise is then named by
// the disguise, as `handsIo.characterName` does, so a mention never undoes what #932 protects.
//
// Pure of Deno-only imports so the browser reads it as `@edge-shared/mentionNames.ts`, with its own client passed in.
import type { SupabaseClient } from "@supabase/supabase-js";

// The one reach into `src/` here, as `secretBlocks.ts` does: the walker that lists a document's mentions.
export { collectMentions } from "../../../src/lib/tiptap/tiptapText.ts";

export interface MentionKey {
  entityType: string;
  id: string;
}

/** Where a mention type's name lives. `scoped` tables carry the campaign; `shared` ones are the shared library. */
type NameSource = { table: string; scope: "campaign" | "campaign-or-none" | "shared" };

const SOURCES: Record<string, NameSource> = {
  player: { table: "party_members", scope: "campaign" },
  npc: { table: "npcs", scope: "campaign" },
  location: { table: "locations", scope: "campaign" },
  faction: { table: "factions", scope: "campaign" },
  species: { table: "campaign_species", scope: "campaign" },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The table a mention's name is read from, or null for a type with no name to read (`party`, an unknown type). */
function sourceFor(key: MentionKey): NameSource | null {
  if (key.entityType === "monster") {
    // A uuid is the DM's own `monsters` row (this campaign's, or one with no campaign); anything else is a library id.
    return UUID.test(key.id) ? { table: "monsters", scope: "campaign-or-none" } : { table: "library_monsters", scope: "shared" };
  }
  return SOURCES[key.entityType] ?? null;
}

/** Mentions grouped by the table their names are read from, ids deduplicated. Pure, for the query count to be tested. */
export function groupMentions(mentions: readonly MentionKey[]): Map<string, { source: NameSource; ids: string[] }> {
  const groups = new Map<string, { source: NameSource; ids: Set<string> }>();
  for (const m of mentions) {
    const source = sourceFor(m);
    if (!source) continue;
    const group = groups.get(source.table) ?? { source, ids: new Set<string>() };
    group.ids.add(m.id);
    groups.set(source.table, group);
  }
  return new Map([...groups].map(([table, g]) => [table, { source: g.source, ids: [...g.ids] }]));
}

export type MentionNameOf = (entityType: string, id: string) => string | null;

/** Whose names: the DM's (true names) or the table's (a disguised NPC under its disguise). */
export type MentionAudience = "dm" | "table";

/** The name an NPC goes by at the table: its disguise until it is revealed. Pure, for the rule to be tested. */
export function tableName(row: { name: string | null; disguise_name?: string | null; is_revealed?: boolean | null }): string | null {
  const disguise = typeof row.disguise_name === "string" ? row.disguise_name.trim() : "";
  return disguise !== "" && row.is_revealed !== true ? disguise : row.name;
}

/**
 * Reads the names of the mentions in as many queries as there are tables involved (never one per mention), scoped to
 * the campaign where the table has one, and answers with a `nameOf`. An id that resolves to nothing, and a type with
 * no name (the whole party reads as "the party"), answer null or its fixed word. A read error throws.
 */
export async function loadMentionNames(
  client: SupabaseClient,
  campaignId: string,
  mentions: readonly MentionKey[],
  audience: MentionAudience = "dm",
): Promise<MentionNameOf> {
  const groups = groupMentions(mentions);
  const names = new Map<string, string>();
  // A monster with no campaign is one DM's shelf: only this campaign's DMs' shelves may name a mention, never another
  // account's (the server reads with the service role, so the query must say whose).
  const shelfOwners = groups.has("monsters") ? await campaignDms(client, campaignId) : new Set<string>();
  await Promise.all(
    [...groups].map(async ([table, { source, ids }]) => {
      const columns = table === "npcs" && audience === "table" ? "id, name, disguise_name, is_revealed" : source.scope === "campaign-or-none" ? "id, name, campaign_id, user_id" : "id, name";
      const base = client.from(table).select(columns).in("id", ids);
      const query =
        source.scope === "campaign"
          ? base.eq("campaign_id", campaignId)
          : source.scope === "campaign-or-none"
            ? base.or(`campaign_id.eq.${campaignId},campaign_id.is.null`)
            : base;
      const { data, error } = await query;
      if (error) throw error;
      for (const row of (data ?? []) as unknown as { id: string; name: string | null; disguise_name?: string | null; is_revealed?: boolean | null; campaign_id?: string | null; user_id?: string }[]) {
        if (source.scope === "campaign-or-none" && row.campaign_id !== campaignId && !(row.user_id && shelfOwners.has(row.user_id))) continue;
        const name = table === "npcs" && audience === "table" ? tableName(row) : row.name;
        if (name) names.set(`${table}|${row.id}`, name);
      }
    }),
  );
  return (entityType, id) => {
    if (entityType === "party") return "the party";
    const source = sourceFor({ entityType, id });
    return source ? (names.get(`${source.table}|${id}`) ?? null) : null;
  };
}

/** The accounts that run a campaign: its owner and every member seated as a DM. A read error throws. */
async function campaignDms(client: SupabaseClient, campaignId: string): Promise<Set<string>> {
  const [owner, dms] = await Promise.all([
    client.from("campaigns").select("user_id").eq("id", campaignId).maybeSingle(),
    client.from("campaign_members").select("user_id").eq("campaign_id", campaignId).eq("role", "dm"),
  ]);
  if (owner.error) throw owner.error;
  if (dms.error) throw dms.error;
  const ids = new Set<string>((dms.data ?? []).map((r: { user_id: string }) => r.user_id));
  if (owner.data?.user_id) ids.add(owner.data.user_id as string);
  return ids;
}
