import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { groupMentions, loadMentionNames, tableName } from "./mentionNames";

const NPC_A = "11111111-1111-4111-8111-111111111111";
const NPC_B = "22222222-2222-4222-8222-222222222222";
const NPC_C = "33333333-3333-4333-8333-333333333333";
const PLACE = "44444444-4444-4444-8444-444444444444";

/** A client that records every query and answers each table from `rows`. */
function recordingClient(rows: Record<string, Record<string, unknown>[]>, failOn?: string) {
  const queries: { table: string; ids: string[]; filters: string[] }[] = [];
  const client = {
    from(table: string) {
      const q = { table, ids: [] as string[], filters: [] as string[] };
      queries.push(q);
      // A read with no `in` (the campaign's DMs) answers every row of its table.
      const answer = () => (table === failOn ? { data: null, error: { message: "boom" } } : { data: (rows[table] ?? []).filter((r) => q.ids.length === 0 || q.ids.includes(r.id as string)), error: null });
      const chain: Record<string, unknown> = {
        select: () => chain,
        // oxlint-disable-next-line unicorn/no-thenable
        maybeSingle: () => ({ then: (resolve: (v: unknown) => void) => { const a = answer(); resolve({ data: a.data?.[0] ?? null, error: a.error }); } }),
        in: (_c: string, ids: string[]) => ((q.ids = ids), chain),
        eq: (c: string, v: string) => (q.filters.push(`${c}=${v}`), chain),
        or: (f: string) => (q.filters.push(f), chain),
        // The query builder is awaited, so the stand-in must be thenable.
        // oxlint-disable-next-line unicorn/no-thenable
        then: (resolve: (v: unknown) => void) => resolve(answer()),
      };
      return chain;
    },
  };
  return { client: client as unknown as SupabaseClient, queries };
}

describe("loadMentionNames", () => {
  // Bug: one query per mention (a lore entry naming a dozen people read a dozen times).
  it("reads three NPCs and a place in two queries, scoped to the campaign", async () => {
    const { client, queries } = recordingClient({
      npcs: [{ id: NPC_A, name: "Maren Voss" }, { id: NPC_B, name: "Tolk" }],
      locations: [{ id: PLACE, name: "The Drowned Bell" }],
    });
    const nameOf = await loadMentionNames(client, "camp", [
      { entityType: "npc", id: NPC_A },
      { entityType: "npc", id: NPC_B },
      { entityType: "npc", id: NPC_C },
      { entityType: "location", id: PLACE },
      { entityType: "npc", id: NPC_A },
    ]);
    expect(queries).toHaveLength(2);
    expect(queries.every((q) => q.filters.includes("campaign_id=camp"))).toBe(true);
    expect(nameOf("npc", NPC_A)).toBe("Maren Voss");
    expect(nameOf("location", PLACE)).toBe("The Drowned Bell");
    // Bug: an id that matched nothing read as the string "undefined" or threw.
    expect(nameOf("npc", NPC_C)).toBeNull();
  });

  // Bug: the same id under another type answered with the NPC's name.
  it("keeps a type's names apart", async () => {
    const { client } = recordingClient({ npcs: [{ id: NPC_A, name: "Maren" }] });
    const nameOf = await loadMentionNames(client, "camp", [{ entityType: "npc", id: NPC_A }]);
    expect(nameOf("faction", NPC_A)).toBeNull();
  });

  // Bug: a failed read treated as "nobody has a name", so the canon silently lost them.
  it("throws a read error", async () => {
    const { client } = recordingClient({}, "npcs");
    await expect(loadMentionNames(client, "camp", [{ entityType: "npc", id: NPC_A }])).rejects.toMatchObject({ message: "boom" });
  });

  it("reads nothing when there are no mentions", async () => {
    const { client, queries } = recordingClient({});
    await loadMentionNames(client, "camp", []);
    expect(queries).toHaveLength(0);
  });
});

describe("groupMentions", () => {
  // Bug: a library monster id (text) sent to `monsters` is a 22P02, and a uuid sent to the library finds nothing.
  it("sends a uuid monster to monsters and a text id to library_monsters", () => {
    const groups = groupMentions([
      { entityType: "monster", id: NPC_A },
      { entityType: "monster", id: "srd_owlbear" },
      { entityType: "party", id: "party-group" },
    ]);
    expect([...groups.keys()].sort()).toEqual(["library_monsters", "monsters"]);
  });

  // Bug (#932): the Narrator was handed a disguised NPC's true name through a mention, and told it to the players.
  it("names a disguised NPC by the disguise for the table, and truly for the DM", async () => {
    const { client } = recordingClient({ npcs: [{ id: NPC_A, name: "Maren Voss", disguise_name: "the hooded woman", is_revealed: false }] });
    const mention = [{ entityType: "npc", id: NPC_A }];
    expect((await loadMentionNames(client, "camp", mention, "table"))("npc", NPC_A)).toBe("the hooded woman");
    expect((await loadMentionNames(client, "camp", mention))("npc", NPC_A)).toBe("Maren Voss");
    expect(tableName({ name: "Maren Voss", disguise_name: "the hooded woman", is_revealed: true })).toBe("Maren Voss");
  });

  // Bug: a mention holding another account's shelf monster (no campaign) read that private name with the service role.
  it("names a shelf monster only when it is this campaign's DM's", async () => {
    const MINE = "55555555-5555-4555-8555-555555555555";
    const THEIRS = "66666666-6666-4666-8666-666666666666";
    const { client } = recordingClient({
      monsters: [
        { id: MINE, name: "Bog hag", campaign_id: null, user_id: "dm-1" },
        { id: THEIRS, name: "Someone else's secret", campaign_id: null, user_id: "stranger" },
      ],
      campaigns: [{ user_id: "dm-1" }],
      campaign_members: [{ user_id: "dm-2" }],
    });
    const nameOf = await loadMentionNames(client, "camp", [{ entityType: "monster", id: MINE }, { entityType: "monster", id: THEIRS }]);
    expect(nameOf("monster", MINE)).toBe("Bog hag");
    expect(nameOf("monster", THEIRS)).toBeNull();
  });
});
