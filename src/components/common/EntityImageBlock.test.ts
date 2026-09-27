import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import EntityImageBlock from "./EntityImageBlock.vue";

/**
 * Covers the cutout-slot transparency warning (#917 story 2) — every other
 * EntityImageBlock behaviour (AI generation, the Mini entry point, focal
 * point) is exercised indirectly through its callers (MonsterDetail etc.)
 * and stubbed out here.
 */

vi.mock("vue-router", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({ isAiEnabled: false, decryptedOpenAiKey: null }),
}));
vi.mock("@/ai/useEntityImageGeneration", () => ({
  useEntityImageGeneration: () => ({
    isGenerating: { value: false },
    error: { value: null },
    generate: vi.fn(),
  }),
}));
vi.mock("@/composables/ai/useAiCredits", () => ({ useAiCredits: () => ({ costOf: () => 1 }) }));
vi.mock("@/composables/ai/useOutOfCredits", () => ({ useOutOfCredits: () => ({ requireCredits: () => true }) }));
vi.mock("@/composables/ai/useProviderConfig", () => ({
  useProviderConfig: () => ({ imageMultiplierFor: () => 1 }),
}));
vi.mock("@/composables/simulacrum/useSimulacrumConfig", () => ({
  useSimulacrumConfig: () => ({ isVisible: { value: false } }),
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
