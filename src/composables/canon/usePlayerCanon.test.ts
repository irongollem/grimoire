import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { createPinia, setActivePinia } from "pinia";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
vi.mock("@/lib/supabase", () => ({ supabase: fake.client }));

import { filterPlayerWorld, groupPlayerWorld, isPassageNew, knownWithLabel, usePlayerCanon, type PlayerCanonEntry, type PlayerLorePassage } from "./usePlayerCanon";
import { useCampaignStore } from "@/stores/campaign";
import { useAppUiStore } from "@/stores/ui/app";

const entry = (over: Partial<PlayerCanonEntry>): PlayerCanonEntry => ({
  id: "e", part: "truth", premise_kind: null, knowledge: "all", title: "t", body: null, sort_order: 0, image_url: null,
  created_at: "2026-11-01T10:00:00Z", updated_at: "2026-11-01T10:00:00Z", lore_kind: null, world_year: null, world_month: null,
  world_day: null, party_member_id: null, ...over,
});
const passage = (over: Partial<PlayerLorePassage>): PlayerLorePassage => ({
  id: "p", entry_id: "l1", sort_order: 0, title: "I", body: null, told_at: null, by_dm: true, written_at: "2026-11-01T10:00:00Z", ...over,
});

describe("groupPlayerWorld", () => {
  it("keeps what only this player knows apart from what the table knows", () => {
    const world = groupPlayerWorld(
      [
        entry({ id: "all", knowledge: "all", title: "Known to all" }),
        entry({ id: "mine", knowledge: "some", title: "Only mine" }),
        entry({ id: "sec", part: "secret", knowledge: null }),
      ],
      [],
    );
    expect(world.known.map((e) => e.id)).toEqual(["all"]);
    expect(world.onlyMine.map((e) => e.id)).toEqual(["mine"]);
    expect(world.lore).toEqual([]);
  });

  it("orders lore by its date in the world with undated last, and passages by their order under their entry", () => {
    const world = groupPlayerWorld(
      [
        entry({ id: "undated", part: "lore", knowledge: null, sort_order: 0 }),
        entry({ id: "late", part: "lore", knowledge: null, world_year: 410 }),
        entry({ id: "early", part: "lore", knowledge: null, world_year: 12 }),
      ],
      [
        passage({ id: "b", entry_id: "early", sort_order: 2 }),
        passage({ id: "a", entry_id: "early", sort_order: 1 }),
        passage({ id: "z", entry_id: "late", sort_order: 1 }),
      ],
    );
    expect(world.lore.map((l) => l.entry.id)).toEqual(["early", "late", "undated"]);
    expect(world.lore[0].passages.map((p) => p.id)).toEqual(["a", "b"]);
    expect(world.lore[2].passages).toEqual([]);
  });

  it("dates an entry by its newest passage told to this player, else by the entry itself", () => {
    const world = groupPlayerWorld(
      [entry({ id: "l1", part: "lore", knowledge: null }), entry({ id: "l2", part: "lore", knowledge: null, created_at: "2026-10-01T00:00:00Z" })],
      [
        passage({ id: "a", entry_id: "l1", told_at: "2026-11-02T10:00:00Z" }),
        passage({ id: "b", entry_id: "l1", sort_order: 1, told_at: "2026-11-09T10:00:00Z" }),
        passage({ id: "first", entry_id: "l2", told_at: null }),
      ],
    );
    expect(world.lore.find((l) => l.entry.id === "l1")?.latestAt).toBe("2026-11-09T10:00:00Z");
    expect(world.lore.find((l) => l.entry.id === "l2")?.latestAt).toBe("2026-10-01T00:00:00Z");
  });
});

describe("groupPlayerWorld: who knows a truth (#1258 item 14)", () => {
  // Bug caught: every truth marked "some" stayed under "Only you know", so a player who shared it with Mira was told
  // it was theirs alone. A truth nobody else knows (empty, null or absent known_with) stays there.
  it("keeps a truth under Only you know until another character shares it", () => {
    const world = groupPlayerWorld(
      [
        entry({ id: "alone", knowledge: "some", known_with: [] }),
        entry({ id: "absent", knowledge: "some" }),
        entry({ id: "nulled", knowledge: "some", known_with: null }),
        entry({ id: "shared", knowledge: "some", known_with: ["Mira"] }),
        entry({ id: "all", knowledge: "all" }),
      ],
      [],
    );
    expect(world.onlyMine.map((e) => e.id)).toEqual(["alone", "absent", "nulled"]);
    expect(world.known.map((e) => e.id)).toEqual(["shared", "all"]);
  });

  // Bug caught: the sentence read "You and Bram, Mira know" or dropped a name; one name takes "and", more join with commas.
  it.each([
    [["Mira"], "You and Mira know"],
    [["Bram", "Mira"], "You, Bram and Mira know"],
    [["Bram", "Jo", "Mira"], "You, Bram, Jo and Mira know"],
  ])("says who knows it for %j", (names, words) => {
    expect(knownWithLabel(entry({ knowledge: "some", known_with: names }))).toBe(words);
  });

  // Bug caught: a truth known to all, or one shared with nobody, wore a "You and … know" line.
  it("says nothing for a truth known to all or one only the player knows", () => {
    expect(knownWithLabel(entry({ knowledge: "all", known_with: ["Mira"] }))).toBeNull();
    expect(knownWithLabel(entry({ knowledge: "some", known_with: [] }))).toBeNull();
  });
});

describe("groupPlayerWorld: shared premise and revealed secrets", () => {
  // Bug caught (#1255): the grouping dropped every secret row, so a secret the DM revealed ("shows on every player's
  // screen") never reached any player.
  it("lists a revealed secret and drops an entry of any other unknown part", () => {
    const world = groupPlayerWorld(
      [
        entry({ id: "s2", part: "secret", knowledge: null, sort_order: 2 }),
        entry({ id: "s1", part: "secret", knowledge: null, sort_order: 1 }),
        entry({ id: "odd", part: "mystery", knowledge: null }),
      ],
      [],
    );
    expect(world.revealed.map((e) => e.id)).toEqual(["s1", "s2"]);
    expect(world.known).toEqual([]);
    expect(world.onlyMine).toEqual([]);
    expect(world.premise).toEqual([]);
  });

  // Bug caught (#1258 item 13): a secret made a truth stayed under "Secrets revealed" beside the truth, so the player read
  // the same words twice. A secret whose truth the player cannot see (or that never became one) stays listed.
  it("leaves out a revealed secret that became a truth the player can read", () => {
    const world = groupPlayerWorld(
      [
        entry({ id: "t1", knowledge: "all" }),
        entry({ id: "s1", part: "secret", knowledge: null, became_entry_id: "t1" }),
        entry({ id: "s2", part: "secret", knowledge: null, became_entry_id: "hidden-truth" }),
        entry({ id: "s3", part: "secret", knowledge: null, became_entry_id: null }),
      ],
      [],
    );
    expect(world.revealed.map((e) => e.id)).toEqual(["s2", "s3"]);
    expect(world.known.map((e) => e.id)).toEqual(["t1"]);
  });

  // Bug caught (#1255): shared premise rows dropped, or listed in arrival order instead of the campaign page's kind
  // order (pitch, theme, table, line, veil) with the DM's order inside a kind.
  it("lists shared premise in kind order, then the DM's order, and never voice or look", () => {
    const p = (id: string, premise_kind: PlayerCanonEntry["premise_kind"], sort_order = 0) =>
      entry({ id, part: "premise", premise_kind, knowledge: null, sort_order });
    const world = groupPlayerWorld(
      [p("veil", "veil"), p("t2", "theme", 2), p("voice", "voice"), p("line", "line"), p("t1", "theme", 1), p("pitch", "pitch"), p("table", "table"), p("look", "look")],
      [],
    );
    expect(world.premise.map((e) => e.id)).toEqual(["pitch", "t1", "t2", "table", "line", "veil"]);
  });
});

describe("groupPlayerWorld: backstories", () => {
  const backstory = entry({ id: "b1", part: "backstory", knowledge: null, party_member_id: "m1" });

  // Bug caught: a backstory's passages read as lore (shown under "Found out") or in the DM's sort order instead of the
  // order the story grew.
  it("keeps a backstory out of the lore and lists its passages in the order they were written", () => {
    const world = groupPlayerWorld(
      [backstory],
      [
        passage({ id: "later", entry_id: "b1", sort_order: 0, written_at: "2026-11-09T10:00:00Z", told_at: "2026-11-09T10:00:00Z" }),
        passage({ id: "first", entry_id: "b1", sort_order: 5, written_at: "2026-11-02T10:00:00Z", told_at: "2026-11-02T10:00:00Z" }),
      ],
    );
    expect(world.lore).toEqual([]);
    expect(world.backstories).toHaveLength(1);
    expect(world.backstories[0]?.memberId).toBe("m1");
    expect(world.backstories[0]?.passages.map((p) => p.id)).toEqual(["first", "later"]);
  });

  // Bug caught: a backstory passage with no told time (the DM's, untold) shown like lore's free first passage, so the
  // player read what the DM had not told them.
  it("never lists a backstory passage that was not told", () => {
    const world = groupPlayerWorld(
      [backstory],
      [passage({ id: "told", entry_id: "b1", told_at: "2026-11-05T10:00:00Z" }), passage({ id: "untold", entry_id: "b1", told_at: null })],
    );
    expect(world.backstories[0]?.passages.map((p) => p.id)).toEqual(["told"]);
  });

  // Bug caught: the player's own passages lit their own "New" dot, so writing a passage told them there was news.
  it("dates the DM's last telling from the DM's passages only", () => {
    const world = groupPlayerWorld(
      [backstory],
      [
        passage({ id: "mine", entry_id: "b1", by_dm: false, told_at: "2026-11-20T10:00:00Z" }),
        passage({ id: "dm1", entry_id: "b1", by_dm: true, told_at: "2026-11-05T10:00:00Z" }),
        passage({ id: "dm2", entry_id: "b1", by_dm: true, told_at: "2026-11-08T10:00:00Z" }),
      ],
    );
    expect(world.backstories[0]?.latestDmAt).toBe("2026-11-08T10:00:00Z");
    expect(groupPlayerWorld([backstory], [passage({ id: "mine", entry_id: "b1", by_dm: false, told_at: "2026-11-20T10:00:00Z" })]).backstories[0]?.latestDmAt).toBeNull();
  });
});

describe("isPassageNew", () => {
  const visit = new Date("2026-11-05T00:00:00Z");
  it("marks a passage told after the last visit and not one told before it", () => {
    expect(isPassageNew("2026-11-09T10:00:00Z", visit)).toBe(true);
    expect(isPassageNew("2026-11-02T10:00:00Z", visit)).toBe(false);
  });
  it("marks nothing inside an entry the player has never opened, or a passage with no told time", () => {
    expect(isPassageNew("2026-11-09T10:00:00Z", null)).toBe(false);
    expect(isPassageNew(null, visit)).toBe(false);
  });
});

describe("usePlayerCanon", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    fake.reset();
    useCampaignStore().activeCampaignId = "c1";
  });

  function run() {
    let result!: ReturnType<typeof usePlayerCanon>;
    const Host = defineComponent({
      setup() {
        result = usePlayerCanon();
        return () => h("div");
      },
    });
    mount(Host, { global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }]] } });
    return result;
  }

  // The server answers by who is looking, so each read must name the previewed member (or nobody) in both calls.
  function answerFor(memberId: string | null) {
    const ok = (args: Record<string, unknown>) => args.p_campaign_id === "c1" && args.p_preview_member_id === memberId;
    fake.onRpc("get_player_canon", (args) => (ok(args) ? [entry({ id: "t", title: "Heard" })] : []));
    fake.onRpc("get_player_lore_passages", (args) => (ok(args) ? [passage({ id: "p1" })] : []));
  }

  it("a DM previewing a member reads what that member was told, in both reads", async () => {
    const app = useAppUiStore();
    app.dmPreviewMode = true;
    app.dmPreviewPartyMemberId = "pm-9";
    answerFor("pm-9");
    const q = run();
    await flushPromises();
    expect(q.world.value?.known.map((e) => e.id)).toEqual(["t"]);
  });

  it("a real player reads as themself: no member is named", async () => {
    answerFor(null);
    const q = run();
    await flushPromises();
    expect(q.world.value?.known.map((e) => e.id)).toEqual(["t"]);
  });

  it("surfaces a failed read as an error, not as an empty world", async () => {
    fake.failNext("get_player_canon", { message: "boom" });
    fake.onRpc("get_player_canon", () => []);
    fake.onRpc("get_player_lore_passages", () => []);
    const q = run();
    await flushPromises();
    expect(q.error.value).toBeTruthy();
    expect(q.world.value).toBeUndefined();
  });
});

describe("filterPlayerWorld", () => {
  const tt = (text: string) => JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
  const world = groupPlayerWorld(
    [
      entry({ id: "a", title: "The river gives back", body: tt("salt and bone") }),
      entry({ id: "b", title: "Magic leaves a taste" }),
      entry({ id: "l1", part: "lore", knowledge: null, title: "The Guild" }),
    ],
    [passage({ id: "p1", entry_id: "l1", title: "The ferry", body: tt("Mira rowed") })],
  );

  // Bug caught (#1279 item 28): the filter ignored the text (title only), or matched on the raw JSON of the body.
  it("matches titles and the plain text of the body, every word, case blind", () => {
    expect(filterPlayerWorld(world, "SALT bone").known.map((e) => e.id)).toEqual(["a"]);
    expect(filterPlayerWorld(world, "doc paragraph").known).toEqual([]);
    // One word of two present is not a match.
    expect(filterPlayerWorld(world, "river taste").known).toEqual([]);
  });

  // Bug caught: lore found only by its own title, so a passage's words could not be searched.
  it("finds a lore entry through the passages the player was told", () => {
    expect(filterPlayerWorld(world, "mira").lore.map((l) => l.entry.id)).toEqual(["l1"]);
  });

  it("returns the world untouched for an empty query", () => {
    expect(filterPlayerWorld(world, "  ")).toBe(world);
  });
});
