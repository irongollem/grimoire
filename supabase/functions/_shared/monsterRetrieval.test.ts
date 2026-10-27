import { beforeEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseFake } from "@/test/supabaseFake";
import { retrieveMonsterCandidates } from "./monsterRetrieval";

/**
 * Caller-side half of the #595 retrieval guarantees. The SQL half (the
 * enabled-sources and ruleset gates are WHERE predicates applied before the
 * similarity ranking) is asserted against a real Postgres in
 * `supabase/tests/monster_retrieval.test.sql`, because it is a property of the
 * query plan.
 *
 * What is provable here is everything the RPCs cannot defend on their own:
 * which slugs get handed to them (only this campaign's), that the library RPC
 * is not called at all when a campaign has enabled nothing, the homebrew-first
 * merge order, that the not-yet-embedded read stays inside the owner's rows,
 * and that a DB error is never silently read as "this campaign has no sources".
 */

const fake = createSupabaseFake();
// The fake implements the slice of the client this module calls.
const admin = fake.client as unknown as SupabaseClient;

interface MatchRow { id: string; name: string; monster_type: string | null; challenge_rating: string | null }

const BASE_ARGS = {
  queryVector: "[0.1,0.2]",
  ownerId: "11111111-1111-4111-8111-111111111111",
  campaignId: "22222222-2222-4222-8222-222222222222",
  ruleset: "2014",
  embeddingModel: "text-embedding-3-small",
  perSide: 15,
  unembeddedCap: 25,
};
const OTHER_CAMPAIGN = "33333333-3333-4333-8333-333333333333";
const OTHER_OWNER = "44444444-4444-4444-8444-444444444444";

const libRow = (name: string, cr = "3", type = "undead", id = name.toLowerCase()): MatchRow =>
  ({ id, name, monster_type: type, challenge_rating: cr });

/** What each RPC was handed, and what it answers. */
const rpcArgs: Record<string, Record<string, unknown>[]> = {};
function answerRpc(name: string, rows: MatchRow[]) {
  fake.onRpc(name, (args) => {
    (rpcArgs[name] ??= []).push(args);
    return rows;
  });
}

function enable(campaignId: string, ...slugs: string[]) {
  fake.seed("campaign_enabled_sources", slugs.map((source_slug) => ({ campaign_id: campaignId, source_slug })));
}

const homebrew = (id: string, name: string, over: Record<string, unknown> = {}) => ({
  id,
  name,
  monster_type: "beast",
  stat_block: { challenge_rating: "1" },
  user_id: BASE_ARGS.ownerId,
  campaign_id: BASE_ARGS.campaignId,
  updated_at: "2026-10-01T00:00:00Z",
  ...over,
});

beforeEach(() => {
  fake.reset();
  for (const key of Object.keys(rpcArgs)) delete rpcArgs[key];
  answerRpc("match_custom_monsters", []);
  answerRpc("match_library_monsters", []);
});

describe("retrieveMonsterCandidates: the enabled-sources boundary", () => {
  it("hands the library matcher this campaign's enabled slugs and no other campaign's", async () => {
    enable(BASE_ARGS.campaignId, "tob2", "blackflag");
    enable(OTHER_CAMPAIGN, "secret-book");

    await retrieveMonsterCandidates(admin, BASE_ARGS);

    // A book another campaign turned on must not be searched for this one (#567/#583 licensing).
    expect(rpcArgs.match_library_monsters).toHaveLength(1);
    expect(rpcArgs.match_library_monsters[0].source_slugs).toEqual(["tob2", "blackflag"]);
  });

  it("does not call the library matcher at all when the campaign has enabled no sources", async () => {
    // Never call it with an empty array and trust the SQL to return nothing: a
    // single loosened predicate on the other side would then match every book
    // in the library rather than none. Skipping the call makes that unreachable.
    enable(OTHER_CAMPAIGN, "secret-book");
    answerRpc("match_library_monsters", [libRow("Library Ghoul")]);

    const candidates = await retrieveMonsterCandidates(admin, BASE_ARGS);

    expect(rpcArgs.match_library_monsters).toBeUndefined();
    expect(candidates).toEqual([]);
  });

  it("still returns the DM's own homebrew when no sources are enabled", async () => {
    // Custom monsters are the DM's own rows and are not source-gated.
    answerRpc("match_custom_monsters", [libRow("Gloomfen Stalker", "6")]);

    const candidates = await retrieveMonsterCandidates(admin, BASE_ARGS);

    expect(candidates.map((c) => c.name)).toEqual(["Gloomfen Stalker"]);
  });

  it("throws rather than degrading to an unfiltered query when the enabled-sources lookup fails", async () => {
    // A failed fetch and "this campaign enabled nothing" are indistinguishable
    // once the error is dropped, and they mean opposite things.
    fake.failNext("campaign_enabled_sources", { message: "connection reset" });

    await expect(retrieveMonsterCandidates(admin, BASE_ARGS)).rejects.toThrow("connection reset");
  });

  it("throws when the library matcher errors", async () => {
    enable(BASE_ARGS.campaignId, "tob2");
    fake.failNext("match_library_monsters", { message: "operator does not exist" });

    await expect(retrieveMonsterCandidates(admin, BASE_ARGS)).rejects.toThrow(
      /match_library_monsters: operator does not exist/,
    );
  });
});

describe("retrieveMonsterCandidates: #597 campaign scoping", () => {
  it("scopes the custom matcher to the campaign and its owner, with the ruleset and model it was asked about", async () => {
    // The RPC is the one that excludes another campaign's homebrew (asserted
    // against a real Postgres in supabase/tests/monster_retrieval.test.sql);
    // what is provable here is that the ids and filters it needs are the ones sent.
    enable(BASE_ARGS.campaignId, "tob2");

    await retrieveMonsterCandidates(admin, BASE_ARGS);

    expect(rpcArgs.match_custom_monsters[0]).toMatchObject({
      p_campaign_id: BASE_ARGS.campaignId,
      p_owner_id: BASE_ARGS.ownerId,
      p_ruleset: "2014",
      p_embedding_model: "text-embedding-3-small",
    });
    expect(rpcArgs.match_library_monsters[0]).toMatchObject({ p_ruleset: "2014", p_embedding_model: "text-embedding-3-small" });
  });
});

describe("retrieveMonsterCandidates: merging the two corpora", () => {
  it("keeps the DM's own copy when both bestiaries hold the same name", async () => {
    enable(BASE_ARGS.campaignId, "tob2");
    answerRpc("match_custom_monsters", [libRow("Griffon", "2", "monstrosity", "custom-griffon")]);
    answerRpc("match_library_monsters", [libRow("Griffon", "9", "monstrosity", "srd_griffon")]);

    const candidates = await retrieveMonsterCandidates(admin, BASE_ARGS);

    expect(candidates).toEqual([{ id: "custom-griffon", name: "Griffon", cr: "2", type: "monstrosity" }]);
  });

  it("dedupes by name case-insensitively", async () => {
    enable(BASE_ARGS.campaignId, "tob2");
    answerRpc("match_custom_monsters", [libRow("Bone Naga", "4", "undead", "custom-1")]);
    answerRpc("match_library_monsters", [libRow("BONE NAGA", "4", "undead", "lib-1")]);

    const candidates = await retrieveMonsterCandidates(admin, BASE_ARGS);

    expect(candidates.map((c) => c.id)).toEqual(["custom-1"]);
  });

  it("marks an absent challenge rating and type as '?' rather than blank", async () => {
    // A blank field reads to the model as CR zero; a question mark reads as unknown.
    answerRpc("match_custom_monsters", [{ id: "c1", name: "Nameless Thing", monster_type: null, challenge_rating: null }]);

    const [candidate] = await retrieveMonsterCandidates(admin, BASE_ARGS);

    expect(candidate).toMatchObject({ cr: "?", type: "?" });
  });
});

describe("retrieveMonsterCandidates: monsters that have no embedding yet", () => {
  it("appends a custom monster that has no embedding row, so it never silently vanishes", async () => {
    fake.seed("monsters", [homebrew("new-1", "Freshly Written Beast"), homebrew("old-1", "Already Embedded")]);
    // Only `old-1` has been embedded; `new-1` is the DM's newest homebrew.
    fake.seed("monster_embeddings", [{ monster_id: "old-1", embedding_model: BASE_ARGS.embeddingModel }]);
    answerRpc("match_custom_monsters", [libRow("Already Embedded", "1", "beast", "old-1")]);

    const candidates = await retrieveMonsterCandidates(admin, BASE_ARGS);

    expect(candidates.map((c) => c.name)).toEqual(["Already Embedded", "Freshly Written Beast"]);
  });

  it("counts a monster as embedded only for the model being searched with", async () => {
    // An embedding from another model cannot be retrieved with this query vector.
    fake.seed("monsters", [homebrew("m1", "Stale Vector Beast")]);
    fake.seed("monster_embeddings", [{ monster_id: "m1", embedding_model: "some-older-model" }]);

    const candidates = await retrieveMonsterCandidates(admin, BASE_ARGS);

    expect(candidates.map((c) => c.name)).toEqual(["Stale Vector Beast"]);
  });

  it("never appends another account's monster, even one in the same campaign", async () => {
    fake.seed("monsters", [
      homebrew("mine", "My Beast"),
      homebrew("theirs", "Someone Else's Beast", { user_id: OTHER_OWNER }),
    ]);

    const candidates = await retrieveMonsterCandidates(admin, BASE_ARGS);

    expect(candidates.map((c) => c.name)).toEqual(["My Beast"]);
  });

  it("caps the unembedded append at unembeddedCap, keeping the most recently touched", async () => {
    fake.seed(
      "monsters",
      Array.from({ length: 10 }, (_, i) =>
        homebrew(`new-${i}`, `Homebrew ${i}`, { updated_at: `2026-10-${String(20 - i).padStart(2, "0")}T00:00:00Z` })),
    );

    const candidates = await retrieveMonsterCandidates(admin, { ...BASE_ARGS, unembeddedCap: 3 });

    // Recency, not name order: a DM past the cap finds the monster written five minutes ago, not whatever sorts first.
    expect(candidates.map((c) => c.name)).toEqual(["Homebrew 0", "Homebrew 1", "Homebrew 2"]);
  });

  it("places not-yet-embedded homebrew ahead of library rows in the merge", async () => {
    // The dedupe keeps the FIRST occurrence, so ordering decides who wins a
    // name collision.
    enable(BASE_ARGS.campaignId, "tob2");
    fake.seed("monsters", [homebrew("hb-1", "Griffon", { monster_type: "monstrosity", stat_block: { challenge_rating: "2" } })]);
    answerRpc("match_library_monsters", [libRow("Griffon", "9", "monstrosity", "srd_griffon")]);

    const candidates = await retrieveMonsterCandidates(admin, BASE_ARGS);

    expect(candidates).toEqual([{ id: "hb-1", name: "Griffon", cr: "2", type: "monstrosity" }]);
  });
});
