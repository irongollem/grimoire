import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseFake } from "@/test/supabaseFake";
import { canonStore } from "./canonIo";

const doc = (...content: unknown[]) => JSON.stringify({ type: "doc", content });
const para = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });

function store(fake: ReturnType<typeof createSupabaseFake>) {
  const client = fake.client as unknown as SupabaseClient;
  return canonStore({ supabase: client, admin: client, embedQuery: async () => ({ vector: [0.1], model: "m" }) });
}

describe("canonStore.previously", () => {
  // Bug caught: the newest NOTE won, so a chronicle written late for an earlier sitting became "the last sitting".
  it("takes the chronicle of the latest sitting, not the note written last", async () => {
    const fake = createSupabaseFake();
    fake.seed("campaign_sessions", [
      { id: "s1", campaign_id: "c1", number: 1, started_at: "2026-10-01T18:00:00Z", played_on: null, created_at: "2026-10-01T18:00:00Z" },
      { id: "s2", campaign_id: "c1", number: 2, started_at: "2026-10-08T18:00:00Z", played_on: null, created_at: "2026-10-08T18:00:00Z" },
      { id: "s3", campaign_id: "c1", number: 3, started_at: "2026-10-15T18:00:00Z", played_on: null, created_at: "2026-10-15T18:00:00Z" },
    ]);
    fake.seed("notes", [
      { id: "n2", campaign_id: "c1", session_id: "s2", content: "Second sitting.", created_at: "2026-10-09T10:00:00Z" },
      { id: "n1", campaign_id: "c1", session_id: "s1", content: "First sitting, written late.", created_at: "2026-11-19T10:00:00Z" },
      { id: "n3", campaign_id: "c1", session_id: "s3", content: "Running one.", created_at: "2026-10-16T10:00:00Z" },
    ]);
    expect(await store(fake).previously("c1", "s3")).toBe("Second sitting.");
  });
});

describe("canonStore.lookup", () => {
  const seedTruth = (fake: ReturnType<typeof createSupabaseFake>, body: string | null = null) => {
    fake.onRpc("match_campaign_canon", () => [{ id: "e1", part: "truth", knowledge: "some", title: "The ferryman is dead", distance: 0.1 }]);
    fake.seed("canon_entries", [{ id: "e1", campaign_id: "c1", body, wants: null }]);
  };

  // Bug caught: a truth known only to a player character came back with no knowers and read "known to all".
  it("names a party member who knows a truth, and never calls it known to all", async () => {
    const fake = createSupabaseFake();
    seedTruth(fake);
    fake.seed("party_members", [{ id: "pm1", campaign_id: "c1", name: "Wren" }]);
    fake.seed("world_links", [{ campaign_id: "c1", from_kind: "canon", type: "known_to", from_canon_entry_id: "e1", to_kind: "party_member", to_party_member_id: "pm1" }]);
    const [entry] = (await store(fake).lookup("c1", "ferry")) ?? [];
    expect(entry.knownTo).toEqual(["Wren"]);
  });

  // Bug caught: a 'some' truth with nobody resolved carried the all-knowing label.
  it("never labels a some-know truth as known to all, even with no knower resolved", async () => {
    const fake = createSupabaseFake();
    seedTruth(fake);
    const [entry] = (await store(fake).lookup("c1", "ferry")) ?? [];
    expect(entry.knowledge).toBe("some");
  });

  // Bug caught: the Narrator's lookup answer carried the text of a DM-only secret block.
  it("leaves a DM-only secret block out of an entry's text", async () => {
    const fake = createSupabaseFake();
    seedTruth(fake, doc(para("Told openly."), { type: "secretBlock", content: [para("SECRET-TEXT")] }));
    const [entry] = (await store(fake).lookup("c1", "ferry")) ?? [];
    expect(entry.text).toContain("Told openly.");
    expect(entry.text).not.toContain("SECRET-TEXT");
  });
});

describe("canonStore.lookup: a backstory", () => {
  const backstory = () => {
    const fake = createSupabaseFake();
    // An empty title: a backstory has none of its own.
    fake.onRpc("match_campaign_canon", () => [{ id: "b1", part: "backstory", knowledge: null, title: "", distance: 0.1 }]);
    fake.seed("canon_entries", [{ id: "b1", campaign_id: "c1", body: null, wants: null, party_member_id: "pm1" }]);
    fake.seed("party_members", [{ id: "pm1", campaign_id: "c1", name: "Tansy Underbough" }]);
    return fake;
  };

  // Bug caught: the answer headed by the entry's empty title, so the Narrator read a past with nobody's name on it.
  it("answers under the character's name, with the passages' text", async () => {
    const fake = backstory();
    fake.seed("canon_lore_passages", [{ entry_id: "b1", campaign_id: "c1", title: "The coin", body: doc(para("A ferryman gave her a coin.")), sort_order: 0 }]);
    const [entry] = (await store(fake).lookup("c1", "her brother")) ?? [];
    expect(entry?.part).toBe("backstory");
    expect(entry?.title).toBe("Tansy Underbough");
    expect(entry?.text).toContain("The coin: A ferryman gave her a coin.");
  });

  // Bug caught: passages read only for lore, so a backstory's text never reached the Narrator; or read without stripping the DM's secret block.
  it("strips a DM-only secret block out of a passage, and ignores another campaign's passages", async () => {
    const fake = backstory();
    fake.seed("canon_lore_passages", [
      { entry_id: "b1", campaign_id: "c1", title: "Truth", body: doc(para("Told openly."), { type: "secretBlock", content: [para("SECRET-TEXT")] }), sort_order: 0 },
      { entry_id: "b1", campaign_id: "c2", title: "Elsewhere", body: doc(para("OTHER-CAMPAIGN")), sort_order: 1 },
    ]);
    const [entry] = (await store(fake).lookup("c1", "her brother")) ?? [];
    expect(entry?.text).toContain("Told openly.");
    expect(entry?.text).not.toContain("SECRET-TEXT");
    expect(entry?.text).not.toContain("OTHER-CAMPAIGN");
  });
});


describe("canonStore.here: passages on offer", () => {
  const seed = () => {
    const fake = createSupabaseFake();
    fake.seed("party_members", [{ id: "pm1", campaign_id: "c1", name: "Wren" }, { id: "pm2", campaign_id: "c1", name: "Tansy" }]);
    fake.seed("canon_entries", [
      { id: "shared", campaign_id: "c1", part: "lore", player_visible_to: ["pm1", "pm2"] },
      { id: "half", campaign_id: "c1", part: "lore", player_visible_to: ["pm1"] },
      { id: "past", campaign_id: "c1", part: "backstory", party_member_id: "pm1", player_visible_to: [] },
    ]);
    const base = { campaign_id: "c1", told_at: null, location_id: "l1", body: "{}" };
    fake.seed("canon_lore_passages", [
      { ...base, id: "s-first", entry_id: "shared", title: "First", sort_order: 0, created_at: "2026-01-01" },
      { ...base, id: "s-second", entry_id: "shared", title: "Second", sort_order: 1, created_at: "2026-01-02" },
      { ...base, id: "h-first", entry_id: "half", title: "HalfFirst", sort_order: 0, created_at: "2026-01-01" },
      { ...base, id: "h-second", entry_id: "half", title: "HalfSecond", sort_order: 1, created_at: "2026-01-02" },
      { ...base, id: "b-first", entry_id: "past", title: "Past", sort_order: 0, created_at: "2026-01-01" },
    ]);
    return fake;
  };

  // Bug caught: a lore entry's first passage (told with the entry), or one of an entry not shared with the whole party, was offered.
  it("offers only a later passage of a fully shared lore entry, and a backstory's passage", async () => {
    const here = await store(seed()).here("c1", "l1", []);
    expect(here.passages.map((p) => p.id).sort()).toEqual(["b-first", "s-second"]);
  });
});

describe("canonStore.bringOut: who a passage is told to", () => {
  const seed = () => {
    const fake = createSupabaseFake();
    fake.seed("party_members", [{ id: "pm1", campaign_id: "c1", name: "Wren" }, { id: "pm2", campaign_id: "c1", name: "Tansy" }]);
    fake.seed("canon_entries", [
      { id: "lore", campaign_id: "c1", part: "lore" },
      { id: "past", campaign_id: "c1", part: "backstory", party_member_id: "pm1" },
    ]);
    fake.seed("canon_lore_passages", [
      { id: "lp", entry_id: "lore", campaign_id: "c1", told_at: null, player_visible_to: [] },
      { id: "bp", entry_id: "past", campaign_id: "c1", told_at: null, player_visible_to: [] },
    ]);
    return fake;
  };
  const told = (fake: ReturnType<typeof createSupabaseFake>, id: string) =>
    (fake.rows("canon_lore_passages").find((r) => r.id === id) as { player_visible_to: string[] }).player_visible_to;

  // Bug caught: a backstory passage was told to every party member, leaking one player's past to the table.
  it("tells a backstory passage only to its own character", async () => {
    const fake = seed();
    await store(fake).bringOut({ campaignId: "c1", campaignSessionId: null }, { kind: "passage", id: "bp" });
    expect(told(fake, "bp")).toEqual(["pm1"]);
  });

  it("tells a lore passage to the whole party", async () => {
    const fake = seed();
    await store(fake).bringOut({ campaignId: "c1", campaignSessionId: null }, { kind: "passage", id: "lp" });
    expect(told(fake, "lp").sort()).toEqual(["pm1", "pm2"]);
  });
});

describe("canonStore: an answered question or an ended force is no longer open (#1255)", () => {
  const seed = () => {
    const fake = createSupabaseFake();
    fake.seed("canon_entries", [
      { id: "q-open", campaign_id: "c1", part: "question", title: "Who made the Stain?", sort_order: 0, closed_as: null },
      { id: "q-done", campaign_id: "c1", part: "question", title: "Who built the mill?", sort_order: 1, closed_as: "answered", closed_note: "The guild did." },
      { id: "f-live", campaign_id: "c1", part: "force", title: "The Brewlings", sort_order: 0, closed_as: null },
      { id: "f-over", campaign_id: "c1", part: "force", title: "The Old Guild", sort_order: 1, closed_as: "stopped" },
    ]);
    return fake;
  };

  // Bug caught: every question was kept open for the Narrator, so it would not mention what the DM had already answered.
  it("tells the Narrator only the questions still open", async () => {
    const here = await store(seed()).here("c1", null, []);
    expect(here.questions).toEqual(["Who made the Stain?"]);
  });

  // Bug caught: the invention check refused an invention for "answering" a question the DM had already answered.
  it("holds an invention against only the questions still open", async () => {
    const material = await store(seed()).material("c1");
    expect(material.questions).toEqual(["Who made the Stain?"]);
  });

  // Bug caught: a force that had stopped was shown as one that moved here.
  it("leaves an ended force out of the forces that moved here", async () => {
    const fake = seed();
    fake.seed("world_links", [
      { campaign_id: "c1", from_kind: "canon", type: "took_place_at", from_canon_entry_id: "f-live", to_kind: "location", to_location_id: "l1" },
      { campaign_id: "c1", from_kind: "canon", type: "took_place_at", from_canon_entry_id: "f-over", to_kind: "location", to_location_id: "l1" },
    ]);
    const here = await store(fake).here("c1", "l1", []);
    expect(here.forces.map((f) => f.title)).toEqual(["The Brewlings"]);
  });

  // Bug caught: a lookup hit carried no sign of how it ended, so an answered question read as open.
  it("hands the lookup how a question or force ended", async () => {
    const fake = seed();
    fake.onRpc("match_campaign_canon", () => [{ id: "q-done", part: "question", knowledge: null, title: "Who built the mill?", distance: 0.1 }]);
    const [entry] = (await store(fake).lookup("c1", "mill")) ?? [];
    expect(entry).toMatchObject({ closedAs: "answered", closedNote: "The guild did." });
  });
});
