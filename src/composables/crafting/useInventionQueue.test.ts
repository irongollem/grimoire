import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { createApp, defineComponent, h } from "vue";
import { pendingInventionRow } from "./inventionQueue.fixture";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
const sendMessage = vi.fn();
vi.mock("@/lib/supabase", () => ({ supabase: fake.client }));
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
  fake.reset();
  sendMessage.mockReset();
  qc = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
});

describe("usePendingInventions", () => {
  const draft = (id: string, over: Record<string, unknown> = {}) => ({
    ...pendingInventionRow(id),
    status: "pending",
    created_at: `2026-10-0${id.slice(1)}T00:00:00Z`,
    party_members: { name: `Hero ${id}` },
    ...over,
  });

  it("lists this campaign's pending drafts oldest first, each with its character's name, and nothing else", async () => {
    fake.seed("crafting_inventions", [
      draft("i3"),
      draft("i1"),
      draft("i2", { campaign_id: "other-campaign" }),
      draft("i4", { status: "approved" }),
    ]);
    const q = mountWith(qc, () => usePendingInventions(() => "c1"));
    await vi.waitFor(() => expect(q.data.value).toBeDefined());
    expect((q.data.value ?? []).map((p) => [p.invention.id, p.characterName])).toEqual([
      ["i1", "Hero i1"],
      ["i3", "Hero i3"],
    ]);
  });

  it("gives a draft whose character is gone a neutral name instead of a blank", async () => {
    fake.seed("crafting_inventions", [draft("i1", { party_members: null })]);
    const q = mountWith(qc, () => usePendingInventions(() => "c1"));
    await vi.waitFor(() => expect(q.data.value).toBeDefined());
    expect(q.data.value?.[0]?.characterName).toBe("A character at your table");
  });

  it("throws the read error instead of reporting an empty queue", async () => {
    fake.failNext("crafting_inventions", { message: "boom" });
    const q = mountWith(qc, () => usePendingInventions(() => "c1"));
    await vi.waitFor(() => expect(q.isError.value).toBe(true));
  });

  it("does not read without a campaign", () => {
    const q = mountWith(qc, () => usePendingInventions(() => null));
    expect(q.fetchStatus.value).toBe("idle");
    expect(fake.calls).toEqual([]);
  });
});

describe("useDecideInvention", () => {
  const invention = parseInvention(pendingInventionRow());
  let decisions: Record<string, unknown>[] = [];

  beforeEach(() => {
    decisions = [];
    fake.onRpc("decide_crafting_invention", (args) => {
      decisions.push(args);
      return { status: "approved", recipe_id: "r1" };
    });
  });

  it("approve refreshes the queue, recipes and items, then announces it", async () => {
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    sendMessage.mockResolvedValue(undefined);
    const d = mountWith(qc, () => useDecideInvention());
    const res = await d.approve(invention, "Nessa");
    expect(decisions).toHaveLength(1);
    for (const key of ["crafting-inventions", "crafting-recipes", "items"]) {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: [key] });
    }
    expect(sendMessage).toHaveBeenCalledWith("🛠️ **Nessa** invented **Songbird Automaton**.");
    expect(res.chatNotice).toBeNull();
  });

  it("a failed chat post is a notice, not an error", async () => {
    sendMessage.mockRejectedValue(new Error("x"));
    const d = mountWith(qc, () => useDecideInvention());
    const res = await d.approve(invention, "Nessa");
    expect(res.chatNotice).toContain("could not be posted");
  });

  it("a refused approval throws and posts nothing", async () => {
    fake.failNext("decide_crafting_invention", { code: "CX003", message: "not pending" });
    const d = mountWith(qc, () => useDecideInvention());
    await expect(d.approve(invention, "Nessa")).rejects.toMatchObject({ code: "CX003" });
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("returnWithNote sends the trimmed note as a return, not an approval", async () => {
    const d = mountWith(qc, () => useDecideInvention());
    await d.returnWithNote(invention, "  Make it cheaper  ");
    expect(decisions).toEqual([{ p_invention_id: "i1", p_decision: "return", p_note: "Make it cheaper" }]);
  });

  it.each([
    ["an empty note", "   "],
    ["a note of 1001 characters", "x".repeat(1001)],
  ])("returnWithNote refuses %s before asking the server", async (_label, note) => {
    const d = mountWith(qc, () => useDecideInvention());
    await expect(d.returnWithNote(invention, note)).rejects.toThrow();
    expect(decisions).toEqual([]);
  });

  it.each([
    ["one character", "x"],
    ["exactly 1000 characters", "x".repeat(1000)],
  ])("returnWithNote accepts %s", async (_label, note) => {
    const d = mountWith(qc, () => useDecideInvention());
    await d.returnWithNote(invention, note);
    expect(decisions).toHaveLength(1);
  });

  it("maps the refusals to words", () => {
    expect(inventionDecisionErrorMessage({ code: "42501" })).toBe("Only a DM of this campaign can decide.");
    expect(inventionDecisionErrorMessage({ code: "CX003" })).toBe("This draft is no longer waiting for you.");
    expect(inventionDecisionErrorMessage(new Error("boom"))).toBe("boom");
  });
});

describe("useDiscardInvention", () => {
  it("deletes only the draft named and refreshes the queue", async () => {
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    fake.seed("crafting_inventions", [{ id: "i1" }, { id: "i2" }]);
    const d = mountWith(qc, () => useDiscardInvention());
    await d.mutateAsync("i1");
    expect(fake.rows("crafting_inventions")).toEqual([{ id: "i2" }]);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["crafting-inventions"] });
  });

  it("throws the delete error and keeps the draft", async () => {
    fake.seed("crafting_inventions", [{ id: "i1" }]);
    fake.failNext("crafting_inventions", { message: "no" });
    const d = mountWith(qc, () => useDiscardInvention());
    await expect(d.mutateAsync("i1")).rejects.toMatchObject({ message: "no" });
    expect(fake.rows("crafting_inventions")).toEqual([{ id: "i1" }]);
  });
});
