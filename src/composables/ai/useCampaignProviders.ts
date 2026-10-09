/**
 * Which provider the active campaign's generations run on, so a price shown
 * before a generation is the price the server will charge.
 *
 * The rule is `chooseTextProvider` / `chooseImageProvider` in
 * supabase/functions/_shared/providerChoice.ts, the same functions the server's
 * resolvers call; this only feeds them the campaign and the admin's config.
 * The client cannot see platform keys, so it passes every provider as having
 * one; the server answers 422 when that is not so.
 *
 * **A price is null until it is known**: before provider_config loads, and
 * when the admin offers nothing the campaign could use. `GenerationCostBadge`
 * shows nothing for a null price and `requireCredits` refuses it, so no
 * control prices on a guess and then jumps, or sends a request the server will
 * only answer with "not available".
 */
import { computed } from "vue";
import { useCampaignStore } from "@/stores/campaign";
import { useProviderConfig } from "@/composables/ai/useProviderConfig";
import { wholeCredits } from "@edge-shared/credit-math.ts";
import {
  chooseImageProvider,
  chooseTextProvider,
  type ImageProviderKey,
} from "@edge-shared/providerChoice.ts";

export type { ImageProviderKey, TextProviderKey } from "@edge-shared/providerChoice.ts";

/**
 * What the DM is asked instead of a model name. Quick is the provider that
 * answers in seconds, Detailed the one that takes minutes; why they differ is
 * not the DM's concern.
 */
export const IMAGE_SPEED_LABEL: Record<ImageProviderKey, string> = {
  gemini: "Quick",
  openai: "Detailed",
};

/** The client cannot see platform keys; the server re-checks. */
const ASSUME_PLATFORM_KEYS = { openai: true, anthropic: true, gemini: true } as const;

export function useCampaignProviders() {
  const campaign = useCampaignStore();
  const { rows, textMultiplierFor, imageMultiplierFor } = useProviderConfig();

  const ownKeys = computed(() => ({
    openai: !!campaign.decryptedOpenAiKey,
    anthropic: !!campaign.decryptedAnthropicKey,
    gemini: !!campaign.decryptedGeminiKey,
  }));
  const configs = computed(() => Object.fromEntries(rows.value.map((r) => [r.provider, r])));

  const text = computed(() =>
    chooseTextProvider({
      chosen: campaign.activeCampaign?.text_provider,
      ownKeys: ownKeys.value,
      platformKeys: ASSUME_PLATFORM_KEYS,
      configs: configs.value,
    }),
  );
  const image = computed(() =>
    chooseImageProvider({
      chosen: campaign.activeCampaign?.image_provider,
      ownKeys: ownKeys.value,
      platformKeys: ASSUME_PLATFORM_KEYS,
      configs: configs.value,
    }),
  );

  const textMultiplier = computed(() => (text.value ? textMultiplierFor(text.value.provider) : null));
  const imageMultiplier = computed(() => (image.value ? imageMultiplierFor(image.value.provider) : null));

  return {
    /** Null until provider_config loads, or when the admin offers nothing usable. */
    textProvider: computed(() => text.value?.provider ?? null),
    textIsByok: computed(() => text.value?.isByok === true),
    /** Null exactly when `textProvider` is. */
    textMultiplier,
    imageProvider: computed(() => image.value?.provider ?? null),
    imageIsByok: computed(() => image.value?.isByok === true),
    /** Null exactly when `imageProvider` is. */
    imageMultiplier,
    /** `base` credits on the campaign's text provider, rounded as the server rounds; null while unknown. */
    textCredits: (base: number): number | null =>
      textMultiplier.value === null ? null : wholeCredits(base * textMultiplier.value),
    /** `base` credits on the campaign's image provider, rounded as the server rounds; null while unknown. */
    imageCredits: (base: number): number | null =>
      imageMultiplier.value === null ? null : wholeCredits(base * imageMultiplier.value),
  };
}
