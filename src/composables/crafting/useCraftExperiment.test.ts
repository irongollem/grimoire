import { describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const sendMessage = vi.fn();
const invalidateQueries = vi.fn();
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));
vi.mock("@tanstack/vue-query", () => ({
  useMutation: (o: { mutationFn: (p: unknown) => Promise<unknown> }) => ({ mutateAsync: o.mutationFn }),
  useQueryClient: () => ({ invalidateQueries }),
}));
vi.mock("@/composables/campaign/useCampaignMessages", () => ({ useCampaignMessages: () => ({ sendMessage }) }));
vi.mock("@/lib/observability/sentry", () => ({ reportHandledError: vi.fn() }));

import { experimentErrorMessage, useCraftExperiment } from "./useCraftExperiment";

const member = () => ({ id: "m1", name: "Nessa" });

describe("useCraftExperiment", () => {
  it("ignores a second call while one runs", async () => {
    let finish: (v: unknown) => void = () => {};
    rpc.mockReturnValue(new Promise((r) => { finish = r; }));
    const e = useCraftExperiment(member);
    const first = e.experiment("smithing", ["a"]);
    await e.experiment("smithing", ["a"]);
    expect(rpc).toHaveBeenCalledTimes(1);
    finish({ data: { result: "none" }, error: null });
    await first;
    expect(e.result.value).toEqual({ result: "none" });
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("on a match posts the chat line and refreshes recipes", async () => {
    rpc.mockResolvedValue({ data: { result: "match", recipe_id: "r1", name: "Dagger" }, error: null });
    sendMessage.mockResolvedValue(undefined);
    const e = useCraftExperiment(member);
    await e.experiment("smithing", ["a", "b"]);
    expect(rpc).toHaveBeenLastCalledWith("craft_experiment", { p_party_member_id: "m1", p_discipline: "smithing", p_row_ids: ["a", "b"] });
    expect(sendMessage).toHaveBeenCalledWith("🔍 **Nessa** discovered **Dagger** by experimenting.");
    expect(invalidateQueries).toHaveBeenCalled();
  });

  it("a failed chat post is a notice, not an error", async () => {
    rpc.mockResolvedValue({ data: { result: "match", recipe_id: "r1", name: "Dagger" }, error: null });
    sendMessage.mockRejectedValue(new Error("x"));
    const e = useCraftExperiment(member);
    await e.experiment("smithing", ["a"]);
    expect(e.chatNotice.value).toContain("could not be posted");
    expect(e.experimentError.value).toBeNull();
    expect(e.result.value?.result).toBe("match");
  });

  it("maps the refusals to words", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "Not authorized" } });
    const e = useCraftExperiment(member);
    await e.experiment("smithing", ["a"]);
    expect(e.experimentError.value).toBe("These items can't be used for experimenting.");
    expect(e.experimenting.value).toBe(false);
    expect(experimentErrorMessage({ code: "22023" })).toBe("Lay out between one and eight items.");
  });
});
