import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";
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

import { isOpenLineRequest, lineRequestSentMessage, LINE_REQUEST_MAX, useAskLineOrVeil, useLineRequestActions } from "./useCanonLineRequests";
import { useCampaignStore } from "@/stores/campaign";

function host<T>(use: () => T): T {
  let result!: T;
  mount(defineComponent({ setup() { result = use(); return () => h("div"); } }), {
    global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }) }]] },
  });
  return result;
}

const request = (over: Record<string, unknown> = {}) => ({
  id: "r1", user_id: "u2", campaign_id: "c1", kind: "veil", body: "No harm to animals", asked_by: null, adopted_entry_id: null,
  dismissed_at: null, created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z", ...over,
});

beforeEach(() => {
  setActivePinia(createPinia());
  fake.reset();
  mocks.createEntry.mockReset();
  mocks.toastError.mockReset();
  useCampaignStore().activeCampaignId = "c1";
});

describe("isOpenLineRequest", () => {
  // Bug caught: an answered request stayed in the DM's inbox and was added twice.
  it("is open only while neither adopted nor dismissed", () => {
    expect(isOpenLineRequest({ adopted_entry_id: null, dismissed_at: null })).toBe(true);
    expect(isOpenLineRequest({ adopted_entry_id: "e", dismissed_at: null })).toBe(false);
    expect(isOpenLineRequest({ adopted_entry_id: null, dismissed_at: "2026-11-02T00:00:00Z" })).toBe(false);
  });
});

describe("lineRequestSentMessage", () => {
  // Bug caught: the player told their name was not shown when it was (or the reverse).
  it("says whether the name went with it", () => {
    expect(lineRequestSentMessage(false)).toBe("Sent to your DM. It does not show your name.");
    expect(lineRequestSentMessage(true)).toBe("Sent to your DM, with your name.");
  });
});

describe("useAskLineOrVeil", () => {
  // Bug caught: the signed flag dropped, so a signed request arrived anonymous (or an unsigned one named the player).
  it("sends the trimmed words, the kind and the signed choice through the RPC", async () => {
    fake.onRpc("ask_for_line_or_veil", () => "id1");
    await host(() => useAskLineOrVeil()).mutateAsync({ kind: "veil", body: "  No harm to animals ", signed: true });
    const call = fake.calls.find((c) => c.target === "ask_for_line_or_veil");
    expect(call?.payload).toMatchObject({ p_campaign_id: "c1", p_kind: "veil", p_body: "No harm to animals", p_signed: true });
  });

  // Bug caught: a blank or over-long request was sent and refused by the database with a raw error.
  it("refuses blank and over-long words before sending", async () => {
    const { mutateAsync } = host(() => useAskLineOrVeil());
    await expect(mutateAsync({ kind: "line", body: "  ", signed: false })).rejects.toThrow();
    await expect(mutateAsync({ kind: "line", body: "x".repeat(LINE_REQUEST_MAX + 1), signed: false })).rejects.toThrow();
    expect(fake.calls.some((c) => c.target === "ask_for_line_or_veil")).toBe(false);
  });
});

describe("useLineRequestActions", () => {
  beforeEach(() => fake.seed("canon_line_requests", [request()]));

  // Bug caught: Add as a veil made a line (kind lost), or never pointed the request at the entry so it stayed in the inbox.
  it("adds a request as a premise entry of its own kind made of its words, and points the request at it", async () => {
    mocks.createEntry.mockResolvedValue({ id: "e9" });
    await host(() => useLineRequestActions()).adopt({ id: "r1", kind: "veil", body: "No harm to animals" }, 3);
    expect(mocks.createEntry).toHaveBeenCalledWith({ part: "premise", premise_kind: "veil", title: "No harm to animals", sort_order: 3 });
    expect(fake.rows("canon_line_requests")[0]).toMatchObject({ id: "r1", adopted_entry_id: "e9" });
  });

  // Bug caught: the request marked answered although no entry was made, so the player's words vanished.
  it("leaves the request open when the entry could not be made", async () => {
    mocks.createEntry.mockRejectedValue(new Error("no"));
    await host(() => useLineRequestActions()).adopt({ id: "r1", kind: "line", body: "x" }, 0);
    expect(fake.rows("canon_line_requests")[0]).toMatchObject({ adopted_entry_id: null });
  });

  // Bug caught: Let it be wrote nothing, or made an entry.
  it("lets a request be by stamping dismissed_at only", async () => {
    host(() => useLineRequestActions()).letBe({ id: "r1" });
    await flushPromises();
    const row = fake.rows("canon_line_requests")[0] as { dismissed_at: string | null; adopted_entry_id: string | null };
    expect(Number.isNaN(Date.parse(row.dismissed_at ?? ""))).toBe(false);
    expect(row.adopted_entry_id).toBeNull();
    expect(mocks.createEntry).not.toHaveBeenCalled();
  });
});
