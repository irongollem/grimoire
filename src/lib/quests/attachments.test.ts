import { describe, expect, it } from "vitest";
import { QUEST_BEAT_ATTACHMENT_ADAPTERS, summarizeQuestBeatAttachment } from "./attachments";
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
  it("declares a Run action, contained surface, and specialist escape hatch for every type", () => {
    for (const adapter of Object.values(QUEST_BEAT_ATTACHMENT_ADAPTERS)) {
      expect(adapter.runAction).toMatch(/^(run|view|play|roll)$/);
      expect(adapter.containedSurface).toMatch(/^(encounter|entity|audio|document|check)$/);
      // A check carries its own data instead of pointing at a row: its summary
      // reads `metadata`, not the generic `target`, and it never offers a full
      // editor — both covered by their own tests below.
      if (adapter.type === "check") continue;
      expect(adapter.summary(attachment({ attachment_type: adapter.type }), { label: "Ready" }).label).toBe("Ready");
      expect(adapter.fullEditorTo("target", "quest")).toEqual(expect.any(String));
    }
  });

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

  it("reads a check's skill and DC from its own metadata, contested-by taking priority over a note", () => {
    const checkAttachment = attachment({
      attachment_type: "check",
      ref_id: "check",
      metadata: { skill: "Insight", dc: 15, contested_by: "Deception", note: "Ignored while contested" },
    });
    const adapter = QUEST_BEAT_ATTACHMENT_ADAPTERS.check;
    expect(adapter.summary(checkAttachment, null)).toEqual({ label: "Insight DC 15", detail: "Contested by Deception" });
    expect(adapter.fullEditorTo("check", "quest")).toBeNull();

    const result = summarizeQuestBeatAttachment(checkAttachment, null);
    expect(result.label).toBe("Insight DC 15");
    expect(result.compact_detail).toBe("Contested by Deception");
    expect(result.target_exists).toBe(true);
    expect(result.prep_gap).toBe(false);
    expect(result.full_editor_to).toBeNull();
  });

  it("falls back to the note when a check has no contested skill", () => {
    const checkAttachment = attachment({
      attachment_type: "check",
      ref_id: "check",
      metadata: { skill: "Athletics", dc: 12, note: "Climbing the outer wall" },
    });
    expect(QUEST_BEAT_ATTACHMENT_ADAPTERS.check.summary(checkAttachment, null)).toEqual({
      label: "Athletics DC 12",
      detail: "Climbing the outer wall",
    });
  });
});
