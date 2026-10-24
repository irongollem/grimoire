import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { createApp, defineComponent, h } from "vue";

const rpc = vi.fn();
const sendMessage = vi.fn();
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));
vi.mock("@/composables/campaign/useCampaignMessages", () => ({ useCampaignMessages: () => ({ sendMessage }) }));
vi.mock("@/lib/observability/sentry", () => ({ reportHandledError: vi.fn() }));

import { experimentErrorMessage, useCraftExperiment } from "./useCraftExperiment";

const member = () => ({ id: "m1", name: "Nessa" });

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
  qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
});

describe("useCraftExperiment", () => {
  it("ignores a second call while one runs", async () => {
    let finish: (v: unknown) => void = () => {};
    rpc.mockReturnValue(new Promise((r) => { finish = r; }));
    const e = mountWith(qc, () => useCraftExperiment(member));
    e.experiment("smithing", ["a"]);
    await vi.waitFor(() => expect(e.experimenting.value).toBe(true));
    e.experiment("smithing", ["a"]);
    expect(rpc).toHaveBeenCalledTimes(1);
    finish({ data: { result: "none" }, error: null });
    await vi.waitFor(() => expect(e.result.value).toEqual({ result: "none" }));
    expect(e.experimenting.value).toBe(false);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("on a match posts the chat line and refreshes recipes", async () => {
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    rpc.mockResolvedValue({ data: { result: "match", recipe_id: "r1", name: "Dagger" }, error: null });
    sendMessage.mockResolvedValue(undefined);
    const e = mountWith(qc, () => useCraftExperiment(member));
    e.experiment("smithing", ["a", "a", "b"]);
    await vi.waitFor(() => expect(e.result.value?.result).toBe("match"));
    expect(rpc).toHaveBeenLastCalledWith("craft_experiment", { p_party_member_id: "m1", p_discipline: "smithing", p_row_ids: ["a", "a", "b"] });
    expect(sendMessage).toHaveBeenCalledWith("🔍 **Nessa** discovered **Dagger** by experimenting.");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["crafting-recipes"] });
  });

  it("a failed chat post is a notice, not an error", async () => {
    rpc.mockResolvedValue({ data: { result: "match", recipe_id: "r1", name: "Dagger" }, error: null });
    sendMessage.mockRejectedValue(new Error("x"));
    const e = mountWith(qc, () => useCraftExperiment(member));
    e.experiment("smithing", ["a"]);
    await vi.waitFor(() => expect(e.chatNotice.value).toContain("could not be posted"));
    expect(e.experimentError.value).toBeNull();
    expect(e.result.value?.result).toBe("match");
  });

  it("shows a refusal until the bench changes, and dismiss closes the answer", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "CX001", message: "Those items cannot be laid out" } });
    const e = mountWith(qc, () => useCraftExperiment(member));
    e.experiment("smithing", ["a"]);
    await vi.waitFor(() => expect(e.experimentError.value).toBe("These items can't be used for experimenting."));
    expect(e.experimenting.value).toBe(false);
    e.clearError();
    expect(e.experimentError.value).toBeNull();

    rpc.mockResolvedValue({ data: { result: "none" }, error: null });
    e.experiment("smithing", ["b"]);
    await vi.waitFor(() => expect(e.result.value).toEqual({ result: "none" }));
    // Clearing an error that is not there leaves the answer alone.
    e.clearError();
    expect(e.result.value).toEqual({ result: "none" });
    e.dismiss();
    expect(e.result.value).toBeNull();
  });

  it("tells a refused caller apart from a refused item", () => {
    expect(experimentErrorMessage({ code: "42501" })).toBe("Only this character's own player can experiment with their pack.");
    expect(experimentErrorMessage({ code: "CX001" })).toBe("These items can't be used for experimenting.");
    expect(experimentErrorMessage({ code: "22023" })).toBe("Lay out between one and eight items.");
  });
});
