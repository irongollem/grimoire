import { beforeEach, describe, expect, it, vi } from "vitest";
import { computed, reactive, ref } from "vue";
import type { ProviderConfigRow } from "./useProviderConfig";

const store = reactive({
  activeCampaign: { text_provider: null as string | null, image_provider: null as string | null },
  decryptedOpenAiKey: null as string | null,
  decryptedAnthropicKey: null as string | null,
  decryptedGeminiKey: null as string | null,
  providerKeysLoading: false,
});
const rows = ref<ProviderConfigRow[]>([]);
const loaded = ref(false);
const isPro = ref(true);
const planLoading = ref(false);

vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => store }));
vi.mock("@/composables/ai/useProviderConfig", () => ({
  useProviderConfig: () => ({
    query: { data: computed(() => (loaded.value ? rows.value : undefined)) },
    rows,
    textMultiplierFor: (p: string) => rows.value.find((r) => r.provider === p)?.text_multiplier ?? 1,
    imageMultiplierFor: (p: string) => rows.value.find((r) => r.provider === p)?.image_multiplier ?? 1,
  }),
}));

vi.mock("@/composables/billing/useSubscription", () => ({
  useSubscription: () => ({ isPro, isLoading: planLoading }),
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
  isPro.value = true;
  planLoading.value = false;
  store.providerKeysLoading = false;
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
    loaded.value = true;
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

  it("does not let a key stored before a downgrade promise free generations", () => {
    store.decryptedGeminiKey = "g-own";
    isPro.value = false;
    rows.value = [row("openai", { text_model: "gpt-5.6-luna", text_enabled: true })];
    loaded.value = true;
    const { textIsByok, textProvider } = useCampaignProviders();
    expect(textProvider.value).toBe("openai");
    expect(textIsByok.value).toBe(false);
  });

  it("resolves nothing for a stored key while the plan is loading", () => {
    store.decryptedGeminiKey = "g-own";
    planLoading.value = true;
    loaded.value = true;
    const { textProvider, imageProvider } = useCampaignProviders();
    expect(textProvider.value).toBeNull();
    expect(imageProvider.value).toBeNull();
  });

  it("resolves nothing while the campaign's keys are still decrypting", () => {
    store.providerKeysLoading = true;
    rows.value = [row("openai", { text_model: "gpt-5.6-luna", text_enabled: true })];
    loaded.value = true;
    const { textProvider, textCredits } = useCampaignProviders();
    expect(textProvider.value).toBeNull();
    expect(textCredits(2)).toBeNull();
    store.providerKeysLoading = false;
    expect(textProvider.value).toBe("openai");
  });

  it("does not wait on decrypting keys for an account whose plan ignores them", () => {
    store.providerKeysLoading = true;
    isPro.value = false;
    rows.value = [row("openai", { text_model: "gpt-5.6-luna", text_enabled: true })];
    loaded.value = true;
    const { textProvider } = useCampaignProviders();
    expect(textProvider.value).toBe("openai");
  });
});
