import { beforeEach, describe, expect, it, vi } from "vitest";
import { reactive, ref } from "vue";
import type { ProviderConfigRow } from "./useProviderConfig";

const store = reactive({
  activeCampaign: { text_provider: null as string | null, image_provider: null as string | null },
  decryptedOpenAiKey: null as string | null,
  decryptedAnthropicKey: null as string | null,
  decryptedGeminiKey: null as string | null,
});
const rows = ref<ProviderConfigRow[]>([]);

vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => store }));
vi.mock("@/composables/ai/useProviderConfig", () => ({
  useProviderConfig: () => ({
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
  store.decryptedOpenAiKey = null;
  store.decryptedGeminiKey = null;
  store.activeCampaign.text_provider = null;
  store.activeCampaign.image_provider = "gemini";
});

describe("useCampaignProviders", () => {
  it("has no price until provider_config loads, rather than pricing at 1.0 and jumping", () => {
    const { textCredits, imageCredits, textProvider } = useCampaignProviders();
    expect(textProvider.value).toBeNull();
    expect(textCredits(2)).toBeNull();
    expect(imageCredits(2)).toBeNull();

    rows.value = [
      row("openai", { text_model: "gpt-5.6-luna", text_enabled: true, text_multiplier: 1.5 }),
      row("gemini", { image_enabled: true, image_multiplier: 3.8 }),
    ];
    expect(textCredits(2)).toBe(3);
    expect(imageCredits(1)).toBe(4);
  });

  it("prices a DM's own key without waiting for the config", () => {
    store.decryptedGeminiKey = "g-own";
    const { textIsByok, textProvider, textCredits } = useCampaignProviders();
    expect(textProvider.value).toBe("gemini");
    expect(textIsByok.value).toBe(true);
    expect(textCredits(2)).not.toBeNull();
  });
});
