import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { createApp, defineComponent, h } from "vue";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
const invoke = vi.fn();
vi.mock("@/lib/supabase", () => ({
  supabase: {
    rpc: fake.client.rpc,
    from: fake.client.from,
    functions: { invoke: (...a: unknown[]) => invoke(...a) },
  },
}));
vi.mock("@edge-shared/edgeError.ts", () => ({ edgeErrorMessage: async () => "edge said no" }));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => ({ user: { id: "u1" } }) }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ isAiEnabled: true }) }));
vi.mock("@/composables/rules/useOptionalRules", () => ({ useIsRuleEnabled: () => ({ value: true }) }));
const parse = vi.fn((x: unknown) => x);
vi.mock("@/lib/crafting/invention", () => ({ parseInvention: (x: unknown) => parse(x) }));

import { inventionErrorMessage, useCraftInventions, useMyInventions } from "./useCraftInventions";

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
  invoke.mockReset();
  qc = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
});

describe("inventionErrorMessage", () => {
  it("words the refusals", () => {
    expect(inventionErrorMessage({ code: "42501" })).toBe("Only this character's own player can send it.");
    expect(inventionErrorMessage({ code: "CX003" })).toBe("This draft has already been sent.");
    expect(inventionErrorMessage(new Error("boom"))).toBe("boom");
  });
});

describe("useMyInventions", () => {
  const row = (id: string, over: Record<string, unknown> = {}) => ({
    id,
    user_id: "u1",
    party_member_id: "m1",
    discipline: "smithing",
    updated_at: `2026-10-0${id.slice(1)}T00:00:00Z`,
    ...over,
  });

  it("returns only the caller's drafts for this character and craft, newest change first", async () => {
    fake.seed("crafting_inventions", [
      row("i1"),
      row("i2"),
      row("i3", { user_id: "someone-else" }),
      row("i4", { party_member_id: "m2" }),
      row("i5", { discipline: "alchemy" }),
    ]);
    const q = mountWith(qc, () => useMyInventions(() => "m1", () => "smithing"));
    await vi.waitFor(() => expect(q.isSuccess.value).toBe(true));
    expect((q.data.value ?? []).map((i) => (i as { id: string }).id)).toEqual(["i2", "i1"]);
  });

  it("spans every craft when none is chosen, but still only this character's and the caller's", async () => {
    fake.seed("crafting_inventions", [row("i1"), row("i5", { discipline: "alchemy" }), row("i3", { user_id: "someone-else" })]);
    const q = mountWith(qc, () => useMyInventions(() => "m1", () => null));
    await vi.waitFor(() => expect(q.isSuccess.value).toBe(true));
    expect((q.data.value ?? []).map((i) => (i as { id: string }).id).sort()).toEqual(["i1", "i5"]);
  });

  it("reads nothing without a character, and reports a failed read as an error", async () => {
    fake.seed("crafting_inventions", [row("i1")]);
    const idle = mountWith(qc, () => useMyInventions(() => null, () => null));
    await new Promise((r) => setTimeout(r, 0));
    expect(idle.data.value).toBeUndefined();
    expect(fake.calls).toEqual([]);

    fake.failNext("crafting_inventions", { message: "boom" });
    const failing = mountWith(qc, () => useMyInventions(() => "m1", () => "smithing"));
    await vi.waitFor(() => expect(failing.isError.value).toBe(true));
  });
});

describe("useCraftInventions", () => {
  it("sends the materials request and returns the draft", async () => {
    invoke.mockResolvedValue({ data: { invention: { id: "i1" } }, error: null });
    const inv = mountWith(qc, useCraftInventions);
    const out = await inv.inventFromMaterials("m1", "smithing", ["a", "b"]);
    expect(invoke).toHaveBeenCalledWith("invent-recipe", {
      body: { action: "materials", party_member_id: "m1", discipline: "smithing", row_ids: ["a", "b"] },
    });
    expect(out).toEqual({ kind: "invention", invention: { id: "i1" } });
  });

  it("returns the reason when nothing comes to mind", async () => {
    invoke.mockResolvedValue({ data: { result: "nothing", reason: "Too little here." }, error: null });
    const inv = mountWith(qc, useCraftInventions);
    expect(await inv.inventFromMaterials("m1", "smithing", ["a"])).toEqual({ kind: "nothing", reason: "Too little here." });
  });

  it("keeps the error as state and resolves null", async () => {
    invoke.mockResolvedValue({ data: { error: "No credits left." }, error: null });
    const inv = mountWith(qc, useCraftInventions);
    expect(await inv.inventFromIdea("m1", "smithing", "a sword", [])).toBeNull();
    await vi.waitFor(() => expect(inv.ideaError.value).toBe("No credits left."));
  });

  it("ignores a second call while one runs", async () => {
    let finish: (v: unknown) => void = () => {};
    invoke.mockReturnValue(new Promise((r) => { finish = r; }));
    const inv = mountWith(qc, useCraftInventions);
    const first = inv.revise("i1", "make it lighter");
    await vi.waitFor(() => expect(inv.revisePending.value).toBe(true));
    expect(await inv.revise("i1", "again")).toBeNull();
    expect(await inv.submit("i1")).toBeNull();
    expect(invoke).toHaveBeenCalledTimes(1);
    finish({ data: { invention: { id: "i1" } }, error: null });
    await first;
  });

  it("words a refusal of the submit", async () => {
    fake.failNext("submit_crafting_invention", { code: "CX003", message: "already sent" });
    const inv = mountWith(qc, useCraftInventions);
    await inv.submit("i1");
    await vi.waitFor(() => expect(inv.submitError.value).toBe("This draft has already been sent."));
  });

  it("keeps a failed discard as state and the draft in place", async () => {
    fake.seed("crafting_inventions", [{ id: "i1" }]);
    fake.failNext("crafting_inventions", { message: "not yours" });
    const inv = mountWith(qc, useCraftInventions);
    expect(await inv.discard("i1")).toBeNull();
    await vi.waitFor(() => expect(inv.discardError.value).not.toBeNull());
    expect(fake.rows("crafting_inventions")).toEqual([{ id: "i1" }]);
  });
});
