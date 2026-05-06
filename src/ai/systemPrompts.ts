import { supabase } from "@/lib/supabase";

/**
 * Fetch a system prompt from the DB for local-mode (BYOK) generation.
 * Returns null on failure so callers can fall back to the bundled constant.
 */
export async function fetchSystemPrompt(generatorType: string): Promise<string | null> {
  try {
    const { data } = await supabase
      .from("ai_system_prompts")
      .select("content")
      .eq("generator_type", generatorType)
      .maybeSingle();
    return data?.content ?? null;
  } catch {
    return null;
  }
}

/**
 * Fetch the shared image style prompt from DB, falling back to the bundled constant.
 * Call this at generation time so admin edits take effect without a code deploy.
 */
export async function fetchImageBasePrompt(): Promise<string> {
  return (await fetchSystemPrompt("image_base")) ?? "";
}
