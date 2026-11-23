/**
 * Ask Grimoire (#1253): the Monster Generator, as a quote and a run.
 *
 * The same seam as the NPC adapter: the price is `useMonsterQuote`'s (the one `MonsterGeneratorPanel` shows), the
 * gates are the page's (`useAskGate`, which also refuses a campaign whose game system has no stat blocks), and the run
 * is `useGenerateMonster`, the step the page and the document importer share. A failed picture leaves the monster
 * saved, and its part carries `retry`, which paints the saved row once with the page's own paint flow.
 */
import type { AskProposal } from "@edge-shared/agent/askContract";
import type { AskAdapter, AskQuote, AskQuoteLine, AskRunPart, AskRunResult } from "@/lib/ask/askAdapter";
import { conceptBlock, failedRun, picturePart, spent } from "@/ai/ask/adapters/askAdapterKit";
import { askFlag, askString, readAskInputs } from "@/ai/ask/askInputs";
import { useAskGate } from "@/ai/ask/useAskGate";
import { useMissingPortrait } from "@/ai/useMissingPortrait";
import { useCampaignStore } from "@/stores/campaign";
import { useMonsterQuote } from "@/composables/ai/quotes/monsterQuote";
import { useGenerateMonster } from "@/composables/monsters/useGenerateMonster";
import { isQuotaExceeded } from "@/lib/quotaError";
import { MONSTER_TYPES } from "@/types/monster.types";

/** A challenge rating as the page's field takes it: a whole number or a fraction such as 1/2. */
const CHALLENGE_RATING = /^\d{1,2}(\/\d{1,2})?$/;

export function useMonsterAskAdapter(): AskAdapter {
  const campaign = useCampaignStore();
  const quoteFor = useMonsterQuote();
  const { blockFor } = useAskGate("monsters", "monster");
  const { generateAndCreateMonster } = useGenerateMonster();
  const missing = useMissingPortrait("monster");

  function understand(proposal: AskProposal) {
    const inputs = readAskInputs("monster", proposal.inputs);
    const rating = askString(inputs, "challenge_rating");
    const type = askString(inputs, "monster_type")?.toLowerCase() ?? null;
    return {
      challengeRating: rating !== null && CHALLENGE_RATING.test(rating) ? rating : null,
      monsterType: type !== null && MONSTER_TYPES.some((t) => t === type) ? type : null,
      size: askString(inputs, "size"),
      image: askFlag(inputs, "image"),
      concept: proposal.concept.trim(),
    };
  }

  function quote(proposal: AskProposal): AskQuote {
    const read = understand(proposal);
    const priced = quoteFor({ image: read.image });

    const lines: AskQuoteLine[] = [];
    if (read.challengeRating) lines.push({ label: "Challenge rating", value: read.challengeRating, credits: null });
    if (read.monsterType) lines.push({ label: "Type", value: read.monsterType, credits: null });
    if (read.size) lines.push({ label: "Size", value: read.size, credits: null });
    lines.push({ label: "Campaign", value: campaign.activeCampaign?.name ?? "This campaign", credits: null });
    lines.push(...priced.lines);
    if (!read.image) lines.push({ label: "Picture", value: "None", credits: null });

    let block = blockFor({ total: priced.total, byok: priced.byok, fiveE: true });
    block = block ?? conceptBlock(read.concept, "monster");
    return { lines, total: priced.total, byok: priced.byok, block };
  }

  async function run(proposal: AskProposal): Promise<AskRunResult> {
    // The state may have moved since the DM read the quote: the same gates, again, before anything is spent.
    const current = quote(proposal);
    if (current.block) return failedRun("Stat block", current.block.message);
    const read = understand(proposal);

    let outcome;
    try {
      outcome = await generateAndCreateMonster(read.concept, {
        challenge_rating: read.challengeRating ?? undefined,
        monster_type: read.monsterType ?? undefined,
        size: read.size ?? undefined,
        // Explicit either way: left out, the generator paints a picture.
        generateImage: read.image,
      });
    } catch (e) {
      const message = isQuotaExceeded(e)
        ? "You have reached your limit of monsters on this plan."
        : e instanceof Error ? e.message : "The monster could not be saved.";
      return failedRun("Stat block", message);
    }
    if (!outcome.id || outcome.name === null) return failedRun("Stat block", outcome.error ?? "Monster generation failed.");

    const id = outcome.id;
    const name = outcome.name;
    const parts: AskRunPart[] = [{ label: "Stat block", ok: true, credits: spent(current.lines.find((l) => l.label === "Stat block")) }];
    if (read.image) {
      const credits = spent(current.lines.find((l) => l.label === "Picture"));
      parts.push(picturePart({
        saved: outcome.picture === "saved",
        credits,
        noun: "monster",
        retry: { credits: missing.cost.value, paint: () => missing.paint(id, `${name}. ${read.concept}`), error: () => missing.error.value },
      }));
    }
    return { record: { type: "monster", id, name }, route: `/monsters/${id}`, parts };
  }

  return { id: "monster", quote, run };
}

export default useMonsterAskAdapter;
