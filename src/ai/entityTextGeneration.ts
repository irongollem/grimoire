import { supabase } from "@/lib/supabase";
import { edgeErrorMessage } from "@edge-shared/edgeError.ts";
import type { AiProvenance } from "@/ai/provenance";

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

export interface EntityTextRequest {
  generator: EntityTextGenerator;
  campaignId: string;
  prompt: string;
  /** The panel's structured fields, one line each ("Level: 3"). */
  constraints: string[];
}

/**
 * Run an entity generator's text call through the `generate-entity-text` edge
 * function (paid in credits) and return the model's JSON with the provenance
 * the server attached.
 */
export async function generateEntityText<T extends { ai_provenance?: AiProvenance }>(
  request: EntityTextRequest,
): Promise<T> {
  return invokeServer<T>(request);
}

export type ProseTextGenerator = "text_enhancement";

export interface ProseTextRequest extends Omit<EntityTextRequest, "generator"> {
  generator: ProseTextGenerator;
}

/**
 * The same call for a generator that answers in Markdown rather than JSON:
 * Enhance (#992), which rewrites a selection in place. Paid in credits.
 */
export async function generateProseText(request: ProseTextRequest): Promise<string> {
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
