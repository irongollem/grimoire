import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import type { RevealAdapter } from "@/lib/reveal";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
const session = vi.hoisted(() => ({
  isOwner: true,
  party: [
    { id: "a", name: "Aria" },
    { id: "b", name: "Bram" },
  ],
  errors: [] as string[],
}));

vi.mock("@/lib/supabase", () => ({ supabase: fake.client }));
vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({
    get isOwner() { return session.isOwner; },
    activeCampaignId: "c1",
  }),
}));
vi.mock("@/composables/party/useParty", () => ({
  useParty: () => ({ data: { get value() { return session.party; } } }),
}));
vi.mock("@/composables/useToast", () => ({
  useToast: () => ({
    error: (message: string) => session.errors.push(message),
    fromError: (_e: unknown, fallback: string) => fallback,
  }),
}));

import { bookBlockedCaption, bookWrite, firstMissingMember, useBookReveal } from "@/composables/openBook/useBookReveal";

const party = [
  { id: "a", name: "Aria" },
  { id: "b", name: "Bram" },
];

describe("firstMissingMember", () => {
  it("names the first member who cannot see the entry", () => {
    expect(firstMissingMember(party, (id) => id === "a")).toBe("Bram");
    expect(firstMissingMember(party, () => false)).toBe("Aria");
  });
  it("is null when everyone sees it, or there is no party", () => {
    expect(firstMissingMember(party, () => true)).toBeNull();
    expect(firstMissingMember([], () => false)).toBeNull();
  });
});

describe("bookBlockedCaption", () => {
  it("names who would read it first, and falls back when no member is to blame", () => {
    expect(bookBlockedCaption("Bram")).toContain("Bram");
    expect(bookBlockedCaption(null)).not.toContain("null");
    expect(bookBlockedCaption(null)).not.toBe(bookBlockedCaption("Bram"));
  });
});

describe("bookWrite", () => {
  it("clears the row when the wish equals the book default, and records an exception otherwise", () => {
    expect(bookWrite(true, true)).toBe("clear");
    expect(bookWrite(false, false)).toBe("clear");
    expect(bookWrite(false, true)).toBe("set");
    expect(bookWrite(true, false)).toBe("set");
  });
});

describe("useBookReveal", () => {
  const sharedWith = (ids: string[]): RevealAdapter => ({
    isMemberVisible: (id) => ids.includes(id),
    toggleMember: () => {},
    setWholeParty: () => {},
    unshare: () => {},
  });

  function run(adapter: RevealAdapter) {
    let api!: ReturnType<typeof useBookReveal>;
    mount(defineComponent({
      setup() {
        api = useBookReveal({ type: "npc", id: "n1" }, adapter);
        return () => null;
      },
    }), { global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient() }]] } });
    return api;
  }

  beforeEach(() => {
    fake.reset();
    session.isOwner = true;
    session.errors.length = 0;
    fake.seed("open_books", [{ campaign_id: "c1", include_shared: false }]);
  });

  it("is absent for anyone but the campaign owner, and for a campaign with no book", async () => {
    session.isOwner = false;
    const api = run(sharedWith(["a", "b"]));
    await flushPromises();
    expect(api.available.value).toBe(false);

    session.isOwner = true;
    fake.reset();
    const noBook = run(sharedWith(["a", "b"]));
    await flushPromises();
    expect(noBook.available.value).toBe(false);
  });

  it("refuses to put an entry in the book while a party member cannot see it", async () => {
    const api = run(sharedWith(["a"]));
    await flushPromises();
    expect(api.eligible.value).toBe(false);
    expect(api.blockedCaption.value).toContain("Bram");

    await api.toggle();
    await flushPromises();
    expect(fake.rows("open_book_entries")).toEqual([]);
  });

  it("is not eligible while the campaign has no party: there is no one it could be shared with", async () => {
    session.party = [];
    const api = run(sharedWith([]));
    await flushPromises();
    expect(api.eligible.value).toBe(false);
    await api.toggle();
    expect(fake.rows("open_book_entries")).toEqual([]);
    session.party = [{ id: "a", name: "Aria" }, { id: "b", name: "Bram" }];
  });

  it("records an exception to a closed book's default when an eligible entry is switched on", async () => {
    const api = run(sharedWith(["a", "b"]));
    await flushPromises();
    expect(api.inBook.value).toBe(false);

    await api.toggle();
    await flushPromises();
    expect(fake.rows("open_book_entries")).toMatchObject([
      { campaign_id: "c1", entity_type: "npc", entity_id: "n1", included: true },
    ]);
    expect(api.inBook.value).toBe(true);
  });

  it("deletes its exception rather than writing a redundant one when switched back to the default", async () => {
    fake.seed("open_book_entries", [
      { campaign_id: "c1", entity_type: "npc", entity_id: "n1", included: true },
      { campaign_id: "c1", entity_type: "npc", entity_id: "n2", included: true },
    ]);
    const api = run(sharedWith(["a", "b"]));
    await flushPromises();
    expect(api.inBook.value).toBe(true);

    await api.toggle();
    await flushPromises();
    expect(fake.rows("open_book_entries").map((r) => r.entity_id)).toEqual(["n2"]);
    expect(api.inBook.value).toBe(false);
  });

  it("says so when the write fails", async () => {
    const api = run(sharedWith(["a", "b"]));
    await flushPromises();
    fake.failNext("open_book_entries", { message: "denied" });
    await api.toggle();
    expect(session.errors).toEqual(["Could not update the Open Book."]);
  });
});
