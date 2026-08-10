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
    attachments: [],
    visits: [{ visit_id: "visit-a", visited_at: "2026-08-10T12:00:00Z" }],
    updated_at: "2026-08-10T12:00:00Z",
    ...overrides,
  };
}

describe("PlayerQuestStoryThread", () => {
  it("renders revealed visits chronologically and marks a repeated visit without naming its source", () => {
    const wrapper = mount(PlayerQuestStoryThread, {
      props: {
        beats: [
          beat({ visits: [
            { visit_id: "visit-c", visited_at: "2026-08-10T14:00:00Z" },
            { visit_id: "visit-b", visited_at: "2026-08-10T13:00:00Z" },
          ] }),
          beat({ id: "beat-b", player_text: "The gate opened.", visits: [{ visit_id: "visit-a", visited_at: "2026-08-10T12:00:00Z" }] }),
        ],
      },
    });

    const events = wrapper.findAll("ol[aria-label='Revealed quest history'] li");
    expect(events.map((event) => event.text())).toEqual([
      expect.stringContaining("The gate opened."),
      expect.stringContaining("The envoy agreed to help."),
      expect.stringContaining("Returned to this moment"),
    ]);
    expect(wrapper.text()).not.toContain("jump");
    expect(wrapper.findAll("time").map((time) => time.attributes("datetime"))).toEqual([
      "2026-08-10T12:00:00Z", "2026-08-10T13:00:00Z", "2026-08-10T14:00:00Z",
    ]);
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
    expect(wrapper.get("h5").text()).toBe("Revealed story moment");
    expect(wrapper.get("article").element.tagName).toBe("ARTICLE");
    expect(wrapper.get("time").attributes("datetime")).toBe("2026-08-10T12:00:00Z");
    expect(wrapper.findAll("button, a, [tabindex]")).toHaveLength(0);
  });
});
