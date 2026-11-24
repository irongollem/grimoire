/**
 * Which provider the active campaign's generations run on, so a price shown
 * before a generation is the price the server will charge.
 *
 * The rule is `chooseTextProvider` / `chooseImageProvider` in
 * supabase/functions/_shared/providerChoice.ts, the same functions the server's
 * resolvers call; this only feeds them the campaign and the admin's config.
 * The client cannot see platform keys, so it passes every provider as having
 * one; the server answers 422 when that is not so. Every generation is paid in
 * credits on the platform's keys, so nothing here depends on the account's plan.
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

export type { ImageProviderKey } from "@edge-shared/providerChoice.ts";

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
  const { query, rows, textMultiplierFor, imageMultiplierFor } = useProviderConfig();

  /**
   * Null until provider_config first loads; see chooseTextProvider /
   * chooseImageProvider. Read off the data, not `isSuccess`: a failed
   * background refetch turns the status to error but keeps the rows, and
   * those rows are still the admin's config.
   */
  const configs = computed(() =>
    query.data.value === undefined ? null : Object.fromEntries(rows.value.map((r) => [r.provider, r])),
  );

  const text = computed(() =>
    chooseTextProvider({ platformKeys: ASSUME_PLATFORM_KEYS, configs: configs.value }),
  );
  const image = computed(() =>
    chooseImageProvider({
      chosen: campaign.activeCampaign?.image_provider,
      platformKeys: ASSUME_PLATFORM_KEYS,
      configs: configs.value,
    }),
  );

  const textMultiplier = computed(() => (text.value ? textMultiplierFor(text.value.provider) : null));
  const imageMultiplier = computed(() => (image.value ? imageMultiplierFor(image.value.provider) : null));

  return {
    /** Null until provider_config loads, or when nothing usable is offered. */
    textProvider: computed(() => text.value?.provider ?? null),
    /** Null exactly when `textProvider` is. */
    textMultiplier,
    imageProvider: computed(() => image.value?.provider ?? null),
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
