import { markEdited, type AiProvenance } from "@/ai/provenance";
import type { QuestBeat, QuestBeatUpdate } from "@/types/quest.types";

/**
 * `QuestBeatFields.vue`'s own field set: the prose an editor types through a
 * pause. `kind`, `presentation_hint`, `visibility` and `staged_at_location_id`
 * are edited elsewhere now — as inline rows in the Beat panel on the beat
 * page (Quest Manager Redesign frame `03 Inspector`), each saved immediately
 * rather than debounced — so they never belonged in this draft to begin with
 * once that move landed; keeping them here would have been the surpassed
 * path this draft used to be.
 */
export interface QuestBeatDraft {
  title: string;
  dm_content: string;
  read_aloud: string;
  how_it_plays: string;
  rumor_text: string;
  reveal_text: string;
  improv_reviewed: boolean;
  /** Provenance of the AI-filled prose, null for a beat the DM wrote. */
  ai_provenance: AiProvenance | null;
  /** The title and prose the provenance describes. Once the live text drifts
   *  from it the DM has edited the AI's work, and the save flips `edited`. */
  ai_content: string;
}

function contentSignature(parts: { title: string; dm_content: string | null; read_aloud: string | null }): string {
  return JSON.stringify([parts.title.trim(), parts.dm_content || null, parts.read_aloud || null]);
}

export function questBeatToDraft(beat: QuestBeat): QuestBeatDraft {
  return {
    title: beat.title,
    dm_content: beat.dm_content ?? "",
    read_aloud: beat.read_aloud ?? "",
    how_it_plays: beat.how_it_plays ?? "",
    rumor_text: beat.rumor_text ?? "",
    reveal_text: beat.reveal_text ?? "",
    improv_reviewed: !!beat.improv_reviewed_at,
    ai_provenance: beat.ai_provenance ?? null,
    ai_content: contentSignature(beat),
  };
}

/**
 * `savedReviewedAt` is the beat's stored review timestamp. It is carried through
 * unchanged whenever the flag is still set, because the column records *when the
 * improvisation was turned into prepared material* — restamping it on every
 * later autosave of an unrelated field would quietly redefine it as "last
 * touched" and lose the real moment.
 */
export function questBeatDraftToUpdate(draft: QuestBeatDraft, savedReviewedAt: string | null = null): QuestBeatUpdate {
  const nullable = (value: string) => value || null;
  return {
    title: draft.title.trim(),
    dm_content: nullable(draft.dm_content),
    read_aloud: nullable(draft.read_aloud),
    how_it_plays: nullable(draft.how_it_plays),
    rumor_text: nullable(draft.rumor_text.trim()),
    reveal_text: nullable(draft.reveal_text.trim()),
    improv_reviewed_at: draft.improv_reviewed
      ? savedReviewedAt ?? new Date().toISOString()
      : null,
    ai_provenance: draft.ai_content === contentSignature(draft)
      ? draft.ai_provenance
      : markEdited(draft.ai_provenance),
  };
}

/**
 * Write an AI fill into the draft the way a keystroke would, so autosave
 * persists it. Only the fields in `fill` change; the provenance is stamped
 * against the resulting text, so it stays unedited until the DM touches it.
 */
export function applyBeatFill(
  draft: QuestBeatDraft,
  fill: { title?: string; dm_content?: string; read_aloud?: string },
  provenance: AiProvenance | null,
): void {
  if (fill.title !== undefined) draft.title = fill.title;
  if (fill.dm_content !== undefined) draft.dm_content = fill.dm_content;
  if (fill.read_aloud !== undefined) draft.read_aloud = fill.read_aloud;
  draft.ai_provenance = provenance;
  draft.ai_content = contentSignature(draft);
}

export function questBeatDraftsEqual(a: QuestBeatDraft, b: QuestBeatDraft) {
  return (Object.keys(a) as Array<keyof QuestBeatDraft>).every((key) =>
    key === "ai_provenance" ? JSON.stringify(a[key]) === JSON.stringify(b[key]) : a[key] === b[key]);
}
