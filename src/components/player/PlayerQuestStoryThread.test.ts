import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import PlayerQuestStoryThread from "./PlayerQuestStoryThread.vue";
import type { PlayerQuestBeat } from "@/types/quest.types";

const mocks = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("vue-router", () => ({ useRouter: () => ({ push: mocks.push }) }));

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
    staged_at_location_id: null,
    thread_id: "thread-main",
    thread_label: "Main",
    is_current: false,
    payoff: [],
    ...overrides,
  };
}

describe("PlayerQuestStoryThread", () => {
  it("groups revealed and rumored beats into one column per thread, Main first", () => {
    const wrapper = mount(PlayerQuestStoryThread, {
      props: {
        beats: [
          beat({ id: "vault-1", story_order: 1, thread_id: "thread-vault", thread_label: "The Drowned Vault", player_text: "A drowned strongroom." }),
          beat({ id: "petition-1", story_order: 0, player_text: "Maerin asked for help." }),
        ],
      },
    });

    const eyebrows = wrapper.findAll("h4").map((h) => h.text());
    expect(eyebrows).toEqual(["Main", "Also following — The Drowned Vault"]);
    expect(wrapper.text()).toContain("Maerin asked for help.");
    expect(wrapper.text()).toContain("A drowned strongroom.");
  });

  it("renders a rumoured beat's card with the Rumoured: prefix and its rumor_text-backed player_text", () => {
    const wrapper = mount(PlayerQuestStoryThread, {
      props: { beats: [beat({ visibility: "rumored", player_text: "The almoner keeps a second ledger." })] },
    });

    expect(wrapper.find("em").text()).toBe("Rumoured:");
    expect(wrapper.text()).toContain("The almoner keeps a second ledger.");
  });

  it("marks the current beat with a happening-now chip", () => {
    const wrapper = mount(PlayerQuestStoryThread, {
      props: { beats: [beat({ is_current: true }), beat({ id: "other", story_order: 1, is_current: false })] },
    });

    expect(wrapper.text()).toContain("happening now");
    // Only the current beat's card carries the marker.
    const articles = wrapper.findAll("article");
    expect(articles[0]!.text()).toContain("happening now");
    expect(articles[1]!.text()).not.toContain("happening now");
  });

  it("shows a knowledge payoff chip with its granted text", () => {
    const wrapper = mount(PlayerQuestStoryThread, {
      props: { beats: [beat({ payoff: [{ kind: "knowledge", text: "The tithe's true collector" }] })] },
    });

    expect(wrapper.text()).toContain("The tithe's true collector");
  });

  it("renders claimable loot as a clickable chip that opens chat, and claimed loot as a dimmed static chip", async () => {
    const wrapper = mount(PlayerQuestStoryThread, {
      props: {
        beats: [
          beat({
            payoff: [
              { kind: "loot", label: "the second ledger", state: "claimable", claimed_by: null, message_id: "msg-1" },
              { kind: "loot", label: "80 gp", state: "claimed", claimed_by: "Hero A", message_id: "msg-2" },
            ],
          }),
        ],
      },
    });

    expect(wrapper.text()).toContain("80 gp · claimed");
    const claimButton = wrapper.findAll("button").find((button) => button.text().includes("Claim: the second ledger"));
    expect(claimButton).toBeTruthy();
    await claimButton!.trigger("click");
    expect(mocks.push).toHaveBeenCalledWith("/play/chat");
  });

  it("never renders hidden or DM-only fields from a malformed client object", () => {
    const malformed = {
      ...beat({ id: "hidden", visibility: "hidden" as PlayerQuestBeat["visibility"], player_text: "LEAKED PLAYER COPY" }),
      title: "SECRET NODE TITLE",
      dm_content: "SECRET DM LEAD",
      read_aloud: "SECRET READ ALOUD",
      how_it_plays: "SECRET GUIDANCE",
    } as PlayerQuestBeat;
    const wrapper = mount(PlayerQuestStoryThread, { props: { beats: [malformed] } });
    expect(wrapper.text()).not.toMatch(/LEAKED|SECRET/);
    expect(wrapper.text()).toContain("No confirmed story moments have been revealed yet.");
  });

  it("shows deliberate empty-state copy when nothing is visible yet", () => {
    const wrapper = mount(PlayerQuestStoryThread, { props: { beats: [] } });
    expect(wrapper.text()).toContain("No confirmed story moments have been revealed yet.");
    expect(wrapper.find("ol").exists()).toBe(false);
  });

  it("orders beats within a column by story_order, not array position", () => {
    const wrapper = mount(PlayerQuestStoryThread, {
      props: {
        beats: [
          beat({ id: "keep", player_text: "Last the keep.", story_order: 2 }),
          beat({ id: "gate", player_text: "First the gate.", story_order: 0 }),
          beat({ id: "bridge", player_text: "Then the bridge.", story_order: 1 }),
        ],
      },
    });

    expect(wrapper.findAll("article").map((article) => article.text())).toEqual([
      expect.stringContaining("First the gate."),
      expect.stringContaining("Then the bridge."),
      expect.stringContaining("Last the keep."),
    ]);
  });

  // The frame's footnotes ("A rumoured beat shows rumor_text…", "A thread
  // exists for players only once…") are the designer's annotations about the
  // projection, addressed to whoever builds it. They are not player copy.
  it("does not print the frame's annotations at the player", () => {
    const wrapper = mount(PlayerQuestStoryThread, { props: { beats: [beat()] } });
    expect(wrapper.text()).not.toContain("rumor_text");
    expect(wrapper.text()).not.toContain("A thread exists for players");
    expect(wrapper.find("code").exists()).toBe(false);
  });

  it("shows a wordless current beat as a chip row with no empty paragraph, and skips a wordless idle one", () => {
    const wrapper = mount(PlayerQuestStoryThread, {
      props: { beats: [beat({ id: "now", player_text: null, is_current: true }), beat({ id: "idle", player_text: null, story_order: 1 })] },
    });
    expect(wrapper.findAll("article")).toHaveLength(1);
    expect(wrapper.find("article p").exists()).toBe(false);
    expect(wrapper.text()).toContain("happening now");
  });

  it("says a rumour is circulating when the rumour has no text yet", () => {
    const wrapper = mount(PlayerQuestStoryThread, { props: { beats: [beat({ visibility: "rumored", player_text: null })] } });
    expect(wrapper.text()).toContain("a rumour is circulating");
  });

  it("uses a labelled section, heading hierarchy, list, and article semantics", () => {
    const wrapper = mount(PlayerQuestStoryThread, { props: { beats: [beat()] } });
    expect(wrapper.get("section[aria-labelledby='quest-story-heading']").attributes("aria-labelledby")).toBe("quest-story-heading");
    expect(wrapper.get("h3#quest-story-heading").text()).toBe("Story so far");
    expect(wrapper.get("ol").attributes("aria-label")).toBe("Main story so far");
    expect(wrapper.get("article").element.tagName).toBe("ARTICLE");
  });
});
