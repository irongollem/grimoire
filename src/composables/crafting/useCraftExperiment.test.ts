import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { createApp, defineComponent, h } from "vue";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
const sendMessage = vi.fn();
vi.mock("@/lib/supabase", () => ({ supabase: fake.client }));
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
const flush = () => new Promise((r) => setTimeout(r, 0));
const asked = () => fake.calls.filter((c) => c.target === "craft_experiment").length;

beforeEach(() => {
  fake.reset();
  sendMessage.mockReset();
  qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
});

describe("useCraftExperiment", () => {
  it("ignores a second call while one runs", async () => {
    let finish: (v: unknown) => void = () => {};
    fake.onRpc("craft_experiment", () => new Promise((r) => { finish = r; }));
    const e = mountWith(qc, () => useCraftExperiment(member));
    e.experiment("smithing", ["a"]);
    await vi.waitFor(() => expect(e.experimenting.value).toBe(true));
    e.experiment("smithing", ["a"]);
    await flush();
    expect(asked()).toBe(1);
    finish({ result: "none" });
    await vi.waitFor(() => expect(e.result.value).toEqual({ result: "none" }));
    expect(e.experimenting.value).toBe(false);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("on a match posts the chat line and refreshes recipes", async () => {
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    let seen: Record<string, unknown> = {};
    fake.onRpc("craft_experiment", (args) => {
      seen = args;
      return { result: "match", recipe_id: "r1", name: "Dagger" };
    });
    sendMessage.mockResolvedValue(undefined);
    const e = mountWith(qc, () => useCraftExperiment(member));
    e.experiment("smithing", ["a", "a", "b"]);
    await vi.waitFor(() => expect(e.result.value?.result).toBe("match"));
    // The same row laid out twice reaches the server twice: it decides what that means.
    expect(seen).toMatchObject({ p_party_member_id: "m1", p_row_ids: ["a", "a", "b"] });
    expect(sendMessage).toHaveBeenCalledWith("🔍 **Nessa** discovered **Dagger** by experimenting.");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["crafting-recipes"] });
  });

  it("a failed chat post is a notice, not an error", async () => {
    fake.onRpc("craft_experiment", () => ({ result: "match", recipe_id: "r1", name: "Dagger" }));
    sendMessage.mockRejectedValue(new Error("x"));
    const e = mountWith(qc, () => useCraftExperiment(member));
    e.experiment("smithing", ["a"]);
    await vi.waitFor(() => expect(e.chatNotice.value).toContain("could not be posted"));
    expect(e.experimentError.value).toBeNull();
    expect(e.result.value?.result).toBe("match");
  });

  it("shows a refusal until the bench changes, and dismiss closes the answer", async () => {
    fake.failNext("craft_experiment", { code: "CX001", message: "Those items cannot be laid out" });
    const e = mountWith(qc, () => useCraftExperiment(member));
    e.experiment("smithing", ["a"]);
    await vi.waitFor(() => expect(e.experimentError.value).toBe("These items can't be used for experimenting."));
    expect(e.experimenting.value).toBe(false);
    e.clearError();
    expect(e.experimentError.value).toBeNull();

    fake.onRpc("craft_experiment", () => ({ result: "none" }));
    e.experiment("smithing", ["b"]);
    await vi.waitFor(() => expect(e.result.value).toEqual({ result: "none" }));
    // Clearing an error that is not there leaves the answer alone.
    e.clearError();
    expect(e.result.value).toEqual({ result: "none" });
    e.dismiss();
    expect(e.result.value).toBeNull();
  });

  it("does nothing, and asks nothing, with no character at the bench", async () => {
    const e = mountWith(qc, () => useCraftExperiment(() => null));
    e.experiment("smithing", ["a"]);
    await flush();
    expect(asked()).toBe(0);
    expect(e.experimenting.value).toBe(false);
  });

  it("clears the last chat notice when the next experiment starts", async () => {
    fake.onRpc("craft_experiment", () => ({ result: "match", recipe_id: "r1", name: "Dagger" }));
    sendMessage.mockRejectedValueOnce(new Error("x")).mockResolvedValue(undefined);
    const e = mountWith(qc, () => useCraftExperiment(member));
    e.experiment("smithing", ["a"]);
    await vi.waitFor(() => expect(e.chatNotice.value).not.toBeNull());
    e.experiment("smithing", ["b"]);
    await vi.waitFor(() => expect(e.chatNotice.value).toBeNull());
  });

  it("keeps the server's own words for a refusal it has no wording for", async () => {
    // supabase-js raises its errors as Error subclasses; the fake's failNext hands back a plain object.
    fake.onRpc("craft_experiment", () => {
      throw new Error("The forge is cold");
    });
    const e = mountWith(qc, () => useCraftExperiment(member));
    e.experiment("smithing", ["a"]);
    await vi.waitFor(() => expect(e.experimentError.value).toBe("The forge is cold"));
  });

  it("tells a refused caller apart from a refused item", () => {
    expect(experimentErrorMessage({ code: "42501" })).toBe("Only this character's own player can experiment with their pack.");
    expect(experimentErrorMessage({ code: "CX001" })).toBe("These items can't be used for experimenting.");
    expect(experimentErrorMessage({ code: "22023" })).toBe("Lay out between one and eight items.");
  });
});
