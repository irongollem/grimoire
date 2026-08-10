import { describe, expect, it } from "vitest";
import { toQuestRuntimeRpcArgs } from "./runtime";

describe("quest runtime command adapter", () => {
  it("sends an edge advance with the loaded optimistic version", () => {
    expect(toQuestRuntimeRpcArgs({
      campaignId: "campaign-1",
      command: "advance",
      expectedVersion: 7,
      edgeId: "edge-1",
    })).toEqual({
      p_campaign_id: "campaign-1",
      p_command: "advance",
      p_expected_version: 7,
      p_target_quest_id: null,
      p_target_beat_id: null,
      p_edge_id: "edge-1",
      p_reason: null,
      p_push_return: false,
      p_provenance: {},
    });
  });

  it("preserves jump reason, return intent, target, and provenance", () => {
    expect(toQuestRuntimeRpcArgs({
      campaignId: "campaign-1",
      command: "jump",
      expectedVersion: 8,
      targetQuestId: "quest-2",
      targetBeatId: "beat-3",
      reason: "Players followed the courier",
      pushReturn: true,
      provenance: { surface: "jump-picker" },
    })).toMatchObject({
      p_target_quest_id: "quest-2",
      p_target_beat_id: "beat-3",
      p_reason: "Players followed the courier",
      p_push_return: true,
      p_provenance: { surface: "jump-picker" },
    });
  });
});
