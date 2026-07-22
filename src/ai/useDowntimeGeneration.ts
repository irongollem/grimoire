import { supabase } from "@/lib/supabase";
import { edgeErrorMessage } from "@/lib/edgeError";
import { buildCampaignContext, wrapUserInput } from "./utils";
import { createAiGenerationState, startAiQuotes, stopAiQuotes } from "./aiGenerationState";
import { registerAiGenerator, isAnyAiGenerating } from "./aiGeneratorRegistry";
import { getTextProvider } from "./providers";
import { fetchSystemPrompt, fetchRulesetContext } from "./systemPrompts";
import { logUsage } from "@/composables/useAiCredits";
import { useCampaignStore } from "@/stores/campaign";
import { useRuleset } from "@/composables/useRuleset";
import { seedFromAiResult } from "@/lib/downtimeAiSeed";
import type { DowntimeActivity, DowntimeSeed } from "@/types/downtime.types";

/**
 * AI outcome drafting for The Interlude (#486, Phase 3).
 *
 * Returns a `DowntimeSeed`, not a bespoke result type — so a drafted outcome
 * flows through the *same* resolve path as a deck seed (mint the reward, call
 * `resolve_downtime_draw`, apply the ticked effects) instead of a parallel one.
 * The model's raw JSON is laundered through `seedFromAiResult`, which drops
 * anything we can't honour.
 *
 * Text-only: the cards render procedural faces, so there is no illustration to
 * generate and no image credit is ever charged.
 */

const LOCAL_MODE_KEY = "grimoire_key_local_mode";

// ── Module-level singleton state ────────────────────────────────────────────
const _state = createAiGenerationState();

// Registered so the badge can show "Interlude" drafting, and — more importantly —
// so `isAnyAiGenerating` includes it and no two generators run at once.
registerAiGenerator({
  ..._state,
  label: "Interlude",
  // A drafted outcome has no page of its own; it lands on the board.
  entityRoute: () => "/downtime",
  // Deliberately a no-op: unlike every other generator, drafting is triggered
  // inline on the resolution board rather than from a global side panel, so the
  // DM is already looking at the only place there is to send them.
  openPanel: () => {},
});

export interface DowntimeDraftArgs {
  activity: DowntimeActivity;
  /** Whose interlude this is — the model addresses them by name. */
  characterName?: string;
  /** The DM's optional steer ("aim it at the Duke"). */
  steer?: string;
}

export function useDowntimeGeneration() {
  const campaign = useCampaignStore();
  const { ruleset } = useRuleset();

  async function generate(args: DowntimeDraftArgs): Promise<DowntimeSeed | null> {
    if (isAnyAiGenerating.value) return null;
    _state.isGenerating.value = true;
    _state.error.value = null;
    startAiQuotes();

    const campaignId = campaign.activeCampaign?.id;
    if (!campaignId) {
      _state.error.value = "No active campaign selected.";
      _state.isGenerating.value = false;
      stopAiQuotes();
      return null;
    }

    try {
      const isLocalMode =
        typeof localStorage !== "undefined" &&
        localStorage.getItem(LOCAL_MODE_KEY) === "local";

      const raw = isLocalMode
        ? await draftClientSide(args)
        : await draftServerSide(args, campaignId);

      // The airlock: anything the model invented that we can't honour is dropped
      // here, and a genuinely unusable draft throws with a message the DM reads.
      return seedFromAiResult(raw, args.activity.key, args.activity.rewardType);
    } catch (e) {
      _state.error.value = e instanceof Error ? e.message : "Drafting failed";
      return null;
    } finally {
      _state.isGenerating.value = false;
      stopAiQuotes();
    }
  }

  async function draftServerSide(args: DowntimeDraftArgs, campaignId: string): Promise<unknown> {
    const { data, error } = await supabase.functions.invoke("generate-downtime", {
      body: {
        campaign_id:    campaignId,
        activity_key:   args.activity.key,
        activity_title: args.activity.title,
        reward_kind:    args.activity.rewardType,
        character_name: args.characterName,
        prompt:         args.steer ?? "",
      },
    });

    if (error) throw new Error(await edgeErrorMessage(error));
    if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
    return data;
  }

  /** BYOK/local mode: the key never leaves the browser, so no edge call. */
  async function draftClientSide(args: DowntimeDraftArgs): Promise<unknown> {
    const textProvider = getTextProvider();
    const [basePrompt, rulesetContext] = await Promise.all([
      fetchSystemPrompt("downtime"),
      fetchRulesetContext(ruleset.value),
    ]);
    if (!basePrompt) throw new Error("Downtime system prompt not configured.");

    const systemContent = `${basePrompt}${rulesetContext ? `\n\n${rulesetContext}` : ""}${buildCampaignContext({
      setting: campaign.activeCampaign?.ai_setting_prompt ?? "",
    })}`;

    const constraints = [
      `Archetype: ${args.activity.title} (${args.activity.key})`,
      `reward.kind MUST be: ${args.activity.rewardType}`,
    ];
    if (args.characterName) constraints.push(`Character: ${args.characterName}`);

    const userContent = args.steer
      ? `${wrapUserInput(args.steer)}\n\nConstraints:\n${constraints.join("\n")}`
      : `Draft the outcome.\n\nConstraints:\n${constraints.join("\n")}`;

    const { content, usage: textUsage } = await textProvider.complete(systemContent, userContent);
    logUsage({ reason: "downtime_generation", textUsage });
    return JSON.parse(content);
  }

  return { ..._state, generate };
}
