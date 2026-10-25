import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { createApp, defineComponent, h } from "vue";
import { pendingInventionRow } from "./inventionQueue.fixture";

const rpc = vi.fn();
const sendMessage = vi.fn();
const from = vi.fn();
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a), from: (...a: unknown[]) => from(...a) } }));
vi.mock("@/composables/campaign/useCampaignMessages", () => ({ useCampaignMessages: () => ({ sendMessage }) }));
vi.mock("@/lib/observability/sentry", () => ({ reportHandledError: vi.fn() }));

import {
  inventionDecisionErrorMessage,
  useDecideInvention,
  useDiscardInvention,
  usePendingInventions,
} from "./useInventionQueue";
import { parseInvention } from "@/lib/crafting/invention";

function mountWith<T>(qc: QueryClient, setup: () => T): T {
  let out!: T;
  const app = createApp(
    defineComponent({
      setup() {
        out = setup();
        return () => h("div");
      },
    }),
  );
  app.use(VueQueryPlugin, { queryClient: qc });
  app.mount(document.createElement("div"));
  return out;
}

let qc: QueryClient;
beforeEach(() => {
  rpc.mockReset();
  sendMessage.mockReset();
  from.mockReset();
  qc = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
});

describe("usePendingInventions", () => {
  it("reads pending drafts of the campaign, oldest first, with the character's name", async () => {
    const order = vi.fn().mockResolvedValue({
      data: [{ ...pendingInventionRow("i1"), party_members: { name: "Nessa" } }],
      error: null,
    });
    const eqStatus = vi.fn(() => ({ order }));
    const eqCampaign = vi.fn(() => ({ eq: eqStatus }));
    const select = vi.fn(() => ({ eq: eqCampaign }));
    from.mockReturnValue({ select });
    const q = mountWith(qc, () => usePendingInventions(() => "c1"));
    await vi.waitFor(() => expect(q.data.value).toHaveLength(1));
    expect(from).toHaveBeenCalledWith("crafting_inventions");
    expect(select).toHaveBeenCalledWith("*, party_members(name)");
    expect(eqCampaign).toHaveBeenCalledWith("campaign_id", "c1");
    expect(eqStatus).toHaveBeenCalledWith("status", "pending");
    expect(order).toHaveBeenCalledWith("created_at", { ascending: true });
    expect(q.data.value?.[0]?.characterName).toBe("Nessa");
    expect(q.data.value?.[0]?.invention.id).toBe("i1");
  });

  it("throws the read error instead of reporting an empty queue", async () => {
    const order = vi.fn().mockResolvedValue({ data: null, error: new Error("boom") });
    from.mockReturnValue({ select: () => ({ eq: () => ({ eq: () => ({ order }) }) }) });
    const q = mountWith(qc, () => usePendingInventions(() => "c1"));
    await vi.waitFor(() => expect(q.isError.value).toBe(true));
  });

  it("does not read without a campaign", () => {
    const q = mountWith(qc, () => usePendingInventions(() => null));
    expect(q.fetchStatus.value).toBe("idle");
    expect(from).not.toHaveBeenCalled();
  });
});

describe("useDecideInvention", () => {
  const invention = parseInvention(pendingInventionRow());

  it("approve calls the RPC, refreshes recipes and items, then announces it", async () => {
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    rpc.mockResolvedValue({ data: { status: "approved", recipe_id: "r1" }, error: null });
    sendMessage.mockResolvedValue(undefined);
    const d = mountWith(qc, () => useDecideInvention());
    const res = await d.approve(invention, "Nessa");
    expect(rpc).toHaveBeenCalledWith("decide_crafting_invention", { p_invention_id: "i1", p_decision: "approve" });
    for (const key of ["crafting-inventions", "crafting-recipes", "items"]) {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: [key] });
    }
    expect(sendMessage).toHaveBeenCalledWith("🛠️ **Nessa** invented **Songbird Automaton**.");
    expect(res.chatNotice).toBeNull();
  });

  it("a failed chat post is a notice, not an error", async () => {
    rpc.mockResolvedValue({ data: { status: "approved", recipe_id: "r1" }, error: null });
    sendMessage.mockRejectedValue(new Error("x"));
    const d = mountWith(qc, () => useDecideInvention());
    const res = await d.approve(invention, "Nessa");
    expect(res.chatNotice).toContain("could not be posted");
  });

  it("a refused approval throws and posts nothing", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "CX003", message: "not pending" } });
    const d = mountWith(qc, () => useDecideInvention());
    await expect(d.approve(invention, "Nessa")).rejects.toMatchObject({ code: "CX003" });
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("returnWithNote sends the trimmed note", async () => {
    rpc.mockResolvedValue({ data: { status: "draft" }, error: null });
    const d = mountWith(qc, () => useDecideInvention());
    await d.returnWithNote(invention, "  Make it cheaper  ");
    expect(rpc).toHaveBeenCalledWith("decide_crafting_invention", { p_invention_id: "i1", p_decision: "return", p_note: "Make it cheaper" });
  });

  it("returnWithNote refuses an empty or oversized note before asking the server", async () => {
    const d = mountWith(qc, () => useDecideInvention());
    await expect(d.returnWithNote(invention, "   ")).rejects.toThrow();
    await expect(d.returnWithNote(invention, "x".repeat(1001))).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps the refusals to words", () => {
    expect(inventionDecisionErrorMessage({ code: "42501" })).toBe("Only a DM of this campaign can decide.");
    expect(inventionDecisionErrorMessage({ code: "CX003" })).toBe("This draft is no longer waiting for you.");
    expect(inventionDecisionErrorMessage(new Error("boom"))).toBe("boom");
  });
});

describe("useDiscardInvention", () => {
  it("deletes by id and refreshes the queue", async () => {
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const eq = vi.fn().mockResolvedValue({ error: null });
    from.mockReturnValue({ delete: () => ({ eq }) });
    const d = mountWith(qc, () => useDiscardInvention());
    await d.mutateAsync("i1");
    expect(eq).toHaveBeenCalledWith("id", "i1");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["crafting-inventions"] });
  });

  it("throws the delete error", async () => {
    from.mockReturnValue({ delete: () => ({ eq: vi.fn().mockResolvedValue({ error: new Error("no") }) }) });
    const d = mountWith(qc, () => useDiscardInvention());
    await expect(d.mutateAsync("i1")).rejects.toThrow("no");
  });
});
