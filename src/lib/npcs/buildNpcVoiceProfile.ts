import { toPlainText } from "@/ai/utils";
import type { Npc } from "@/types/npc.types";

/**
 * Client-side (BYOK/local) mirror of `buildNpcProfile()` in
 * `supabase/functions/generate-npc-voice/index.ts` (#336). The local path has
 * no edge function to build the NPC context, so this reproduces its output
 * format here — same convention as `supabase/functions/_shared/ai-prompt.ts`
 * mirroring `src/ai/utils.ts`. Keep the two in step by hand.
 */

// Bounds prompt cost — these fields are DM prose and can otherwise run long.
// Mirrors the edge function's PERSONALITY_CHAR_LIMIT / BACKSTORY_CHAR_LIMIT / NOTES_CHAR_LIMIT.
const PERSONALITY_CHAR_LIMIT = 800;
const BACKSTORY_CHAR_LIMIT = 600;
const NOTES_CHAR_LIMIT = 600;

/**
 * Labelled NPC context for the model. Absent fields are omitted entirely
 * (never emitted as an empty "Label: ").
 *
 * Disguise handling: when the NPC has a disguise_name and hasn't been
 * revealed, the party is talking to the disguise, not the true identity.
 *
 * The true name is NOT sent to the model at all in that case. Supplying it
 * under a "do not reveal this" instruction is strictly weaker than
 * withholding it — the name contributes nothing to voice quality
 * (personality, occupation and backstory do all that work), while the
 * failure mode is precisely the one this feature must not have: a DM
 * reading a suggested line aloud at speed and blowing a reveal they have
 * been building for months.
 *
 * The backstory is still supplied, because it is what makes the disguised
 * persona sound like a person, with an explicit instruction not to surface
 * anything from it that would expose the cover.
 */
export function buildNpcVoiceProfile(npc: Npc): string {
  const disguised = !!npc.disguise_name && !npc.is_revealed;
  const lines: string[] = [];

  if (disguised) {
    lines.push(
      `IMPORTANT: This NPC is currently in disguise and has NOT been revealed. The party knows them only as ` +
      `"${npc.disguise_name}", and that is who is speaking. Stay entirely in that persona, and do not surface any ` +
      `backstory detail that would expose the disguise.`,
    );
    lines.push(`Name: ${npc.disguise_name}`);
  } else {
    lines.push(`Name: ${npc.name}`);
  }

  if (npc.race) lines.push(`Race: ${npc.race}`);
  if (npc.alignment) lines.push(`Alignment: ${npc.alignment}`);
  if (npc.age) lines.push(`Age: ${npc.age}`);
  if (npc.occupation) lines.push(`Occupation: ${npc.occupation}`);
  lines.push(`Status: ${npc.status}`);
  lines.push(`Relationship toward the party: ${npc.relationship}`);

  const personality = toPlainText(npc.personality).slice(0, PERSONALITY_CHAR_LIMIT);
  if (personality) lines.push(`Personality: ${personality}`);

  const backstory = toPlainText(npc.backstory).slice(0, BACKSTORY_CHAR_LIMIT);
  if (backstory) lines.push(`Backstory: ${backstory}`);

  const notes = toPlainText(npc.notes).slice(0, NOTES_CHAR_LIMIT);
  if (notes) lines.push(`Notes: ${notes}`);

  return lines.join("\n");
}
