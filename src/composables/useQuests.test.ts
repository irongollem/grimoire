import { describe, expect, it } from "vitest";
import { buildFiredTriggerWrites } from "./useQuests";
import type { CalendarEventTriggerPayload, QuestTrigger, QuestTriggerScheduled } from "@/types/quest.types";

const CAMPAIGN = "campaign-1";
const USER = "user-1";

function scheduled(overrides: Partial<QuestTriggerScheduled> = {}): QuestTriggerScheduled {
  return {
    id: "sched-1",
    user_id: USER,
    campaign_id: CAMPAIGN,
    trigger_id: "trigger-1",
    quest_id: "quest-1",
    fire_year: 1492,
    fire_month: 3,
    fire_day: 10,
    fired_at: null,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

function calendarTrigger(overrides: Partial<QuestTrigger> = {}): QuestTrigger {
  return {
    id: "trigger-1",
    user_id: USER,
    quest_id: "quest-1",
    objective_id: null,
    trigger_type: "quest_complete",
    offset_days: 0,
    action_type: "create_calendar_event",
    action_payload: { title: "The bridge collapses", event_type: "deadline", description: "No more crossing." },
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

function broadcastTrigger(overrides: Partial<QuestTrigger> = {}): QuestTrigger {
  return {
    ...calendarTrigger(),
    action_type: "send_broadcast",
    action_payload: { message: "The bells of the city toll in mourning." },
    ...overrides,
  };
}

describe("buildFiredTriggerWrites", () => {
  it("builds a calendar_events row from a create_calendar_event trigger", () => {
    const s = scheduled();
    const { calendarRows, broadcasts } = buildFiredTriggerWrites(
      [{ ...s, trigger: calendarTrigger() }],
      CAMPAIGN,
      USER,
    );
    expect(broadcasts).toEqual([]);
    expect(calendarRows).toEqual([{
      user_id: USER,
      campaign_id: CAMPAIGN,
      title: "The bridge collapses",
      description: "No more crossing.",
      event_type: "deadline",
      harptos_year: 1492,
      harptos_month: 3,
      harptos_day: 10,
      festival_day: null,
      is_multi_day: false,
      end_year: null,
      end_month: null,
      end_day: null,
      color: "#dc2626",
      linked_quest_id: "quest-1",
      linked_encounter_id: null,
      linked_location_id: null,
      travel_party_member_ids: [],
      player_visible: false,
    }]);
  });

  it("collects a send_broadcast trigger's message instead of a calendar row", () => {
    const s = scheduled();
    const { calendarRows, broadcasts } = buildFiredTriggerWrites(
      [{ ...s, trigger: broadcastTrigger() }],
      CAMPAIGN,
      USER,
    );
    expect(calendarRows).toEqual([]);
    expect(broadcasts).toEqual(["The bells of the city toll in mourning."]);
  });

  it("falls back to the quest event-type color and 'quest' type when payload omits one", () => {
    // action_payload round-trips through jsonb, so a legacy/malformed row can
    // genuinely lack event_type at runtime even though the app type says
    // it's required — that's exactly what the ?? "quest" fallback guards.
    const s = scheduled();
    const trigger = calendarTrigger({
      action_payload: { title: "Something happens" } as unknown as CalendarEventTriggerPayload,
    });
    const { calendarRows } = buildFiredTriggerWrites([{ ...s, trigger }], CAMPAIGN, USER);
    expect(calendarRows[0].event_type).toBe("quest");
    expect(calendarRows[0].color).toBe("#7c3aed");
    expect(calendarRows[0].description).toBeNull();
  });

  it("preserves trigger order across a mix of calendar and broadcast triggers", () => {
    const rows = [
      { ...scheduled({ id: "s1", quest_id: "q1" }), trigger: broadcastTrigger({ action_payload: { message: "first" } }) },
      { ...scheduled({ id: "s2", quest_id: "q2" }), trigger: calendarTrigger({ action_payload: { title: "second", event_type: "quest" } }) },
      { ...scheduled({ id: "s3", quest_id: "q3" }), trigger: broadcastTrigger({ action_payload: { message: "third" } }) },
    ];
    const { calendarRows, broadcasts } = buildFiredTriggerWrites(rows, CAMPAIGN, USER);
    expect(broadcasts).toEqual(["first", "third"]);
    expect(calendarRows.map((r) => r.title)).toEqual(["second"]);
  });

  it("returns empty arrays when nothing is firing", () => {
    expect(buildFiredTriggerWrites([], CAMPAIGN, USER)).toEqual({ calendarRows: [], broadcasts: [] });
  });
});
