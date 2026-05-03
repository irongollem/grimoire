import { ref } from "vue";
import { getTextProvider } from "./providers";
import { useCampaignStore } from "@/stores/campaign";
import { parseSceneEntities, type ResolvedEntity } from "./useChroniclerImageGeneration";
import type { Npc } from "@/types/npc.types";
import type { Monster } from "@/types/monster.types";
import type { PartyMember } from "@/types/party.types";

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

const SYSTEM_PROMPT = `You are a chronicler for a tabletop RPG campaign. Your job is to transform raw, bullet-point session notes into an immersive, richly formatted narrative chronicle.

## Formatting rules
- Return the chronicle as Markdown (headings, bold, italic, blockquotes, bullet lists as appropriate).
- Use short dramatic paragraphs. Vary sentence length for rhythm.
- Headings (## or ###) may be used to divide scenes or acts if the notes span multiple beats.
- Do NOT invent events or characters not implied by the input.

## Image suggestions
- If a beat in the narrative would be greatly enriched by an illustration, insert a placeholder on its own line:
  [[scene: <short, vivid image-generation prompt for this moment>]]
- Use sparingly — at most one per major scene beat.
- The prompt inside [[scene:...]] should be self-contained and suitable for direct use with an image generator (no character names — describe visually instead).

## Entities
{entities}

## Campaign Setting
{settingPrompt}

## Tone
{toneInstruction}

Return a JSON object with a single key "chronicle" whose value is the full narrative as a markdown string.`;

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

    const systemPrompt = SYSTEM_PROMPT
      .replace("{entities}", buildEntityDescriptions(entities))
      .replace("{settingPrompt}", settingPrompt)
      .replace("{toneInstruction}", TONE_INSTRUCTIONS[tone]);

    isGenerating.value = true;
    error.value = null;
    try {
      const provider = getTextProvider();
      const result = await provider.complete(systemPrompt, rawText);
      const parsed = JSON.parse(result) as { chronicle?: string };
      return parsed.chronicle ?? result;
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Generation failed.";
      throw e;
    } finally {
      isGenerating.value = false;
    }
  }

  return { isGenerating, error, generate };
}
