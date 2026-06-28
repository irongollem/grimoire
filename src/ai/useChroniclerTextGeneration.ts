import { ref } from "vue";
import { supabase } from "@/lib/supabase";
import { edgeErrorMessage } from "@/lib/edgeError";
import { getTextProvider } from "./providers";
import { useCampaignStore } from "@/stores/campaign";
import { wrapUserInput } from "./utils";
import { parseSceneEntities, type ResolvedEntity } from "./useChroniclerImageGeneration";
import type { Npc } from "@/types/npc.types";
import type { Monster } from "@/types/monster.types";
import type { PartyMember } from "@/types/party.types";
import { logUsage } from "@/composables/useAiCredits";
import { fetchSystemPrompt } from "./systemPrompts";

export type ChroniclerTone = "dramatic" | "humorous" | "mysterious" | "epic";

export const CHRONICLER_TONES: { value: ChroniclerTone; label: string }[] = [
  { value: "dramatic",   label: "Dramatic"   },
  { value: "humorous",   label: "Humorous"   },
  { value: "mysterious", label: "Mysterious" },
  { value: "epic",       label: "Epic"       },
] as const;

const TONE_INSTRUCTIONS: Record<ChroniclerTone, string> = {
  dramatic:   "Write with dramatic tension — build toward emotional peaks, use contrast and stakes.",
  humorous:   "Write with wit and levity — find the comedy in chaos, keep it fun.",
  mysterious: "Write with an air of mystery — withhold information, use shadow and implication.",
  epic:       "Write in a grand epic style — heroic deeds, soaring language, fate-altering consequences.",
};

const LOCAL_MODE_KEY = "grimoire_key_local_mode";

function buildEntityDescriptions(entities: ResolvedEntity[]): string {
  if (entities.length === 0) return "No specific entities mentioned.";
  return entities
    .map((e) => `- ${e.label}${e.textDescription && e.textDescription !== e.label ? `: ${e.textDescription}` : ""}`)
    .join("\n");
}

/** Pre-process AI output: replace [[scene: ...]] with styled blockquotes. */
export function preprocessChronicleMarkdown(md: string): string {
  return md.replace(
    /^\[\[scene:\s*(.+?)\]\]\s*$/gm,
    (_, prompt: string) => `> 🖼️ **Illustration suggestion:** ${prompt.trim()}`,
  );
}

export function useChroniclerTextGeneration() {
  const isGenerating = ref(false);
  const error = ref<string | null>(null);
  const campaign = useCampaignStore();

  async function generate(params: {
    rawText: string;
    tone: ChroniclerTone;
    npcs: Npc[] | undefined;
    monsters: Monster[] | undefined;
    partyMembers: PartyMember[] | undefined;
  }): Promise<string> {
    const { rawText, tone, npcs, monsters, partyMembers } = params;
    const entities = parseSceneEntities(rawText, npcs, monsters, partyMembers);
    const settingPrompt = campaign.activeCampaign?.ai_setting_prompt ?? "No setting configured.";
    const campaignId = campaign.activeCampaign?.id;

    isGenerating.value = true;
    error.value = null;

    try {
      const isLocalMode =
        typeof localStorage !== "undefined" &&
        localStorage.getItem(LOCAL_MODE_KEY) === "local";

      if (!isLocalMode && campaignId) {
        return await generateServerSide({ rawText, tone, entities, campaignId });
      }
      return await generateClientSide({ rawText, tone, entities, settingPrompt });
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Generation failed.";
      throw e;
    } finally {
      isGenerating.value = false;
    }
  }

  async function generateServerSide(params: {
    rawText: string;
    tone: ChroniclerTone;
    entities: ResolvedEntity[];
    campaignId: string;
  }): Promise<string> {
    const { rawText, tone, entities, campaignId } = params;

    const tone_instruction = TONE_INSTRUCTIONS[tone];
    const entity_descriptions = entities
      .map((e) => (e.textDescription && e.textDescription !== e.label ? `${e.label}: ${e.textDescription}` : e.label))
      .filter(Boolean);

    const { data, error: fnError } = await supabase.functions.invoke("generate-chronicle-text", {
      body: { campaign_id: campaignId, raw_text: rawText, tone_instruction, entity_descriptions },
    });

    if (fnError) throw new Error(await edgeErrorMessage(fnError));
    if (data?.error) throw new Error(data.error);
    return (data as { chronicle: string }).chronicle;
  }

  async function generateClientSide(params: {
    rawText: string;
    tone: ChroniclerTone;
    entities: ResolvedEntity[];
    settingPrompt: string;
  }): Promise<string> {
    const { rawText, tone, entities, settingPrompt } = params;

    const basePrompt = await fetchSystemPrompt("chronicle_text");
    if (!basePrompt) throw new Error("Chronicle text prompt not configured.");

    const systemPrompt = basePrompt
      .replace("{entities}", buildEntityDescriptions(entities))
      .replace("{settingPrompt}", settingPrompt)
      .replace("{toneInstruction}", TONE_INSTRUCTIONS[tone]);

    const provider = getTextProvider();
    const { content, usage: textUsage } = await provider.complete(systemPrompt, wrapUserInput(rawText));
    logUsage({ reason: "chronicler_text", textUsage });
    const parsed = JSON.parse(content) as { chronicle?: string };
    return parsed.chronicle ?? content;
  }

  return { isGenerating, error, generate };
}
