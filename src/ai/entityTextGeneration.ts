import { supabase } from "@/lib/supabase";
import { edgeErrorMessage } from "@/lib/edgeError";
import { buildCampaignContext, wrapUserInput } from "./utils";
import { fetchSystemPrompt, fetchRulesetContext } from "./systemPrompts";
import { getTextProvider } from "./providers";
import { logUsage } from "@/composables/ai/useAiCredits";
import { buildAiProvenance, type AiProvenance } from "@/ai/provenance";
import type { RulesetKey } from "@/types/ruleset.types";

/**
 * The generators served by the `generate-entity-text` edge function. Each is
 * one JSON text call keyed by its `ai_system_prompts` row; the art is a
 * separate step through `generateImage`, which has its own server path.
 */
export type EntityTextGenerator = "spell" | "monster" | "item" | "faction";

const LOCAL_MODE_KEY = "grimoire_key_local_mode";

function isLocalMode(): boolean {
  return typeof localStorage !== "undefined" && localStorage.getItem(LOCAL_MODE_KEY) === "local";
}

export interface EntityTextRequest {
  generator: EntityTextGenerator;
  campaignId: string;
  settingPrompt: string;
  ruleset: RulesetKey;
  prompt: string;
  /** The panel's structured fields, one line each ("Level: 3"). */
  constraints: string[];
}

/**
 * Run an entity generator's text call — through the server by default, or
 * straight to the provider with the browser-vault key in local mode — and
 * return the model's JSON with its provenance attached. The two paths build
 * the same prompt; the caller's post-processing is shared by both.
 */
export async function generateEntityText<T extends { ai_provenance?: AiProvenance }>(
  request: EntityTextRequest,
): Promise<T> {
  return isLocalMode() ? runLocal<T>(request) : runServer<T>(request);
}

async function runServer<T>(request: EntityTextRequest): Promise<T> {
  const { data, error } = await supabase.functions.invoke("generate-entity-text", {
    body: {
      campaign_id: request.campaignId,
      generator:   request.generator,
      prompt:      request.prompt,
      constraints: request.constraints,
    },
  });
  if (error) throw new Error(await edgeErrorMessage(error));
  if (data?.error) throw new Error(data.error);
  return data as T;
}

async function runLocal<T extends { ai_provenance?: AiProvenance }>(request: EntityTextRequest): Promise<T> {
  const textProvider = getTextProvider();
  const [basePrompt, rulesetContext] = await Promise.all([
    fetchSystemPrompt(request.generator),
    fetchRulesetContext(request.ruleset),
  ]);
  if (!basePrompt) throw new Error(`The ${request.generator} prompt is not configured.`);

  const systemContent = `${basePrompt}${rulesetContext ? `\n\n${rulesetContext}` : ""}${buildCampaignContext({
    setting: request.settingPrompt,
  })}`;
  const wrappedPrompt = wrapUserInput(request.prompt);
  const userContent = request.constraints.length
    ? `${wrappedPrompt}\n\nConstraints:\n${request.constraints.join("\n")}`
    : wrappedPrompt;

  const reason = `${request.generator}_generation`;
  const { content, usage } = await textProvider.complete(systemContent, userContent);
  const result = JSON.parse(content) as T;
  result.ai_provenance = buildAiProvenance(reason, usage.provider, usage.model);
  logUsage({ reason, textUsage: usage });
  return result;
}
