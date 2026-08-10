import type { QuestBeat, QuestBeatUpdate } from "@/types/quest.types";

export interface QuestBeatDraft {
  title: string;
  kind: string;
  presentation_hint: string;
  visibility: QuestBeat["visibility"];
  dm_content: string;
  read_aloud: string;
  how_it_plays: string;
  outcomes: string;
  consequences: string;
  rumor_text: string;
  reveal_text: string;
  improv_reviewed: boolean;
}

export function questBeatToDraft(beat: QuestBeat): QuestBeatDraft {
  return {
    title: beat.title,
    kind: beat.kind,
    presentation_hint: beat.presentation_hint ?? "",
    visibility: beat.visibility,
    dm_content: beat.dm_content ?? "",
    read_aloud: beat.read_aloud ?? "",
    how_it_plays: beat.how_it_plays ?? "",
    outcomes: beat.outcomes ?? "",
    consequences: beat.consequences ?? "",
    rumor_text: beat.rumor_text ?? "",
    reveal_text: beat.reveal_text ?? "",
    improv_reviewed: !!beat.improv_reviewed_at,
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
    kind: draft.kind.trim() || "neutral",
    presentation_hint: nullable(draft.presentation_hint.trim()),
    visibility: draft.visibility,
    dm_content: nullable(draft.dm_content),
    read_aloud: nullable(draft.read_aloud),
    how_it_plays: nullable(draft.how_it_plays),
    outcomes: nullable(draft.outcomes),
    consequences: nullable(draft.consequences),
    rumor_text: nullable(draft.rumor_text.trim()),
    reveal_text: nullable(draft.reveal_text.trim()),
    improv_reviewed_at: draft.improv_reviewed
      ? savedReviewedAt ?? new Date().toISOString()
      : null,
  };
}

export function questBeatDraftsEqual(a: QuestBeatDraft, b: QuestBeatDraft) {
  return (Object.keys(a) as Array<keyof QuestBeatDraft>).every((key) => a[key] === b[key]);
}
