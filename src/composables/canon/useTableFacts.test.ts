import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
vi.mock("@/lib/supabase", () => ({ supabase: fake.client, getCurrentUser: () => ({ id: "dm-1" }) }));
vi.mock("./queueCanonEmbedding", () => ({ queueCanonEmbedding: vi.fn() }));

import { useCampaignStore } from "@/stores/campaign";
import { makeFactATruth, reviewFact } from "./useTableFacts";
import { keepPatch, strikePatch, undoStrikePatch } from "@/lib/canon/canonTableFacts";
import type { StoryFact } from "@/lib/table/solo/storyRecord";

const row = (id: string, over: Record<string, unknown> = {}) => ({
  id, campaign_id: "c1", session_id: null, body: "The ferry takes a sentence", known_to_player: true, supersedes_id: null, source: "table",
  kept_at: null, struck_at: null, created_at: "2026-11-10T10:00:00Z", ...over,
});

beforeEach(() => {
  fake.reset();
  setActivePinia(createPinia());
  useCampaignStore().activeCampaignId = "c1";
});

describe("reviewFact", () => {
  // Bug caught: a Strike RLS refused (no error, no row) reported as done, so the fact still read as true at the table.
  it("fails when no row changed", async () => {
    await expect(reviewFact("missing", strikePatch())).rejects.toThrow(/gone/);
  });

  // Bug caught: the write reaching another campaign's fact with the same id, or a fact left both kept and struck.
  it("stamps only this campaign's fact, and a strike clears an earlier keep", async () => {
    fake.seed("story_facts", [row("a", { kept_at: "2026-11-11T10:00:00Z" }), row("a", { campaign_id: "c2" })]);
    await reviewFact("a", strikePatch());
    const [mine, other] = fake.rows("story_facts");
    expect(mine).toMatchObject({ kept_at: null });
    expect(mine!["struck_at"]).not.toBeNull();
    expect(other).toMatchObject({ struck_at: null });
  });

  // Bug caught: Undo leaving the line struck.
  it("undoes a strike", async () => {
    fake.seed("story_facts", [row("a", { struck_at: "2026-11-11T10:00:00Z" })]);
    await reviewFact("a", undoStrikePatch(null));
    expect(fake.rows("story_facts")[0]).toMatchObject({ struck_at: null, kept_at: null });
  });

  it("keeps a fact", async () => {
    fake.seed("story_facts", [row("a")]);
    await reviewFact("a", keepPatch());
    expect(fake.rows("story_facts")[0]!["kept_at"]).not.toBeNull();
  });
});

describe("makeFactATruth", () => {
  const asFact = (r: ReturnType<typeof row>) => r as unknown as StoryFact;

  // Bug caught: the truth filed with the wrong mark (a told fact secret, or a hidden one known to all), or the fact left new.
  it("files a truth marked by whether the party knows it, then keeps the fact", async () => {
    fake.seed("story_facts", [row("told"), row("hidden", { known_to_player: false, body: "Bells ring backwards" })]);
    await makeFactATruth(asFact(row("told")), 0);
    await makeFactATruth(asFact(row("hidden", { known_to_player: false, body: "Bells ring backwards" })), 1);
    expect(fake.rows("canon_entries")).toMatchObject([
      { part: "truth", knowledge: "all", title: "The ferry takes a sentence", campaign_id: "c1" },
      { part: "truth", knowledge: "secret", title: "Bells ring backwards" },
    ]);
    expect(fake.rows("story_facts").every((r) => r["kept_at"] !== null)).toBe(true);
  });

  // Bug caught: a fact kept with no truth behind it when the truth could not be written.
  it("leaves the fact unreviewed when the truth could not be made", async () => {
    fake.seed("story_facts", [row("a")]);
    fake.failNext("canon_entries", { message: "boom" });
    await expect(makeFactATruth(asFact(row("a")), 0)).rejects.toMatchObject({ message: "boom" });
    expect(fake.rows("story_facts")[0]!["kept_at"]).toBeNull();
  });
});
