import { describe, expect, it } from "vitest";
import type { QuestBeat } from "@/types/quest.types";
import type { AiProvenance } from "@/ai/provenance";
import { applyBeatFill, questBeatDraftsEqual, questBeatDraftToUpdate, questBeatToDraft } from "./beatDraft";

const beat = {
  id: "beat", title: "A choice", kind: "social", presentation_hint: null,
  visibility: "hidden", dm_content: "lead", read_aloud: "speech",
  how_it_plays: "talk",
  rumor_text: null, reveal_text: null,
} as QuestBeat;

describe("quest beat draft", () => {
  it("round-trips both editor surfaces through one field model", () => {
    const draft = questBeatToDraft(beat);
    expect(questBeatDraftToUpdate(draft)).toMatchObject({
      title: "A choice", dm_content: "lead", read_aloud: "speech", how_it_plays: "talk",
    });
  });

  it("treats a changed title as a different draft from the one it started as", () => {
    const before = questBeatToDraft(beat);
    const after = { ...before, title: "A different choice" };
    expect(questBeatDraftToUpdate(after)).toMatchObject({
      title: "A different choice", dm_content: "lead", read_aloud: "speech", how_it_plays: "talk",
    });
    expect(questBeatDraftsEqual(before, after)).toBe(false);
  });

  it("keeps the moment an improvised beat was reviewed across later saves", () => {
    const reviewed = "2026-08-01T20:15:00.000Z";
    const draft = questBeatToDraft({ ...beat, is_improvised: true, improv_reviewed_at: reviewed } as QuestBeat);
    expect(draft.improv_reviewed).toBe(true);
    // An unrelated edit, saved long after the review, must not restamp it.
    expect(questBeatDraftToUpdate({ ...draft, title: "Renamed" }, reviewed).improv_reviewed_at).toBe(reviewed);
    // Ticking the box for the first time still records now.
    expect(questBeatDraftToUpdate(draft, null).improv_reviewed_at).not.toBe(null);
    // Clearing it discards the timestamp.
    expect(questBeatDraftToUpdate({ ...draft, improv_reviewed: false }, reviewed).improv_reviewed_at).toBe(null);
  });

  it("trims the title and the short fields on save, and turns blank text into null", () => {
    const update = questBeatDraftToUpdate({
      ...questBeatToDraft(beat),
      title: "  Padded  ",
      dm_content: "",
      read_aloud: "",
      how_it_plays: "",
      rumor_text: "",
      reveal_text: "",
    });
    expect(update).toMatchObject({
      title: "Padded",
      dm_content: null,
      read_aloud: null,
      how_it_plays: null,
      rumor_text: null,
      reveal_text: null,
    });
  });

  // #1115: the rumour and reveal columns are Tiptap JSON. An emptied editor
  // leaves a doc holding one blank paragraph, which is not copy.
  const EMPTY_DOC = '{"type":"doc","content":[{"type":"paragraph"}]}';
  const WORDS_DOC = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"heard at the dock"}]}]}';

  it("saves an emptied rumour or reveal editor as null, so the prep gap still names it", () => {
    const update = questBeatDraftToUpdate({ ...questBeatToDraft(beat), rumor_text: EMPTY_DOC, reveal_text: EMPTY_DOC });
    expect(update.rumor_text).toBeNull();
    expect(update.reveal_text).toBeNull();
  });

  it("saves a rumour doc that holds words exactly as the editor produced it", () => {
    expect(questBeatDraftToUpdate({ ...questBeatToDraft(beat), rumor_text: WORDS_DOC }).rumor_text).toBe(WORDS_DOC);
  });

  describe("AI provenance", () => {
    const prov: AiProvenance = { generatorType: "quest_beat_generation", provider: "openai", model: "m", generatedAt: "2026-10-04T00:00:00.000Z", edited: false };

    it("leaves a hand-written beat without provenance", () => {
      expect(questBeatDraftToUpdate(questBeatToDraft(beat)).ai_provenance).toBe(null);
    });

    it("carries a fresh fill unedited, even though it differs from the saved row", () => {
      const draft = questBeatToDraft(beat);
      applyBeatFill(draft, { title: "Filled", read_aloud: "r", dm_content: "d" }, prov);
      expect(draft).toMatchObject({ title: "Filled", read_aloud: "r", dm_content: "d" });
      expect(questBeatDraftToUpdate(draft).ai_provenance).toEqual(prov);
    });

    it("flips edited when the DM changes title, lead or read-aloud afterwards", () => {
      for (const field of ["title", "dm_content", "read_aloud"] as const) {
        const draft = questBeatToDraft(beat);
        applyBeatFill(draft, { title: "Filled", read_aloud: "r", dm_content: "d" }, prov);
        draft[field] = "changed";
        expect(questBeatDraftToUpdate(draft).ai_provenance).toEqual({ ...prov, edited: true });
      }
    });

    it("does not flip on an unrelated field, and keeps untouched fields on a partial fill", () => {
      const draft = questBeatToDraft({ ...beat, ai_provenance: prov } as QuestBeat);
      draft.how_it_plays = "other";
      expect(questBeatDraftToUpdate(draft).ai_provenance).toEqual(prov);
      applyBeatFill(draft, { read_aloud: "new" }, prov);
      expect(draft.title).toBe("A choice");
      expect(draft.dm_content).toBe("lead");
    });

    it("does not read stray whitespace in the title, or a blank field that was null, as the DM editing the AI's work", () => {
      const bare = { ...beat, dm_content: null, read_aloud: null, ai_provenance: prov } as QuestBeat;
      expect(questBeatDraftToUpdate(questBeatToDraft(bare)).ai_provenance).toEqual(prov);
      const draft = questBeatToDraft(beat);
      applyBeatFill(draft, { title: "Filled", read_aloud: "r", dm_content: "d" }, prov);
      draft.title = "Filled  ";
      expect(questBeatDraftToUpdate(draft).ai_provenance).toEqual(prov);
    });

    it("compares provenance by value, so a refetched row is not a change", () => {
      const a = questBeatToDraft({ ...beat, ai_provenance: prov } as QuestBeat);
      const b = questBeatToDraft({ ...beat, ai_provenance: { ...prov } } as QuestBeat);
      expect(questBeatDraftsEqual(a, b)).toBe(true);
    });
  });
});
