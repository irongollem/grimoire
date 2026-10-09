/**
 * Which provider a campaign's text or image generation runs on, and whether
 * the DM's own key pays for it. One rule, imported by both sides:
 *
 * - the server's `resolveTextProvider` (textGen.ts) and `resolveImageProvider`
 *   (imageGen.ts), which add the actual key and model to the answer;
 * - the client's `useCampaignProviders`, which prices a generation before it
 *   runs, and Campaign Settings → AI, which describes the choice to the DM.
 *
 * It was three copies until 9 Oct 2026, and they had already drifted: the
 * server required a platform key and the client did not, and Settings used a
 * third "enabled" rule, so a price, a caption and the provider that actually
 * ran could each disagree. Pure, with no imports, so the browser can load it.
 *
 * The client cannot see platform keys and passes every provider as having
 * one; the server answers 422 when that is not so.
 */

export type TextProviderKey = "openai" | "anthropic" | "gemini";
export type ImageProviderKey = "openai" | "gemini";

/**
 * The provider that answers when a platform-key text call has more than one
 * enabled, and the order in which a DM's own keys are tried: the first in this
 * order. Admin → Providers normally leaves one on.
 */
export const PLATFORM_TEXT_ORDER: readonly TextProviderKey[] = ["openai", "gemini", "anthropic"];

/**
 * Where an image falls back when the campaign's choice is switched off: the
 * first in this order. The choice is the DM's Quick / Detailed pick
 * (gemini / openai).
 */
export const PLATFORM_IMAGE_ORDER: readonly ImageProviderKey[] = ["openai", "gemini"];

/** `campaigns.image_provider` is nullable; a campaign that never picked renders Detailed. */
const DEFAULT_IMAGE_CHOICE: ImageProviderKey = "openai";

/** The provider_config columns that decide whether the admin offers text on a provider. */
export interface TextOffer {
  text_enabled?: boolean | null;
  text_model?: string | null;
}

/** The provider_config column that decides whether the admin offers images on a provider. */
export interface ImageOffer {
  image_enabled?: boolean | null;
}

/** Text needs a model as well as the switch: there is no code default to fall back to. */
export function textOffered(row: TextOffer | null | undefined): boolean {
  return row?.text_enabled === true && !!row.text_model;
}

/**
 * The switch alone. An empty `image_model` falls back to the provider's
 * DEFAULT_MODEL in imageGen.ts, so it does not take the provider off the menu.
 */
export function imageOffered(row: ImageOffer | null | undefined): boolean {
  return row?.image_enabled === true;
}

export interface ProviderChoice<K extends string> {
  provider: K;
  /** The campaign's own key pays; no credits are charged. */
  isByok: boolean;
}

type Has<K extends string> = Partial<Record<K, boolean>>;

/** Which providers a map of decrypted keys holds one for. */
export function keysPresent<K extends string>(keys: Partial<Record<K, string | null | undefined>>): Has<K> {
  return Object.fromEntries(Object.entries(keys).map(([k, v]) => [k, !!v])) as Has<K>;
}

/**
 * Text. A campaign holding its own key uses it: the one `chosen` names when
 * it holds that one, otherwise the first it holds. `chosen` only decides
 * between keys, which is all Campaign Settings asks it ("Your OpenAI key /
 * Your Gemini key"), and a null `chosen` (demo copies, campaigns never saved
 * since the column existed) is no reason to bill credits to a DM who brought
 * a key.
 *
 * Without a key the platform picks: the first provider the admin offers,
 * whatever `chosen` says. Honouring it there let a value left behind by a
 * cleared key route calls onto a provider the admin had switched off, at that
 * provider's multiplier (Gemini's is 3.8×).
 */
export function chooseTextProvider(args: {
  chosen: string | null | undefined;
  ownKeys: Has<TextProviderKey>;
  platformKeys: Has<TextProviderKey>;
  configs: Partial<Record<string, TextOffer | undefined>>;
}): ProviderChoice<TextProviderKey> | null {
  const chosen = PLATFORM_TEXT_ORDER.find((p) => p === args.chosen);
  const own = chosen && args.ownKeys[chosen] ? chosen : PLATFORM_TEXT_ORDER.find((p) => args.ownKeys[p]);
  if (own) return { provider: own, isByok: true };

  const platform = PLATFORM_TEXT_ORDER.find((p) => textOffered(args.configs[p]) && args.platformKeys[p]);
  return platform ? { provider: platform, isByok: false } : null;
}

/**
 * Images. The DM's Quick / Detailed pick stands when they hold its key or the
 * admin offers it. A pick the admin has since switched off falls back, to the
 * DM's own key for the other provider first and only then to the first
 * provider the admin offers, so a DM who brought a key never pays credits for
 * a fallback their key could have rendered.
 *
 * `pinned` is a caller that needs `chosen`'s capability (a transparent cutout,
 * the paper-doll sheet, a reference-image forge): it is not a campaign choice,
 * so the admin's switch, which governs that choice, does not apply, and there
 * is no fallback.
 */
export function chooseImageProvider(args: {
  chosen: string | null | undefined;
  ownKeys: Has<ImageProviderKey>;
  platformKeys: Has<ImageProviderKey>;
  configs: Partial<Record<string, ImageOffer | undefined>>;
  pinned?: boolean;
}): ProviderChoice<ImageProviderKey> | null {
  const choice = PLATFORM_IMAGE_ORDER.find((p) => p === (args.chosen ?? DEFAULT_IMAGE_CHOICE));
  if (choice && args.ownKeys[choice]) return { provider: choice, isByok: true };
  if (args.pinned) return choice && args.platformKeys[choice] ? { provider: choice, isByok: false } : null;
  if (choice && imageOffered(args.configs[choice]) && args.platformKeys[choice]) {
    return { provider: choice, isByok: false };
  }

  const own = PLATFORM_IMAGE_ORDER.find((p) => args.ownKeys[p]);
  if (own) return { provider: own, isByok: true };
  const platform = PLATFORM_IMAGE_ORDER.find((p) => imageOffered(args.configs[p]) && args.platformKeys[p]);
  return platform ? { provider: platform, isByok: false } : null;
}
