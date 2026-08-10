import { describe, expect, it } from "vitest";
import type { QuestBeat } from "@/types/quest.types";
import { questBeatDraftsEqual, questBeatDraftToUpdate, questBeatToDraft } from "./beatDraft";

const beat = {
  id: "beat", title: "A choice", kind: "social", presentation_hint: null,
  visibility: "hidden", dm_content: "lead", read_aloud: "speech",
  how_it_plays: "talk", outcomes: "branch", consequences: "later",
  rumor_text: null, reveal_text: null,
} as QuestBeat;

describe("quest beat draft", () => {
  it("round-trips both editor surfaces through one field model", () => {
    const draft = questBeatToDraft(beat);
    expect(questBeatDraftToUpdate(draft)).toMatchObject({
      title: "A choice", dm_content: "lead", read_aloud: "speech", consequences: "later",
    });
  });

  it("changing kind preserves narrative and attachments-independent state", () => {
    const before = questBeatToDraft(beat);
    const after = { ...before, kind: "combat" };
    expect(questBeatDraftToUpdate(after)).toMatchObject({
      kind: "combat", dm_content: "lead", read_aloud: "speech", outcomes: "branch",
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
});
