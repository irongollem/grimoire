// The speech services' keys as the functions that speak read them: the admin's, from `platform_api_keys`, read per
// request so a key set or cleared in Admin > Providers takes effect at once. Apart from `speech.ts` because the vault
// reads its key from the environment on import, and `speech.ts` is imported by tests that have no such environment.
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchPlatformKeys } from "./platform-keys.ts";
import { SPEECH_KEY_PROVIDERS, speechEnvFrom, type SpeechEnv } from "./speech.ts";

export async function loadSpeechEnv(admin: SupabaseClient): Promise<SpeechEnv> {
  return speechEnvFrom(await fetchPlatformKeys(admin, [...SPEECH_KEY_PROVIDERS]), (key) => Deno.env.get(key));
}
