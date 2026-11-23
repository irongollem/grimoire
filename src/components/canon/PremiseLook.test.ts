import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { ref } from "vue";
import type { Campaign } from "@/types/campaign.types";
import { canonEntry } from "@/test/canonEntry";

const mocks = vi.hoisted(() => ({
  create: vi.fn(), update: vi.fn(), describe: vi.fn(), confirm: vi.fn(), canSpend: vi.fn(), add: vi.fn(),
}));
vi.mock("@/composables/canon/useCanonEntries", () => ({ createCanonEntry: mocks.create, updateCanonEntry: mocks.update, CANON_KEY: "canon" }));
vi.mock("@tanstack/vue-query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/vue-query")>()),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@/composables/canon/useDescribeLook", () => ({
  useDescribeLook: () => ({ describe: mocks.describe, isDescribing: ref(false), error: ref(null) }),
}));
vi.mock("@/composables/canon/useLookReferences", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/composables/canon/useLookReferences")>();
  return { ...real, useLookReferences: (saved: () => string[], persist: (u: string[]) => Promise<void>) => ({ images: ref([...saved()]), busy: ref(false), add: async () => persist(["new.webp"]), remove: vi.fn() }) };
});
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: mocks.confirm }) }));
vi.mock("@/composables/ai/useGenerationGate", () => ({ useGenerationGate: () => ({ canSpend: mocks.canSpend }) }));
vi.mock("@/composables/ai/useAiCredits", () => ({ useAiCredits: () => ({ costOf: () => 1 }) }));
vi.mock("@/composables/ai/useCampaignProviders", () => ({ useCampaignProviders: () => ({ textCredits: (n: number) => n, textIsByok: ref(false) }) }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ isAiEnabled: true }) }));
vi.mock("@/ai/aiGeneratorRegistry", () => ({ isAnyAiGenerating: ref(false) }));

import PremiseLook from "./PremiseLook.vue";

const campaign = { id: "c1" } as Campaign;
const look = (over = {}) => canonEntry({ id: "l1", campaign_id: "c1", part: "premise", premise_kind: "look", title: "", ...over });

function mountLook(entry?: ReturnType<typeof look>) {
  return mount(PremiseLook, { props: { campaign, ...(entry ? { entry } : {}) }, global: { stubs: { GenerationCostBadge: true } } });
}
const button = (w: ReturnType<typeof mountLook>) => w.findAll("button").find((b) => b.text().includes("Describe"));

describe("PremiseLook", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setActivePinia(createPinia());
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.create.mockResolvedValue({ id: "new" });
    mocks.update.mockResolvedValue(undefined);
    mocks.canSpend.mockReturnValue(true);
    mocks.confirm.mockResolvedValue(true);
    mocks.describe.mockResolvedValue("Storybook gouache");
  });
  afterEach(() => vi.useRealTimers());

  it("offers Describe only once there is a picture", () => {
    expect(button(mountLook(look()))).toBeUndefined();
    expect(button(mountLook(look({ reference_images: ["a.webp"] })))).toBeDefined();
  });

  it("creates exactly one look entry when a picture is added before anything is typed, then saves the picture into it", async () => {
    const w = mountLook();
    await w.find("[data-testid=look-file]").trigger("change");
    await flushPromises();
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.update).toHaveBeenCalledWith("new", { reference_images: ["new.webp"] });
  });

  it("does not make a second entry when words are typed while the first is being created", async () => {
    const w = mountLook();
    await w.find("textarea").setValue("Gouache");
    await w.find("[data-testid=look-file]").trigger("change");
    await vi.advanceTimersByTimeAsync(2500);
    await flushPromises();
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });

  it("asks before replacing a look that already has words, and keeps them when declined", async () => {
    mocks.confirm.mockResolvedValue(false);
    const w = mountLook(look({ title: "Candlelit oils", reference_images: ["a.webp"] }));
    await button(w)!.trigger("click");
    await flushPromises();
    expect(mocks.confirm).toHaveBeenCalledOnce();
    expect((w.find("textarea").element as HTMLTextAreaElement).value).toBe("Candlelit oils");
  });

  // Bug caught: the credit was spent by the describe call before the DM was asked, so Cancel lost it.
  it("makes no describe call when the replace question is declined", async () => {
    mocks.confirm.mockResolvedValue(false);
    const w = mountLook(look({ title: "Candlelit oils", reference_images: ["a.webp"] }));
    await button(w)!.trigger("click");
    await flushPromises();
    expect(mocks.describe).not.toHaveBeenCalled();
  });

  // Bug caught: words typed while the describe call ran were overwritten without asking.
  it("asks again, and keeps the typed words when declined, if the look changed during the call", async () => {
    let finish: (v: string) => void = () => {};
    mocks.describe.mockReturnValue(new Promise<string>((r) => { finish = r; }));
    mocks.confirm.mockResolvedValue(false);
    const w = mountLook(look({ reference_images: ["a.webp"] }));
    await button(w)!.trigger("click");
    await w.find("textarea").setValue("Typed meanwhile");
    finish("Storybook gouache");
    await flushPromises();
    expect(mocks.confirm).toHaveBeenCalledOnce();
    expect((w.find("textarea").element as HTMLTextAreaElement).value).toBe("Typed meanwhile");
  });

  it("fills an empty look without asking, and the words save", async () => {
    const w = mountLook(look({ reference_images: ["a.webp"] }));
    await button(w)!.trigger("click");
    await vi.advanceTimersByTimeAsync(2500);
    await flushPromises();
    expect(mocks.confirm).not.toHaveBeenCalled();
    expect(mocks.update).toHaveBeenCalledWith("l1", { title: "Storybook gouache" });
  });

  it("spends nothing when the credit gate refuses", async () => {
    mocks.canSpend.mockReturnValue(false);
    const w = mountLook(look({ reference_images: ["a.webp"] }));
    await button(w)!.trigger("click");
    expect(mocks.describe).not.toHaveBeenCalled();
  });
});
