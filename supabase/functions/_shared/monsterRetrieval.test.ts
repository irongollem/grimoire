import { describe, expect, it, vi } from "vitest";
import { retrieveMonsterCandidates } from "./monsterRetrieval";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Caller-side half of the #595 retrieval guarantees. The SQL half — that the
 * enabled-sources and ruleset gates are WHERE predicates applied before the
 * similarity ranking — is asserted against a real Postgres in
 * `supabase/tests/monster_retrieval.test.sql`, because it is a property of the
 * query plan and no mock can prove it.
 *
 * What is provable here is everything the RPCs cannot defend on their own:
 * which slugs get handed to them, that the library RPC is not called at all
 * when a campaign has enabled nothing (an empty `source_slugs` array is one
 * loosened predicate away from matching every book ever published), the
 * homebrew-first merge order, and that a DB error is never silently read as
 * "this campaign has no sources".
 */

interface Result { data?: unknown; error?: { message: string } | null }

/**
 * Chainable stand-in for a supabase-js query builder. Every builder method
 * returns the same object and the object is thenable, so any chain length —
 * `.select().eq().or().or().order().limit()` — resolves to the same canned
 * result. That keeps these tests from asserting on the exact builder calls,
 * which are an implementation detail; the assertions below are about the RPC
 * arguments and the returned candidates.
 */
function queryBuilder(result: Result) {
  // The builder IS a real promise with the chain methods hung off it, rather
  // than an object carrying a hand-written `then`. supabase-js builders are
  // awaited at an arbitrary point in the chain, so the stand-in has to be
  // awaitable at every point — and a genuine Promise gets that for free
  // without hand-rolling thenable semantics.
  const chain = Promise.resolve({
    data: result.data ?? null,
    error: result.error ?? null,
  }) as Promise<Result> & Record<string, unknown>;
  for (const method of ["select", "eq", "or", "in", "order", "limit", "neq", "filter"]) {
    chain[method] = vi.fn(() => chain);
  }
  return chain;
}

function makeClient(opts: {
  tables?: Record<string, Result>;
  rpcs?: Record<string, Result>;
}) {
  const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
  const client = {
    from: vi.fn((table: string) => queryBuilder(opts.tables?.[table] ?? { data: [] })),
    rpc: vi.fn((name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      const result = opts.rpcs?.[name] ?? { data: [] };
      if (result.error) return Promise.resolve({ data: null, error: result.error });
      return Promise.resolve({ data: result.data ?? [], error: null });
    }),
  };
  return { client: client as unknown as SupabaseClient, rpcCalls };
}

const BASE_ARGS = {
  queryVector: "[0.1,0.2]",
  ownerId: "11111111-1111-4111-8111-111111111111",
  campaignId: "22222222-2222-4222-8222-222222222222",
  ruleset: "2014",
  embeddingModel: "text-embedding-3-small",
  perSide: 15,
  unembeddedCap: 25,
};

const libRow = (name: string, cr = "3", type = "undead", id = name.toLowerCase()) =>
  ({ id, name, monster_type: type, challenge_rating: cr });

describe("retrieveMonsterCandidates — the enabled-sources boundary", () => {
  it("hands the campaign's enabled slugs to the library matcher", async () => {
    const { client, rpcCalls } = makeClient({
      tables: {
        campaign_enabled_sources: { data: [{ source_slug: "tob2" }, { source_slug: "blackflag" }] },
      },
    });

    await retrieveMonsterCandidates(client, BASE_ARGS);

    const libraryCall = rpcCalls.find((c) => c.name === "match_library_monsters");
    expect(libraryCall?.args.source_slugs).toEqual(["tob2", "blackflag"]);
    expect(libraryCall?.args.p_ruleset).toBe("2014");
    expect(libraryCall?.args.p_embedding_model).toBe("text-embedding-3-small");
  });

  it("does not call the library matcher at all when the campaign has enabled no sources", async () => {
    // Never call it with an empty array and trust the SQL to return nothing: a
    // single loosened predicate on the other side would then match every book
    // in the library rather than none, and that is the licensing failure the
    // gate exists to prevent. Skipping the call makes it unreachable.
    const { client, rpcCalls } = makeClient({
      tables: { campaign_enabled_sources: { data: [] } },
    });

    const candidates = await retrieveMonsterCandidates(client, BASE_ARGS);

    expect(rpcCalls.map((c) => c.name)).not.toContain("match_library_monsters");
    expect(candidates).toEqual([]);
  });

  it("still returns the DM's own homebrew when no sources are enabled", async () => {
    // Custom monsters are the DM's own rows and are not source-gated, so a
    // campaign with zero enabled books must still generate from its homebrew.
    const { client } = makeClient({
      tables: { campaign_enabled_sources: { data: [] } },
      rpcs: { match_custom_monsters: { data: [libRow("Gloomfen Stalker", "6")] } },
    });

    const candidates = await retrieveMonsterCandidates(client, BASE_ARGS);

    expect(candidates.map((c) => c.name)).toEqual(["Gloomfen Stalker"]);
  });

  it("throws rather than degrading to an unfiltered query when the enabled-sources lookup fails", async () => {
    // A failed fetch and "this campaign enabled nothing" are indistinguishable
    // once the error is dropped, and they mean opposite things. Throwing sends
    // the caller to its compact-index fallback with the reason in the logs.
    const { client } = makeClient({
      tables: { campaign_enabled_sources: { error: { message: "connection reset" } } },
    });

    await expect(retrieveMonsterCandidates(client, BASE_ARGS)).rejects.toThrow("connection reset");
  });

  it("throws when the library matcher errors", async () => {
    const { client } = makeClient({
      tables: { campaign_enabled_sources: { data: [{ source_slug: "tob2" }] } },
      rpcs: { match_library_monsters: { error: { message: "operator does not exist" } } },
    });

    await expect(retrieveMonsterCandidates(client, BASE_ARGS)).rejects.toThrow(
      /match_library_monsters: operator does not exist/,
    );
  });
});

describe("retrieveMonsterCandidates — merging the two corpora", () => {
  it("keeps the DM's own copy when both bestiaries hold the same name", async () => {
    const { client } = makeClient({
      tables: { campaign_enabled_sources: { data: [{ source_slug: "tob2" }] } },
      rpcs: {
        match_custom_monsters: { data: [libRow("Griffon", "2", "monstrosity", "custom-griffon")] },
        match_library_monsters: { data: [libRow("Griffon", "9", "monstrosity", "srd_griffon")] },
      },
    });

    const candidates = await retrieveMonsterCandidates(client, BASE_ARGS);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].id).toBe("custom-griffon");
    expect(candidates[0].cr).toBe("2");
  });

  it("dedupes by name case-insensitively", async () => {
    const { client } = makeClient({
      tables: { campaign_enabled_sources: { data: [{ source_slug: "tob2" }] } },
      rpcs: {
        match_custom_monsters: { data: [libRow("Bone Naga", "4", "undead", "custom-1")] },
        match_library_monsters: { data: [libRow("BONE NAGA", "4", "undead", "lib-1")] },
      },
    });

    const candidates = await retrieveMonsterCandidates(client, BASE_ARGS);

    expect(candidates.map((c) => c.id)).toEqual(["custom-1"]);
  });

  it("marks an absent challenge rating as '?' rather than blank", async () => {
    // A blank field reads to the model as CR zero; a question mark reads as
    // unknown, which is what it is.
    const { client } = makeClient({
      tables: { campaign_enabled_sources: { data: [] } },
      rpcs: {
        match_custom_monsters: {
          data: [{ id: "c1", name: "Nameless Thing", monster_type: null, challenge_rating: null }],
        },
      },
    });

    const [candidate] = await retrieveMonsterCandidates(client, BASE_ARGS);

    expect(candidate.cr).toBe("?");
    expect(candidate.type).toBe("?");
  });
});

describe("retrieveMonsterCandidates — monsters that have no embedding yet", () => {
  const recentRows = [
    { id: "new-1", name: "Freshly Written Beast", monster_type: "beast", stat_block: { challenge_rating: "5" } },
    { id: "old-1", name: "Already Embedded", monster_type: "beast", stat_block: { challenge_rating: "1" } },
  ];

  it("appends a custom monster that has no embedding row, so it never silently vanishes", async () => {
    const { client } = makeClient({
      tables: {
        campaign_enabled_sources: { data: [] },
        monsters: { data: recentRows },
        // Only `old-1` has been embedded; `new-1` is the DM's newest homebrew.
        monster_embeddings: { data: [{ monster_id: "old-1" }] },
      },
      rpcs: { match_custom_monsters: { data: [libRow("Already Embedded", "1", "beast", "old-1")] } },
    });

    const candidates = await retrieveMonsterCandidates(client, BASE_ARGS);

    expect(candidates.map((c) => c.name)).toContain("Freshly Written Beast");
  });

  it("does not append a monster that is already embedded and retrieved", async () => {
    const { client } = makeClient({
      tables: {
        campaign_enabled_sources: { data: [] },
        monsters: { data: recentRows },
        monster_embeddings: { data: [{ monster_id: "old-1" }] },
      },
      rpcs: { match_custom_monsters: { data: [libRow("Already Embedded", "1", "beast", "old-1")] } },
    });

    const candidates = await retrieveMonsterCandidates(client, BASE_ARGS);

    expect(candidates.filter((c) => c.name === "Already Embedded")).toHaveLength(1);
  });

  it("caps the unembedded append at unembeddedCap", async () => {
    const many = Array.from({ length: 10 }, (_, i) => ({
      id: `new-${i}`,
      name: `Homebrew ${i}`,
      monster_type: "beast",
      stat_block: { challenge_rating: "1" },
    }));
    const { client } = makeClient({
      tables: {
        campaign_enabled_sources: { data: [] },
        monsters: { data: many },
        monster_embeddings: { data: [] },
      },
    });

    const candidates = await retrieveMonsterCandidates(client, { ...BASE_ARGS, unembeddedCap: 3 });

    expect(candidates).toHaveLength(3);
    // The `monsters` query orders by updated_at descending, so the cap keeps the
    // most recently touched homebrew rather than whatever sorts first by name.
    expect(candidates.map((c) => c.name)).toEqual(["Homebrew 0", "Homebrew 1", "Homebrew 2"]);
  });

  it("places not-yet-embedded homebrew ahead of library rows in the merge", async () => {
    // The dedupe keeps the FIRST occurrence, so ordering decides who wins a
    // name collision. Appending the unembedded homebrew last would hand a
    // shared name to the library copy and drop the DM's own monster.
    const { client } = makeClient({
      tables: {
        campaign_enabled_sources: { data: [{ source_slug: "tob2" }] },
        monsters: {
          data: [{ id: "hb-1", name: "Griffon", monster_type: "monstrosity", stat_block: { challenge_rating: "2" } }],
        },
        monster_embeddings: { data: [] },
      },
      rpcs: { match_library_monsters: { data: [libRow("Griffon", "9", "monstrosity", "srd_griffon")] } },
    });

    const candidates = await retrieveMonsterCandidates(client, BASE_ARGS);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].id).toBe("hb-1");
  });
});
