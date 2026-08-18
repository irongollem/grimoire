import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import PlayerQuestStoryThread from "./PlayerQuestStoryThread.vue";
import type { PlayerQuestBeat } from "@/types/quest.types";

function beat(overrides: Partial<PlayerQuestBeat> = {}): PlayerQuestBeat {
  return {
    id: "beat-a",
    quest_id: "quest-a",
    campaign_id: "campaign-a",
    visibility: "revealed",
    kind: "social",
    presentation_hint: null,
    player_text: "The envoy agreed to help.",
    story_order: 0,
    attachments: [],
    visits: [{ visit_id: "visit-a", visited_at: "2026-08-10T12:00:00Z" }],
    updated_at: "2026-08-10T12:00:00Z",
    ...overrides,
  };
}

describe("PlayerQuestStoryThread", () => {
  // Revealing beats in whatever order you click them used to reorder the recap,
  // because an unvisited beat's only timestamp is the moment of the click.
  it("follows the authored flow rather than the order the DM revealed things", () => {
    const wrapper = mount(PlayerQuestStoryThread, {
      props: {
        beats: [
          beat({ id: "keep", player_text: "Last the keep.", story_order: 2, visits: [], updated_at: "2026-08-10T14:00:00Z" }),
          beat({ id: "gate", player_text: "First the gate.", story_order: 0, visits: [], updated_at: "2026-08-10T15:00:00Z" }),
          beat({ id: "bridge", player_text: "Then the bridge.", story_order: 1, visits: [], updated_at: "2026-08-10T16:00:00Z" }),
        ],
      },
    });

    expect(wrapper.findAll("ol[aria-label='Revealed quest history'] li").map((event) => event.text()))
      .toEqual([
        expect.stringContaining("First the gate."),
        expect.stringContaining("Then the bridge."),
        expect.stringContaining("Last the keep."),
      ]);
  });

  // Split into one entry per visit, a loop back put a beat's second entry ahead
  // of scenes already played, reading as though the party never left.
  it("folds repeat visits into the beat's own place in the story", () => {
    const wrapper = mount(PlayerQuestStoryThread, {
      props: {
        beats: [
          beat({ id: "gate", player_text: "The gate opened.", story_order: 0, visits: [
            { visit_id: "v1", visited_at: "2026-08-10T12:00:00Z" },
            { visit_id: "v3", visited_at: "2026-08-10T16:00:00Z" },
          ] }),
          beat({ id: "bridge", player_text: "The bridge held.", story_order: 1, visits: [{ visit_id: "v2", visited_at: "2026-08-10T13:00:00Z" }] }),
        ],
      },
    });

    const events = wrapper.findAll("ol[aria-label='Revealed quest history'] li");
    expect(events).toHaveLength(2);
    expect(events[0]!.text()).toContain("Returned to this moment 2 times");
    expect(events[1]!.text()).not.toContain("Returned");
    // The earliest visit dates the moment; a later return does not move it.
    expect(wrapper.findAll("time").map((time) => time.attributes("datetime")))
      .toEqual(["2026-08-10T12:00:00Z", "2026-08-10T13:00:00Z"]);
  });

  // "This moment was revealed without further public details" is a card that
  // says nothing. The DM already sees the empty reveal as a prep gap.
  it("omits a revealed beat that has no player copy", () => {
    const wrapper = mount(PlayerQuestStoryThread, {
      props: { beats: [beat({ id: "blank", player_text: null }), beat({ id: "told", player_text: "The door gave way.", story_order: 1 })] },
    });

    const events = wrapper.findAll("ol[aria-label='Revealed quest history'] li");
    expect(events).toHaveLength(1);
    expect(events[0]!.text()).toContain("The door gave way.");
    expect(wrapper.text()).not.toContain("without further public details");
  });

  it("keeps rumors distinct and provides deliberate copy for a partially revealed quest", () => {
    const wrapper = mount(PlayerQuestStoryThread, {
      props: { beats: [beat({ id: "rumor", visibility: "rumored", player_text: "Whispers mention a silver door.", visits: [] })] },
    });
    expect(wrapper.get("#quest-rumors-heading").text()).toBe("Rumors");
    expect(wrapper.text()).toContain("Whispers mention a silver door.");
    expect(wrapper.text()).toContain("No confirmed story moments have been revealed yet.");
  });

  it("shows saved reveal text even before Run mode records a visit", () => {
    const wrapper = mount(PlayerQuestStoryThread, {
      props: { beats: [beat({ visits: [], player_text: "The chokepoint is open." })] },
    });

    expect(wrapper.text()).toContain("The chokepoint is open.");
    expect(wrapper.get("ol[aria-label='Revealed quest history']").element.tagName).toBe("OL");
    expect(wrapper.text()).not.toContain("No confirmed story moments");
  });

  it("never renders hidden or DM-only fields from a malformed client object", () => {
    const malformed = {
      ...beat({ id: "hidden", visibility: "hidden" as PlayerQuestBeat["visibility"], player_text: "LEAKED PLAYER COPY" }),
      title: "SECRET NODE TITLE",
      dm_content: "SECRET DM LEAD",
      read_aloud: "SECRET READ ALOUD",
      how_it_plays: "SECRET GUIDANCE",
      edge_label: "SECRET EDGE LABEL",
    } as PlayerQuestBeat;
    const wrapper = mount(PlayerQuestStoryThread, { props: { beats: [malformed] } });
    expect(wrapper.text()).not.toMatch(/LEAKED|SECRET/);
    expect(wrapper.find("ol").exists()).toBe(false);
  });

  it("uses a labelled section, heading hierarchy, list, article, and time semantics", () => {
    const wrapper = mount(PlayerQuestStoryThread, { props: { beats: [beat()] } });
    expect(wrapper.get("section[aria-labelledby='quest-story-heading']").attributes("aria-labelledby")).toBe("quest-story-heading");
    expect(wrapper.get("h3#quest-story-heading").text()).toBe("Story so far");
    expect(wrapper.get("h4").text()).toBe("Confirmed journey");
    expect(wrapper.get("article").element.tagName).toBe("ARTICLE");
    expect(wrapper.get("time").attributes("datetime")).toBe("2026-08-10T12:00:00Z");
    expect(wrapper.findAll("button, a, [tabindex]")).toHaveLength(0);
  });
});
