// @vitest-environment happy-dom
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  campaign: { isAiEnabled: true },
  run: vi.fn(),
  confirm: vi.fn(),
  toast: { error: vi.fn() },
}));

vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => mocks.campaign }));
vi.mock("@/ai/useIlluminatePicture", async () => {
  const { ref } = await import("vue");
  return {
    useIlluminatePicture: () => ({ isGenerating: ref(false), error: ref(null), run: mocks.run }),
    useIlluminatePictureCost: () => ({ costFor: (size: string) => (size === "1024x1024" ? 50 : 75) }),
  };
});
vi.mock("@/composables/ai/useAiCredits", () => ({ useAiCredits: () => ({ affordable: () => true }) }));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: mocks.confirm }) }));
vi.mock("@/composables/useToast", () => ({ useToast: () => mocks.toast }));

import IlluminateAskSection from "./IlluminateAskSection.vue";
import type { ScriptoriumArtLook } from "@edge-shared/scriptoriumLookStyles.ts";

const props = {
  baseUrl: "https://cdn/o.webp",
  natural: { width: 1000, height: 1000 },
  documentId: "doc-1",
  userId: "u1",
  look: { label: "Grimoire", id: "grimoire" } as { label: string; id: ScriptoriumArtLook | null } | null,
  hasAiResult: false,
};
const stubs = { GenerationCostBadge: { props: ["credits"], template: "<i data-testid='cost'>{{ credits }}</i>" } };
const mountIt = (over: Partial<typeof props> = {}) => mount(IlluminateAskSection, { props: { ...props, ...over }, global: { stubs } });

beforeEach(() => {
  mocks.campaign.isAiEnabled = true;
  mocks.run.mockReset().mockResolvedValue("https://cdn/ai.webp");
  mocks.confirm.mockReset();
  mocks.toast.error.mockReset();
});

describe("Ask the Illuminator", () => {
  // Bug: AI-off campaigns still showed paid actions (frame 12: with AI off this whole section is not there).
  it("is absent when AI is off for the campaign", () => {
    mocks.campaign.isAiEnabled = false;
    expect(mountIt().find("[data-testid='ask-the-illuminator']").exists()).toBe(false);
  });

  it("offers the five actions with their prices, and the look's name on Match", () => {
    const w = mountIt();
    for (const action of ["cutout", "ink", "watercolour", "extend", "match"]) expect(w.find(`[data-testid='ask-${action}']`).exists(), action).toBe(true);
    // Square picture: 50 for the square actions; extend grows into the landscape oblong, 75.
    expect(w.findAll("[data-testid='cost']").map((c) => c.text())).toEqual(["50", "50", "50", "75", "50"]);
    expect(w.text()).toContain("Grimoire");
  });

  it("runs an action on the current base and hands the stored picture up", async () => {
    const w = mountIt({ baseUrl: "https://cdn/ai-1.webp" });
    await w.find("[data-testid='ask-ink']").trigger("click");
    await flushPromises();
    expect(mocks.run).toHaveBeenCalledWith(expect.objectContaining({ action: "ink", baseUrl: "https://cdn/ai-1.webp", documentId: "doc-1", userId: "u1" }));
    expect(w.emitted("result")).toEqual([["https://cdn/ai.webp", "ink"]]);
  });

  // Bug: the client sent prompt words of its own; now only the look's name travels.
  it("sends the look's name, and no text, with Match", async () => {
    const w = mountIt();
    await w.find("[data-testid='ask-match']").trigger("click");
    await flushPromises();
    expect(mocks.run.mock.calls[0][0].look).toBe("grimoire");
    expect(mocks.run.mock.calls[0][0]).not.toHaveProperty("style");
  });

  // Bug: a handout paper has no look, and Match would have sent the house style alone as "this book's look".
  it("cannot match a handout, which has no house look", () => {
    const w = mountIt({ look: { label: "Letter", id: null } });
    expect(w.find("[data-testid='ask-match']").attributes("disabled")).toBeDefined();
  });

  it("shows the server's message and hands nothing up when an action fails", async () => {
    mocks.run.mockRejectedValue(new Error("rate_limited"));
    const w = mountIt();
    await w.find("[data-testid='ask-cutout']").trigger("click");
    await flushPromises();
    expect(mocks.toast.error).toHaveBeenCalledWith("rate_limited");
    expect(w.emitted("result")).toBeUndefined();
  });

  it("hands nothing up when the author declines the likeness notice", async () => {
    mocks.run.mockResolvedValue(null);
    const w = mountIt();
    await w.find("[data-testid='ask-ink']").trigger("click");
    await flushPromises();
    expect(w.emitted("result")).toBeUndefined();
  });
});

describe("Use the original picture", () => {
  it("is only there once an AI result is in the recipe", () => {
    expect(mountIt().find("[data-testid='ask-use-original']").exists()).toBe(false);
    expect(mountIt({ hasAiResult: true }).find("[data-testid='ask-use-original']").exists()).toBe(true);
  });

  // Bug: one click threw away a result that cost credits and cannot be made again for free.
  it("asks first, and drops the result only when confirmed", async () => {
    const w = mountIt({ hasAiResult: true });
    mocks.confirm.mockResolvedValue(false);
    await w.find("[data-testid='ask-use-original']").trigger("click");
    await flushPromises();
    expect(mocks.confirm.mock.calls[0][0]).toBe("This drops the AI result you paid for.");
    expect(w.emitted("useOriginal")).toBeUndefined();
    mocks.confirm.mockResolvedValue(true);
    await w.find("[data-testid='ask-use-original']").trigger("click");
    await flushPromises();
    expect(w.emitted("useOriginal")).toHaveLength(1);
  });
});
