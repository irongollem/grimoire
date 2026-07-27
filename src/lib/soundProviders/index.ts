// Provider registry.
//
// Adding a library means writing one adapter and adding it here. Removing one —
// because its terms changed, its API was deprecated, or a commercial-use answer
// came back badly — means deleting a line, not unpicking the browser UI.
//
// Order matters: the first entry is the default tab.

import type { SoundProvider } from "./types";
import { freesoundProvider } from "./freesound";

export const SOUND_PROVIDERS: readonly SoundProvider[] = [freesoundProvider];

export function getProvider(id: string): SoundProvider | undefined {
  return SOUND_PROVIDERS.find((p) => p.id === id);
}

/**
 * The provider used when none is chosen. Falls back to the first registered
 * one rather than a hardcoded name, so removing a provider cannot leave the
 * default pointing at something that no longer exists.
 */
export function defaultProvider(): SoundProvider | undefined {
  return SOUND_PROVIDERS[0];
}

export type { SoundProvider, ProviderHit, ProviderLicense, ProviderSearchResult, ProviderSearchParams } from "./types";
export { FREESOUND_PROVIDER_ID } from "./freesound";
