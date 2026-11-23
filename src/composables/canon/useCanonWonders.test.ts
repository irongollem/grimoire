import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, ref } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { createPinia, setActivePinia } from "pinia";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
const mocks = vi.hoisted(() => ({ createEntry: vi.fn(), toastError: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: fake.client, getCurrentUser: () => ({ id: "u1" }) }));
vi.mock("@/lib/toast", () => ({ toast: { error: mocks.toastError, fromError: (e: unknown) => String(e) } }));
vi.mock("@/composables/canon/useCanonEntries", () => ({ useCreateCanonEntry: () => ({ mutateAsync: mocks.createEntry }) }));
vi.mock("@/composables/canon/useMyStory", () => ({ useMyMemberId: () => ref("pm1") }));

import { isOpenWonder, useAddWonder, usePlayerWonders, useWonderActions, WONDER_MAX } from "./useCanonWonders";
import { useCampaignStore } from "@/stores/campaign";

const wonder = (over: Record<string, unknown>) => ({
  id: "w", user_id: "u1", campaign_id: "c1", party_member_id: "pm1", body: "Who sank the mill?", adopted_entry_id: null,
  dismissed_at: null, created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z", ...over,
});

function host<T>(use: () => T): T {
  let result!: T;
  const Host = defineComponent({
    setup() {
      result = use();
      return () => h("div");
    },
  });
  mount(Host, { global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }) }]] } });
  return result;
}

beforeEach(() => {
  setActivePinia(createPinia());
  fake.reset();
  mocks.createEntry.mockReset();
  mocks.toastError.mockReset();
  useCampaignStore().activeCampaignId = "c1";
});

describe("isOpenWonder", () => {
  // Bug caught: an adopted or dismissed wonder stayed in the DM's inbox, so it was taken up twice.
  it("is open only while neither adopted nor dismissed", () => {
    expect(isOpenWonder({ adopted_entry_id: null, dismissed_at: null })).toBe(true);
    expect(isOpenWonder({ adopted_entry_id: "q1", dismissed_at: null })).toBe(false);
    expect(isOpenWonder({ adopted_entry_id: null, dismissed_at: "2026-11-02T00:00:00Z" })).toBe(false);
  });
});

describe("usePlayerWonders", () => {
  // Bug caught (CLAUDE.md Client Reads): "my wonders" read without the caller's user_id, so under the DM's wider
  // read policy a DM-played account, or any account with a wider policy, got everyone's questions.
  it("reads only this player's wonders in this campaign, newest first", async () => {
    fake.seed("canon_wonders", [
      wonder({ id: "old", created_at: "2026-11-01T00:00:00Z" }),
      wonder({ id: "new", created_at: "2026-11-05T00:00:00Z" }),
      wonder({ id: "theirs", user_id: "u2" }),
      wonder({ id: "elsewhere", campaign_id: "c2" }),
    ]);
    const q = host(() => usePlayerWonders());
    await flushPromises();
    expect(q.data.value?.map((w) => w.id)).toEqual(["new", "old"]);
  });
});

describe("useAddWonder", () => {
  // Bug caught: the words went in untrimmed, or without the player's own character and user, so the DM could not say who asked.
  it("adds the trimmed words as this player's wonder, for their character", async () => {
    await host(() => useAddWonder()).mutateAsync("  Who sank the mill?  ");
    expect(fake.rows("canon_wonders")).toMatchObject([{ body: "Who sank the mill?", user_id: "u1", campaign_id: "c1", party_member_id: "pm1" }]);
  });

  // Bug caught: a blank or over-long wonder was sent, so the table's 1 to 300 check refused it with a raw database error.
  it("refuses a blank wonder and one past the limit, writing nothing", async () => {
    const { mutateAsync } = host(() => useAddWonder());
    await expect(mutateAsync("   ")).rejects.toThrow();
    await expect(mutateAsync("x".repeat(WONDER_MAX + 1))).rejects.toThrow();
    expect(fake.rows("canon_wonders")).toEqual([]);
    await expect(mutateAsync("x".repeat(WONDER_MAX))).resolves.toBeUndefined();
  });
});

describe("useWonderActions", () => {
  beforeEach(() => fake.seed("canon_wonders", [wonder({ id: "w1" })]));

  // Bug caught (#1258 item 24): Take it up made the question without pointing the wonder at it (so it stayed in the
  // inbox), or pointed it at nothing, or made the question out of other words than the player's.
  it("takes a wonder up as an open question made of its words and points the wonder at it", async () => {
    mocks.createEntry.mockResolvedValue({ id: "q9" });
    await host(() => useWonderActions()).takeUp({ id: "w1", body: "Who sank the mill?" }, 4);
    expect(mocks.createEntry).toHaveBeenCalledWith({ part: "question", title: "Who sank the mill?", sort_order: 4 });
    expect(fake.rows("canon_wonders")[0]).toMatchObject({ id: "w1", adopted_entry_id: "q9" });
  });

  // Bug caught: the wonder was marked taken up even though the question was never made, so the player's words vanished
  // from the inbox; or the DM was told "the question was added" when it was not (create's own toast is the only word).
  it("leaves the wonder open, and says nothing more, when the question could not be made", async () => {
    mocks.createEntry.mockRejectedValue(new Error("no"));
    await host(() => useWonderActions()).takeUp({ id: "w1", body: "x" }, 0);
    expect(fake.rows("canon_wonders")[0]).toMatchObject({ adopted_entry_id: null });
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  // Bug caught (#1258 item 24): Let it be wrote nothing (or a pointer), so the wonder stayed in the inbox.
  it("lets a wonder be by stamping dismissed_at and nothing else", async () => {
    const { letBe } = host(() => useWonderActions());
    letBe({ id: "w1" });
    await flushPromises();
    const row = fake.rows("canon_wonders")[0] as { dismissed_at: string | null; adopted_entry_id: string | null };
    expect(Number.isNaN(Date.parse(row.dismissed_at ?? ""))).toBe(false);
    expect(row.adopted_entry_id).toBeNull();
    expect(mocks.createEntry).not.toHaveBeenCalled();
  });
});
