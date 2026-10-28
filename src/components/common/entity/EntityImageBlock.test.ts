import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import EntityImageBlock from "./EntityImageBlock.vue";
import AppButton from "@/components/common/controls/AppButton.vue";

/**
 * Covers the cutout-slot transparency warning (#917 story 2) and the
 * "Cut out from picture" button (#917 story 5), the AI picture button and the
 * Mini entry point. The focal point and upload are the child components' own and
 * are stubbed out here.
 */

const routerPush = vi.fn();
vi.mock("vue-router", () => ({ useRouter: () => ({ push: routerPush }) }));
const campaignMock = { isAiEnabled: false, decryptedOpenAiKey: null as string | null };
vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => campaignMock,
}));
const imageGenerateMock = vi.fn();
vi.mock("@/ai/useEntityImageGeneration", () => ({
  useEntityImageGeneration: () => ({
    isGenerating: { value: false },
    error: { value: null },
    generate: imageGenerateMock,
  }),
}));
const cutoutGenerateMock = vi.fn();
vi.mock("@/ai/useCutoutGeneration", () => ({
  useCutoutGeneration: () => ({
    isGenerating: { value: false },
    error: { value: null },
    generate: cutoutGenerateMock,
  }),
}));
vi.mock("@/composables/ai/useAiCredits", () => ({ useAiCredits: () => ({ costOf: () => 1 }) }));
const requireCreditsMock = vi.fn(() => true);
vi.mock("@/composables/ai/useOutOfCredits", () => ({ useOutOfCredits: () => ({ requireCredits: requireCreditsMock }) }));
vi.mock("@/composables/ai/useCampaignProviders", async () => {
  const { ref } = await import("vue");
  return {
    useCampaignProviders: () => ({
      textProvider: ref("openai"),
      textIsByok: ref(false),
      textMultiplier: ref(1), textCredits: (base: number) => Math.ceil(base),
      imageProvider: ref("openai"),
      imageIsByok: ref(false),
      imageMultiplier: ref(1), imageCredits: (base: number) => Math.ceil(base),
    }),
  };
});
vi.mock("@/composables/ai/useProviderConfig", () => ({
  useProviderConfig: () => ({ imageMultiplierFor: () => 1 }),
}));
const simulacrumVisible = { value: false };
vi.mock("@/composables/simulacrum/useSimulacrumConfig", () => ({
  useSimulacrumConfig: () => ({ isVisible: simulacrumVisible }),
}));

const hasTransparencyMock = vi.fn();
vi.mock("@/lib/mediaConvert", () => ({
  imageHasTransparency: (url: string) => hasTransparencyMock(url),
}));

const WARNING_TEXT = "This image has no transparent background, so it will print as a rectangle on the page.";

function mountBlock(props: Record<string, unknown> = {}) {
  return mount(EntityImageBlock, {
    props: { bucket: "monster-images", modelValue: null, ...props },
    global: {
      stubs: {
        ImageUpload: true,
        SegmentedControl: true,
        AppButton: true,
        GenerationCostBadge: true,
        VitruvianIcon: true,
      },
    },
  });
}

describe("EntityImageBlock — cutout transparency warning (#917 story 2)", () => {
  beforeEach(() => {
    hasTransparencyMock.mockReset();
  });

  it("never checks when expectTransparency is off", async () => {
    hasTransparencyMock.mockResolvedValue(false);
    const wrapper = mountBlock({ modelValue: "https://x/img.webp" });
    await flushPromises();
    expect(hasTransparencyMock).not.toHaveBeenCalled();
    expect(wrapper.text()).not.toContain(WARNING_TEXT);
  });

  it("shows the caption when the check resolves a definite false", async () => {
    hasTransparencyMock.mockResolvedValue(false);
    const wrapper = mountBlock({ modelValue: "https://x/img.webp", expectTransparency: true });
    await flushPromises();
    expect(hasTransparencyMock).toHaveBeenCalledWith("https://x/img.webp");
    expect(wrapper.text()).toContain(WARNING_TEXT);
  });

  it("shows no caption when the check resolves true", async () => {
    hasTransparencyMock.mockResolvedValue(true);
    const wrapper = mountBlock({ modelValue: "https://x/img.webp", expectTransparency: true });
    await flushPromises();
    expect(wrapper.text()).not.toContain(WARNING_TEXT);
  });

  it("shows no caption when the check could not run (null)", async () => {
    hasTransparencyMock.mockResolvedValue(null);
    const wrapper = mountBlock({ modelValue: "https://x/img.webp", expectTransparency: true });
    await flushPromises();
    expect(wrapper.text()).not.toContain(WARNING_TEXT);
  });

  it("shows no caption when there is no image yet", async () => {
    hasTransparencyMock.mockResolvedValue(false);
    const wrapper = mountBlock({ modelValue: null, expectTransparency: true });
    await flushPromises();
    expect(hasTransparencyMock).not.toHaveBeenCalled();
    expect(wrapper.text()).not.toContain(WARNING_TEXT);
  });

  it("ignores a stale result from a check that resolves after the url has already moved on", async () => {
    let resolveFirst: (value: boolean | null) => void = () => {};
    hasTransparencyMock.mockImplementationOnce(
      () => new Promise<boolean | null>((resolve) => { resolveFirst = resolve; }),
    );
    hasTransparencyMock.mockResolvedValueOnce(true);

    const wrapper = mountBlock({ modelValue: "https://x/first.webp", expectTransparency: true });
    await flushPromises();

    // Swap the url before the first check resolves — the second (later) url's
    // own check comes back true (no warning) first.
    await wrapper.setProps({ modelValue: "https://x/second.webp" });
    await flushPromises();
    expect(wrapper.text()).not.toContain(WARNING_TEXT);

    // The stale first check now resolves false — it must not resurrect the
    // warning for a url that's no longer current.
    resolveFirst(false);
    await flushPromises();
    expect(wrapper.text()).not.toContain(WARNING_TEXT);
  });
});

describe('EntityImageBlock — "Cut out from picture" (#917 story 5)', () => {
  // None of these tests set aiKind/miniSource, so the cutout button — when
  // shown at all — is the only AppButton EntityImageBlock renders. A stub
  // never renders slot content, so it can't be found by its label text.
  function cutoutButton(wrapper: ReturnType<typeof mountBlock>) {
    return wrapper.findAllComponents(AppButton).at(0);
  }

  beforeEach(() => {
    campaignMock.isAiEnabled = true;
    campaignMock.decryptedOpenAiKey = null;
    cutoutGenerateMock.mockReset();
  });

  it("is absent without a cutoutFrom prop", () => {
    const wrapper = mountBlock();
    expect(cutoutButton(wrapper)).toBeUndefined();
  });

  it("is absent when the campaign has AI disabled, even with cutoutFrom set", () => {
    campaignMock.isAiEnabled = false;
    const wrapper = mountBlock({ cutoutFrom: { table: "monsters", id: "m1", hasPicture: true } });
    expect(cutoutButton(wrapper)).toBeUndefined();
  });

  it("is disabled with a tooltip when the entity has no picture yet", () => {
    const wrapper = mountBlock({ cutoutFrom: { table: "monsters", id: "m1", hasPicture: false } });
    const button = cutoutButton(wrapper)!;
    expect(button.props("disabled")).toBe(true);
    expect(button.props("tooltip")).toBe("Add a picture first");
  });

  it("is enabled with no tooltip once there is a picture", () => {
    const wrapper = mountBlock({ cutoutFrom: { table: "monsters", id: "m1", hasPicture: true } });
    const button = cutoutButton(wrapper)!;
    expect(button.props("disabled")).toBe(false);
    expect(button.props("tooltip")).toBeUndefined();
  });

  it("generates via the monsters table/id and emits the returned url on success", async () => {
    cutoutGenerateMock.mockResolvedValue("https://cdn.example/monster-images/u1/cutout.webp");
    const wrapper = mountBlock({ cutoutFrom: { table: "monsters", id: "m1", hasPicture: true } });

    await cutoutButton(wrapper)!.vm.$emit("click");
    await flushPromises();

    expect(cutoutGenerateMock).toHaveBeenCalledWith({ table: "monsters", id: "m1", bucket: "monster-images" });
    expect(wrapper.emitted("update:modelValue")).toEqual([["https://cdn.example/monster-images/u1/cutout.webp"]]);
  });

  it("emits nothing when generation fails", async () => {
    cutoutGenerateMock.mockResolvedValue(null);
    const wrapper = mountBlock({ cutoutFrom: { table: "npcs", id: "n1", hasPicture: true } });

    await cutoutButton(wrapper)!.vm.$emit("click");
    await flushPromises();

    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
  });
});

describe("EntityImageBlock — Mini entry point", () => {
  // The Mini button starts a paid generation flow, so it follows the AI switch.
  const miniProps = { miniSource: { table: "npcs", id: "n1" }, modelValue: "https://cdn.test/a.webp" };
  const miniButton = (wrapper: ReturnType<typeof mountBlock>) =>
    wrapper.findAllComponents(AppButton).find((b) => b.props("label") === "Mini");

  beforeEach(() => {
    simulacrumVisible.value = true;
  });

  it("shows when AI is on", () => {
    campaignMock.isAiEnabled = true;
    expect(miniButton(mountBlock(miniProps))).toBeDefined();
  });

  it("is hidden when the campaign has AI disabled", () => {
    campaignMock.isAiEnabled = false;
    expect(miniButton(mountBlock(miniProps))).toBeUndefined();
  });
});

describe("EntityImageBlock — AI picture button", () => {
  const aiProps = { aiKind: "monster", aiContext: "A hollow-eyed owlbear", aiTargetId: "m1" };
  const aiButton = (wrapper: ReturnType<typeof mountBlock>) => wrapper.findComponent(AppButton);

  beforeEach(() => {
    campaignMock.isAiEnabled = true;
    simulacrumVisible.value = false;
    imageGenerateMock.mockReset();
    requireCreditsMock.mockReset().mockReturnValue(true);
    routerPush.mockReset();
  });

  it.each([
    ["no aiKind", { aiContext: "x" }, true],
    ["a blank context", { aiKind: "monster", aiContext: "   " }, true],
    ["the block disabled", { ...aiProps, disabled: true }, true],
    ["AI switched off for the campaign", aiProps, false],
  ])("offers no button with %s", (_why, props, aiOn) => {
    campaignMock.isAiEnabled = aiOn;
    expect(mountBlock(props).findAllComponents(AppButton)).toHaveLength(0);
  });

  it("generates from the context and sets the new picture centred", async () => {
    imageGenerateMock.mockResolvedValue("https://cdn.example/owlbear.webp");
    const wrapper = mountBlock(aiProps);
    await aiButton(wrapper).vm.$emit("click");
    await flushPromises();

    expect(imageGenerateMock).toHaveBeenCalledWith({ kind: "monster", context: "A hollow-eyed owlbear", targetId: "m1" });
    expect(wrapper.emitted("update:modelValue")).toEqual([["https://cdn.example/owlbear.webp"]]);
    expect(wrapper.emitted("update:focalPoint")).toEqual([[{ x: 50, y: 50 }]]);
  });

  it("changes nothing when the generation fails", async () => {
    imageGenerateMock.mockResolvedValue(null);
    const wrapper = mountBlock(aiProps);
    await aiButton(wrapper).vm.$emit("click");
    await flushPromises();

    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
    expect(wrapper.emitted("update:focalPoint")).toBeUndefined();
  });

  it("does not spend anything when the DM is out of credits", async () => {
    requireCreditsMock.mockReturnValue(false);
    const wrapper = mountBlock(aiProps);
    await aiButton(wrapper).vm.$emit("click");
    await flushPromises();

    expect(imageGenerateMock).not.toHaveBeenCalled();
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
  });

  it("sends no target when the entity is not saved yet", async () => {
    imageGenerateMock.mockResolvedValue(null);
    const wrapper = mountBlock({ aiKind: "monster", aiContext: "x" });
    await aiButton(wrapper).vm.$emit("click");
    await flushPromises();

    expect(imageGenerateMock).toHaveBeenCalledWith({ kind: "monster", context: "x", targetId: null });
  });

  it("the Mini button opens the forge for this record, only once there is a picture to forge from", async () => {
    simulacrumVisible.value = true;
    const miniSource = { table: "npcs" as const, id: "n1" };
    const without = mountBlock({ miniSource, modelValue: null });
    expect(without.findAllComponents(AppButton).find((b) => b.props("label") === "Mini")).toBeUndefined();

    const withPicture = mountBlock({ miniSource, modelValue: "https://cdn.test/a.webp" });
    await withPicture.findAllComponents(AppButton).find((b) => b.props("label") === "Mini")!.vm.$emit("click");
    expect(routerPush).toHaveBeenCalledWith({ path: "/minis/forge", query: { source: "npcs", id: "n1" } });
  });

  it("the Mini button is hidden when the Mini feature is not visible to this account", () => {
    simulacrumVisible.value = false;
    const wrapper = mountBlock({ miniSource: { table: "npcs", id: "n1" }, modelValue: "https://cdn.test/a.webp" });
    expect(wrapper.findAllComponents(AppButton)).toHaveLength(0);
  });
});
