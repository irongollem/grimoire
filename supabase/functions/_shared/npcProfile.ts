import { toPlainText } from "./ai-prompt.ts";
import { promptAge, type DatePoint } from "./npcAge.ts";

// The one NPC context builder: the Voice Coach, the AI table's speaking characters and the client's local path
// all build it here, so the disguise rule has one home. Pure: no Deno, no network.

// Bounds prompt cost: these fields are DM prose and can otherwise run long.
export const PERSONALITY_CHAR_LIMIT = 800;
export const BACKSTORY_CHAR_LIMIT = 600;
export const NOTES_CHAR_LIMIT = 600;
/** How they talk is a few sentences and a sample line; more than this is a second personality field. */
export const VOICE_CHAR_LIMIT = 400;

/** The columns `buildNpcProfile` reads, as a PostgREST select list. */
export const NPC_PROFILE_COLUMNS =
  "id, campaign_id, name, race, alignment, age, born_year, born_month, born_day, occupation, status, relationship, personality, voice, backstory, notes, disguise_name, is_revealed";

export interface NpcProfileRow {
  id: string;
  campaign_id: string | null;
  name: string;
  race: string | null;
  alignment: string | null;
  age: string | null;
  born_year: number | null;
  born_month: number | null;
  born_day: number | null;
  occupation: string | null;
  status: string;
  relationship: string;
  personality: string | null;
  /** How this character talks (#1021): register, pace, turns of phrase, a sample line. Plain text. */
  voice: string | null;
  backstory: string | null;
  notes: string | null;
  disguise_name: string | null;
  is_revealed: boolean;
}

/**
 * Labelled NPC context for the model. Absent fields are omitted entirely
 * (never emitted as an empty "Label: ").
 *
 * Disguise handling: when the NPC has a disguise_name and hasn't been
 * revealed, the party is talking to the disguise, not the true identity.
 *
 * The true name is NOT sent to the model at all in that case. Supplying it
 * under a "do not reveal this" instruction is strictly weaker than withholding
 * it — the name contributes nothing to voice quality (personality, occupation
 * and backstory do all that work), while the failure mode is precisely the one
 * this feature must not have: a DM reading a suggested line aloud at speed and
 * blowing a reveal they have been building for months.
 *
 * The backstory is still supplied, because it is what makes the disguised
 * persona sound like a person, with an explicit instruction not to surface
 * anything from it that would expose the cover.
 */
export function buildNpcProfile(npc: NpcProfileRow, today: DatePoint | null): string {
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
  const age = promptAge(npc, today);
  if (age) lines.push(`Age: ${age}`);
  if (npc.occupation) lines.push(`Occupation: ${npc.occupation}`);
  lines.push(`Status: ${npc.status}`);
  lines.push(`Relationship toward the party: ${npc.relationship}`);

  const personality = toPlainText(npc.personality).slice(0, PERSONALITY_CHAR_LIMIT);
  if (personality) lines.push(`Personality: ${personality}`);

  // Its own line, and worded as an instruction to sound like it: a model imitates a way of talking far better
  // than it turns "patient, articulate" into one, which is why three characters once all spoke alike.
  const voice = npc.voice ? npc.voice.trim().slice(0, VOICE_CHAR_LIMIT) : "";
  if (voice) lines.push(`Voice (how they talk; sound like this): ${voice}`);

  const backstory = toPlainText(npc.backstory).slice(0, BACKSTORY_CHAR_LIMIT);
  if (backstory) lines.push(`Backstory: ${backstory}`);

  const notes = toPlainText(npc.notes).slice(0, NOTES_CHAR_LIMIT);
  if (notes) lines.push(`Notes: ${notes}`);

  return lines.join("\n");
}

/**
 * The name the party knows a character by: the disguise until it is revealed, the true name after. Everything that
 * names a character to a model or a player goes through this, so a disguise cannot hold in one place and slip in
 * another.
 */
export function shownNpcName(npc: { name: string; disguise_name: string | null; is_revealed: boolean }): string {
  return npc.disguise_name && !npc.is_revealed ? npc.disguise_name : npc.name;
}
