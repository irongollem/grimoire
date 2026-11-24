import { describe, expect, it, vi } from "vitest";
import { useTrapGeneration } from "./useTrapGeneration";

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), ack: true }));

vi.mock("@/lib/supabase", () => ({ supabase: { functions: { invoke: mocks.invoke } } }));
vi.mock("@/composables/ai/useLikenessGate", () => ({
  useLikenessGate: () => ({ ensureLikenessAck: async () => mocks.ack }),
}));
vi.mock("@/ai/useImageGeneration", () => ({
  captureFailureMessage: () => "capture failed",
  captureImageGenerationContext: async () => ({ campaignId: "campaign-1" }),
  generateImage: vi.fn(),
}));

describe("useTrapGeneration server call", () => {
  it("a text function quietly painting a second, unrecorded picture: the call never asks the function for one", async () => {
    mocks.invoke.mockResolvedValue({ data: { name: "Pit", image_prompt: "" }, error: null });

    await useTrapGeneration().generate("a pit trap", { generateImage: false });

    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    const [fn, call] = mocks.invoke.mock.calls[0];
    expect(fn).toBe("generate-trap");
    expect(call.body).not.toHaveProperty("generate_image");
    expect(call.body).not.toHaveProperty("group_portrait_url");
  });

  // Bug caught: a declined likeness notice ended the run with no error at all, so the card said "generation failed" or, worse, a stale error from an earlier run.
  it("says the likeness notice was not accepted, and calls nothing, when the party picture is declined", async () => {
    mocks.invoke.mockReset();
    mocks.ack = false;
    const trap = useTrapGeneration();
    expect(await trap.generate("a pit trap", { groupPortraitUrl: "party.png" })).toBeNull();
    expect(trap.error.value).toMatch(/likeness notice was not accepted/);
    expect(mocks.invoke).not.toHaveBeenCalled();
    mocks.ack = true;
  });
});
