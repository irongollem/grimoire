import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { createApp, defineComponent, h } from "vue";

const rpc = vi.fn();
const invoke = vi.fn();
const eq = vi.fn();
const deleteEq = vi.fn();
vi.mock("@/lib/supabase", () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpc(...a),
    functions: { invoke: (...a: unknown[]) => invoke(...a) },
    from: () => ({
      select: () => {
        const chain = { eq: (...a: unknown[]) => { eq(...a); return chain; }, order: () => Promise.resolve({ data: [], error: null }) };
        return chain;
      },
      delete: () => ({ eq: (...a: unknown[]) => deleteEq(...a) }),
    }),
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
  for (const f of [rpc, invoke, eq, deleteEq]) f.mockReset();
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
  it("scopes the read to the caller, the character and the craft", async () => {
    const q = mountWith(qc, () => useMyInventions(() => "m1", () => "smithing"));
    await vi.waitFor(() => expect(q.isSuccess.value).toBe(true));
    expect(eq).toHaveBeenCalledWith("user_id", "u1");
    expect(eq).toHaveBeenCalledWith("party_member_id", "m1");
    expect(eq).toHaveBeenCalledWith("discipline", "smithing");
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

  it("submits through the rpc and words its refusals", async () => {
    rpc.mockResolvedValue({ error: { code: "CX003" } });
    const inv = mountWith(qc, useCraftInventions);
    await inv.submit("i1");
    expect(rpc).toHaveBeenCalledWith("submit_crafting_invention", { p_invention_id: "i1" });
    await vi.waitFor(() => expect(inv.submitError.value).toBe("This draft has already been sent."));
  });

  it("discards by id and takes the error", async () => {
    deleteEq.mockResolvedValue({ error: null });
    const inv = mountWith(qc, useCraftInventions);
    await inv.discard("i1");
    expect(deleteEq).toHaveBeenCalledWith("id", "i1");
  });
});
