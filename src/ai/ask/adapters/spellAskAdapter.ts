/**
 * Ask Grimoire (#1253): the Spell Generator, as a quote and a run.
 *
 * A seam over the page's own workflow: the price is `useSpellQuote`'s (the one the card shows), the gates
 * are the page's (`useAskGate`, 5e only), and the run is `useGenerateSpell`. The spell is saved before its picture is
 * judged; a failed picture leaves the spell and a part that paints the saved row once with the page's own paint flow.
 *
 * The level is one of the digits "0" to "9" (the card draws them as Cantrip to 9th; `readAskInputs` holds the word to
 * that enum) and a school only one of the app's eight; anything else is dropped and the description carries it.
 */
import type { AskProposal } from "@edge-shared/agent/askContract";
import type { AskAdapter, AskQuote, AskQuoteLine, AskRunPart, AskRunResult } from "@/lib/ask/askAdapter";
import { askFlag, askString, readAskInputs } from "@/ai/ask/askInputs";
import { useAskGate } from "@/ai/ask/useAskGate";
import { conceptBlock, failedRun, matchKey, picturePart, spent } from "@/ai/ask/adapters/askAdapterKit";
import { useMissingPortrait } from "@/ai/useMissingPortrait";
import { useCampaignStore } from "@/stores/campaign";
import { useSpellQuote } from "@/composables/ai/quotes/spellQuote";
import { useGenerateSpell } from "@/composables/spells/useGenerateSpell";
import { isQuotaExceeded } from "@/lib/quotaError";
import { SPELL_SCHOOLS } from "@/types/spell.types";

function levelLabel(level: number): string {
  return level === 0 ? "Cantrip" : `Level ${level}`;
}

/** The enum's digit as the number the workflow takes: "0" is a cantrip, and null is "any level". */
function spellLevel(word: string | null): number | null {
  return word === null ? null : Number(word);
}

export function useSpellAskAdapter(): AskAdapter {
  const campaign = useCampaignStore();
  const quoteSpell = useSpellQuote();
  const { blockFor } = useAskGate(null, "spell");
  const { generateAndCreateSpell } = useGenerateSpell();
  const missing = useMissingPortrait("spell");

  function understand(proposal: AskProposal) {
    const inputs = readAskInputs("spell", proposal.inputs);
    return {
      level: spellLevel(askString(inputs, "level")),
      school: matchKey(askString(inputs, "school"), SPELL_SCHOOLS),
      image: askFlag(inputs, "image"),
      concept: proposal.concept.trim(),
    };
  }

  function quote(proposal: AskProposal): AskQuote {
    const read = understand(proposal);
    const priced = quoteSpell({ image: read.image });

    const lines: AskQuoteLine[] = [];
    if (read.level !== null) lines.push({ label: "Level", value: levelLabel(read.level), credits: null });
    if (read.school) lines.push({ label: "School", value: read.school, credits: null });
    lines.push({ label: "Campaign", value: campaign.activeCampaign?.name ?? "This campaign", credits: null });
    lines.push(...priced.lines);
    if (!read.image) lines.push({ label: "Picture", value: "None", credits: null });

    const block = blockFor({ total: priced.total, fiveE: true }) ?? conceptBlock(read.concept, "spell");
    return { lines, total: priced.total, block };
  }

  async function run(proposal: AskProposal): Promise<AskRunResult> {
    // The state may have moved since the DM read the quote: the same gates, again, before anything is spent.
    const current = quote(proposal);
    if (current.block) return failedRun("Spell", current.block.message);
    const read = understand(proposal);

    let outcome;
    try {
      outcome = await generateAndCreateSpell(read.concept, {
        level: read.level ?? undefined,
        school: read.school ?? undefined,
        // Explicit either way: left out, the generator paints a picture.
        generateImage: read.image,
      });
    } catch (e) {
      const message = isQuotaExceeded(e)
        ? "You have reached your limit of spells on this plan."
        : e instanceof Error ? e.message : "The spell could not be saved.";
      return failedRun("Spell", message);
    }
    if (!outcome.id || outcome.name === null) return failedRun("Spell", outcome.error ?? "Spell generation failed.");

    const id = outcome.id;
    const name = outcome.name;
    const parts: AskRunPart[] = [{ label: "Spell", ok: true, credits: spent(current.lines.find((l) => l.label === "Spell")) }];
    if (read.image) {
      parts.push(picturePart({
        label: "Picture",
        saved: outcome.picture === "saved",
        credits: spent(current.lines.find((l) => l.label === "Picture")),
        noun: "spell",
        retry: { credits: missing.cost.value, paint: () => missing.paint(id, `${name}. ${read.concept}`), error: () => missing.error.value },
      }));
    }
    return { record: { type: "spell", id, name }, route: `/spells/${id}`, parts, picture: outcome.picture === "saved" && outcome.pictureUrl !== null ? outcome.pictureUrl : undefined };
  }

  return { id: "spell", quote, run };
}

export default useSpellAskAdapter;
