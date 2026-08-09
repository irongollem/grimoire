import { describe, expect, it } from "vitest";
import { summarizeQuestBeatAttachment } from "./attachments";
import type { QuestBeatAttachment } from "@/types/quest.types";

const attachment = (overrides: Partial<QuestBeatAttachment> = {}): QuestBeatAttachment => ({
  id: "attachment",
  beat_id: "beat",
  quest_id: "quest",
  campaign_id: "campaign",
  attachment_type: "encounter",
  ref_id: "encounter",
  role: "Final confrontation",
  is_required: true,
  metadata: {},
  sort_order: 0,
  created_by: "dm",
  created_at: "2026-08-10T00:00:00Z",
  ...overrides,
});

describe("quest beat attachment adapters", () => {
  it("provides compact content and a full-editor escape hatch", () => {
    const summary = summarizeQuestBeatAttachment(attachment(), { label: "Goblin ambush", detail: "Ready" });
    expect(summary.label).toBe("Goblin ambush");
    expect(summary.compact_detail).toBe("Ready");
    expect(summary.full_editor_to).toBe("/encounters/encounter");
    expect(summary.prep_gap).toBe(false);
  });

  it("turns a deleted required target into a prep gap", () => {
    const summary = summarizeQuestBeatAttachment(attachment(), null);
    expect(summary.label).toBe("Missing encounter");
    expect(summary.full_editor_to).toBeNull();
    expect(summary.prep_gap).toBe(true);
  });

  it("does not count a missing optional target as a prep gap", () => {
    expect(summarizeQuestBeatAttachment(attachment({ is_required: false }), null).prep_gap).toBe(false);
  });
});
