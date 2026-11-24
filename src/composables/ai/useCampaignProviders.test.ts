import { beforeEach, describe, expect, it, vi } from "vitest";
import { computed, reactive, ref } from "vue";
import type { ProviderConfigRow } from "./useProviderConfig";

const store = reactive({
  activeCampaign: { image_provider: null as string | null },
});
const rows = ref<ProviderConfigRow[]>([]);
const loaded = ref(false);

vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => store }));
vi.mock("@/composables/ai/useProviderConfig", () => ({
  useProviderConfig: () => ({
    query: { data: computed(() => (loaded.value ? rows.value : undefined)) },
    rows,
    textMultiplierFor: (p: string) => rows.value.find((r) => r.provider === p)?.text_multiplier ?? 1,
    imageMultiplierFor: (p: string) => rows.value.find((r) => r.provider === p)?.image_multiplier ?? 1,
  }),
}));

const { useCampaignProviders } = await import("./useCampaignProviders");

function row(provider: string, over: Partial<ProviderConfigRow>): ProviderConfigRow {
  return {
    provider,
    text_model: null,
    fast_text_model: null,
    image_model: null,
    text_multiplier: null,
    image_multiplier: null,
    audio_multiplier: null,
    text_enabled: false,
    image_enabled: false,
    ...over,
  };
}

beforeEach(() => {
  rows.value = [];
  loaded.value = false;
  store.activeCampaign.image_provider = "gemini";
});

describe("useCampaignProviders", () => {
  it("has no price until provider_config loads, rather than pricing at 1.0 and jumping", () => {
    const { textCredits, imageCredits, textProvider } = useCampaignProviders();
    expect(textProvider.value).toBeNull();
    expect(textCredits(2)).toBeNull();
    expect(imageCredits(2)).toBeNull();

    // The rows are already in hand, but the config has not loaded: still no price.
    rows.value = [
      row("openai", { text_model: "gpt-6-luna", text_enabled: true, text_multiplier: 1.5 }),
      row("gemini", { image_enabled: true, image_multiplier: 3.8 }),
    ];
    expect(textProvider.value).toBeNull();
    expect(textCredits(2)).toBeNull();
    loaded.value = true;
    expect(textCredits(2)).toBe(3);
    expect(imageCredits(1)).toBe(4);
  });

  it("prices images on the Quick provider the campaign chose", () => {
    rows.value = [
      row("openai", { image_enabled: true, image_multiplier: 1 }),
      row("gemini", { image_enabled: true, image_multiplier: 3.8 }),
    ];
    loaded.value = true;
    const { imageProvider, imageCredits } = useCampaignProviders();
    expect(imageProvider.value).toBe("gemini");
    expect(imageCredits(1)).toBe(4);
  });

  it("falls back to the other image provider when the chosen one is switched off, and prices that one", () => {
    rows.value = [
      row("openai", { image_enabled: true, image_multiplier: 1 }),
      row("gemini", { image_enabled: false, image_multiplier: 3.8 }),
    ];
    loaded.value = true;
    const { imageProvider, imageCredits } = useCampaignProviders();
    expect(imageProvider.value).toBe("openai");
    expect(imageCredits(2)).toBe(2);
  });

  it("has no text provider when the admin offers none, so nothing is priced on a guess", () => {
    rows.value = [row("openai", { text_enabled: false })];
    loaded.value = true;
    const { textProvider, textCredits } = useCampaignProviders();
    expect(textProvider.value).toBeNull();
    expect(textCredits(2)).toBeNull();
  });
});
