import { supabase } from "@/lib/supabase";
import { edgeErrorMessage } from "@edge-shared/edgeError.ts";
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
 * Enhance is served there too, but answers in prose: see `generateProseText`.
 */
export type EntityTextGenerator =
  | "spell" | "monster" | "item" | "faction"
  // Epic #910
  | "feature" | "deity" | "species" | "background"
  | "custom_class" | "custom_subclass" | "class_feature"
  | "custom_rule" | "recipe" | "calendar_event" | "room" | "quest_beat"
  | "puzzle";

const LOCAL_MODE_KEY = "grimoire_key_local_mode";

function isLocalMode(): boolean {
  return typeof localStorage !== "undefined" && localStorage.getItem(LOCAL_MODE_KEY) === "local";
}

export interface EntityTextRequest {
  generator: EntityTextGenerator;
  campaignId: string;
  /** The campaign's setting; null when the DM never wrote one. */
  settingPrompt: string | null;
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
  if (!isLocalMode()) return invokeServer<T>(request);
  const { content, provenance } = await completeLocally(request);
  const result = JSON.parse(content) as T;
  result.ai_provenance = provenance;
  return result;
}

export type ProseTextGenerator = "text_enhancement";

export interface ProseTextRequest extends Omit<EntityTextRequest, "generator"> {
  generator: ProseTextGenerator;
}

/**
 * The same call for a generator that answers in Markdown rather than JSON:
 * Enhance (#992), which rewrites a selection in place. Credits through the
 * server by default, the browser-vault key in local mode, like the rest.
 */
export async function generateProseText(request: ProseTextRequest): Promise<string> {
  if (isLocalMode()) return (await completeLocally(request)).content.trim();
  const { content } = await invokeServer<{ content: string }>(request);
  return content;
}

async function invokeServer<T>(request: EntityTextRequest | ProseTextRequest): Promise<T> {
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

/** Mirrors GENERATORS in generate-entity-text: Enhance kept its historical reason. */
function ledgerReason(generator: EntityTextGenerator | ProseTextGenerator): string {
  return generator === "text_enhancement" ? generator : `${generator}_generation`;
}

async function completeLocally(
  request: EntityTextRequest | ProseTextRequest,
): Promise<{ content: string; provenance: AiProvenance }> {
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

  const reason = ledgerReason(request.generator);
  const format = request.generator === "text_enhancement" ? "text" : "json";
  const { content, usage } = await textProvider.complete(systemContent, userContent, format);
  logUsage({ reason, textUsage: usage });
  return { content, provenance: buildAiProvenance(reason, usage.provider, usage.model) };
}
