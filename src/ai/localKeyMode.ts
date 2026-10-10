import { until } from "@vueuse/core";
import { localKeyModeChosen } from "@/lib/localKeyVault";
import { useCampaignStore } from "@/stores/campaign";
import { localImageChoice } from "@/ai/providers";

/*
 * BYOK local mode: the DM keeps their own provider key on this device and the
 * browser calls the provider with it, so the key never reaches our servers.
 *
 * The choice is respected whenever it can be honoured, and only then. If this
 * device cannot hand the key over (storage blocked, the vault in IndexedDB
 * unreadable, the ciphertext no longer decrypting) the generation runs on the
 * server path instead, on the campaign's server-held key or credits, rather
 * than stopping on "No API key configured" for a key the DM did store (#1043).
 * Every generator asks here; none reads the flag itself. The flag and
 * `localKeyModeChosen` live in `localKeyVault.ts`, so the campaign store can
 * read them without an import cycle through this module.
 */
/** Waits out a decryption in flight, so a generation started at boot does not take the server path for a key still arriving. */
async function settledKeys(): Promise<ReturnType<typeof useCampaignStore>> {
  const store = useCampaignStore();
  if (store.providerKeysLoading) await until(() => store.providerKeysLoading).toBe(false);
  return store;
}

/** Text: local when the DM chose it and holds a text key that decrypted. */
export async function textRunsOnLocalKey(): Promise<boolean> {
  if (!localKeyModeChosen()) return false;
  const store = await settledKeys();
  return !!(store.decryptedOpenAiKey || store.decryptedAnthropicKey || store.decryptedGeminiKey);
}

/** Images: local when the DM chose it and holds an image key (OpenAI or Gemini) that decrypted. */
export async function imagesRunOnLocalKey(): Promise<boolean> {
  if (!localKeyModeChosen()) return false;
  await settledKeys();
  return localImageChoice() !== null;
}
