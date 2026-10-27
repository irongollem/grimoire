import { flushPromises, mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, ref } from "vue";
import { useAuthStore } from "@/stores/auth";
import { useCampaignStore } from "@/stores/campaign";
import type { EntityNote } from "@/types/faction.types";
import type { PlayerJournalEntry } from "./usePlayerJournal";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
vi.mock("@/lib/supabase", () => ({ supabase: fake.client, getCurrentUser: () => null }));
vi.mock("./usePlayerJournal", () => ({ useMyJournalEntries: () => ({ data: ref([]), isLoading: ref(false) }) }));

import { excerptOf, mergeRecentNotes, useMyRecentNotes } from "./useMyRecentNotes";

const doc = (text: string) =>
  JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: text ? [{ type: "text", text }] : undefined }] });

function en(o: Partial<EntityNote>): EntityNote {
  return {
    id: "e1",
    user_id: "me",
    campaign_id: "c",
    entity_type: "npc",
    entity_id: "n1",
    content: doc("Owes us a favour"),
    is_private: true,
    shared_with_dm: false, written_as_dm: false,
    created_at: "2026-10-01",
    updated_at: "2026-10-01",
    ...o,
  };
}
function je(o: Partial<PlayerJournalEntry>): PlayerJournalEntry {
  return {
    id: "j1",
    user_id: "me",
    campaign_id: "c",
    title: "Session recap",
    content: doc("We fled the mine"),
    category: "session",
    tags: [],
    is_private: false,
    shared_with_dm: false, written_as_dm: false,
    ref_type: null,
    ref_id: null,
    ref_label: null,
    sort_order: null,
    created_at: "2026-10-01",
    updated_at: "2026-10-01",
    ...o,
  } as PlayerJournalEntry;
}

describe("excerptOf", () => {
  it("keeps short text and cuts long text on a word boundary", () => {
    expect(excerptOf(doc("short"))).toBe("short");
    const out = excerptOf(doc("word ".repeat(60)), 120);
    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(121);
    expect(out).not.toMatch(/wor…$/);
  });
});

describe("excerptOf boundaries", () => {
  it("leaves text of exactly the maximum length whole, with no ellipsis", () => {
    const exact = "a".repeat(120);
    expect(excerptOf(doc(exact), 120)).toBe(exact);
  });

  it("cuts back to the last word when it falls in the second half, and hard-cuts when the only break is early", () => {
    expect(excerptOf(doc(`${"a".repeat(70)} ${"b".repeat(100)}`), 120)).toBe(`${"a".repeat(70)}…`);
    expect(excerptOf(doc(`${"a".repeat(30)} ${"b".repeat(200)}`), 120)).toBe(`${"a".repeat(30)} ${"b".repeat(89)}…`);
  });
});

describe("mergeRecentNotes", () => {
  it("merges both sources newest first and limits", () => {
    const out = mergeRecentNotes(
      [en({ id: "e1", updated_at: "2026-10-03" }), en({ id: "e2", updated_at: "2026-10-01" })],
      [je({ id: "j1", updated_at: "2026-10-02" })],
      2,
    );
    expect(out.map((n) => n.id)).toEqual(["e1", "j1"]);
  });

  it("carries the subject of an entity note as a type and id for the row to resolve, never a name", () => {
    const [npc, member, odd] = mergeRecentNotes(
      [
        en({ id: "a", updated_at: "2026-10-03" }),
        en({ id: "b", entity_type: "party_member", entity_id: "pm1", updated_at: "2026-10-02" }),
        en({ id: "c", entity_type: "dragon", entity_id: "d1", updated_at: "2026-10-01" }),
      ],
      [],
      5,
    );
    expect(npc).toMatchObject({ source: "entity", entity: { type: "npc", id: "n1" } });
    expect(member).toMatchObject({ entity: { type: "player", id: "pm1" } });
    expect(odd).toMatchObject({ entity: { type: null, id: "d1" } });
    expect(npc).not.toHaveProperty("label");
  });

  it("routes quest notes and journal entries, maps visibility, titles the journal", () => {
    const out = mergeRecentNotes(
      [en({ id: "q", entity_type: "quest", entity_id: "q9", shared_with_dm: true, updated_at: "2026-10-04" })],
      [je({ id: "j", title: null, updated_at: "2026-10-03" }), je({ id: "jt", is_private: true, updated_at: "2026-10-02" })],
      5,
    );
    expect(out[0]).toMatchObject({ visibility: "dm", to: { name: "play-quest-detail", params: { id: "q9" } } });
    expect(out[1]).toMatchObject({ source: "journal" });
    expect(out[1]).toHaveProperty("label", expect.stringMatching(/^Journal · /));
    expect(out[1].to).toEqual({ name: "play-journal", query: { tab: "mine" } });
    expect(out[2]).toMatchObject({ label: "Session recap", visibility: "private" });
  });

  it("drops blank notes", () => {
    const out = mergeRecentNotes([en({ content: doc("") }), en({ id: "x", content: null })], [je({ content: "" })], 5);
    expect(out).toEqual([]);
  });
});

describe("useMyRecentNotes", () => {
  const seedNotes = (notes: EntityNote[]) => fake.seed("entity_notes", notes.map((n) => ({ ...n })));

  function run(limit: number, enabled?: () => boolean) {
    let out!: ReturnType<typeof useMyRecentNotes>;
    mount(
      defineComponent({
        setup() {
          out = useMyRecentNotes(limit, enabled);
          return () => null;
        },
      }),
      { global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }]] } },
    );
    return out;
  }

  beforeEach(() => {
    fake.reset();
    setActivePinia(createPinia());
    useAuthStore().user = { id: "me" } as never;
    useCampaignStore().activeCampaignId = "c";
  });

  it("lists only my own player notes in this campaign: never another member's, my DM-chair notes, or another campaign's", async () => {
    seedNotes([
      en({ id: "mine", updated_at: "2026-10-02" }),
      en({ id: "someone-else", user_id: "other", updated_at: "2026-10-05" }),
      en({ id: "dm-chair", written_as_dm: true, updated_at: "2026-10-04" }),
      en({ id: "elsewhere", campaign_id: "c2", updated_at: "2026-10-03" }),
    ]);
    const out = run(5);
    await flushPromises();
    expect(out.notes.value.map((n) => n.id)).toEqual(["mine"]);
  });

  it("reads past blank notes so the list still fills to its limit", async () => {
    // A blank newest notes would otherwise eat the whole page of results.
    seedNotes([
      en({ id: "b1", content: doc(""), updated_at: "2026-10-09" }),
      en({ id: "b2", content: doc(""), updated_at: "2026-10-08" }),
      en({ id: "real", updated_at: "2026-10-01" }),
    ]);
    const out = run(1);
    await flushPromises();
    expect(out.notes.value.map((n) => n.id)).toEqual(["real"]);
  });

  it("keeps the newest notes when there are more than it reads", async () => {
    seedNotes([1, 2, 3, 4, 5].map((n) => en({ id: `n${n}`, updated_at: `2026-10-0${n}` })));
    const out = run(1);
    await flushPromises();
    expect(out.notes.value.map((n) => n.id)).toEqual(["n5"]);
  });

  it("reads nothing until the caller enables it", async () => {
    const on = ref(false);
    run(3, () => on.value);
    await flushPromises();
    expect(fake.calls).toEqual([]);
  });
});
