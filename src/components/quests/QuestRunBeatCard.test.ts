import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import type { QuestBeat } from "@/types/quest.types";
import { threadBadges } from "@/lib/quests/threads";
import QuestRunBeatCard from "./QuestRunBeatCard.vue";

const beat = (visibility: QuestBeat["visibility"]): QuestBeat => ({
  id: "beat-1", quest_id: "quest-1", campaign_id: "campaign-1", title: "The bell tolls",
  dm_content: null, read_aloud: null, how_it_plays: null, converge_mode: "any",
  rumor_text: null, reveal_text: null, visibility, kind: "discovery", presentation_hint: null,
  canvas_x: 0, canvas_y: 0, is_improvised: false, staged_at_location_id: null, improv_reviewed_at: null,
  created_by: "dm", created_at: "now", updated_at: "now",
});

const threadBadge = threadBadges([{ id: "t1", label: "Main", status: "live" as const, created_at: "2026-01-01T00:00:00Z" }])[0]!;

describe("QuestRunBeatCard", () => {
  it("offers an explicit reveal for the current hidden beat", async () => {
    const wrapper = mount(QuestRunBeatCard, {
      props: { anchorQuestId: "quest-1", beat: beat("hidden"), attachments: [], threadBadge, placeName: null },
      global: { stubs: { RichTextViewer: true, RouterLink: { template: "<a><slot /></a>" } } },
    });
    await wrapper.findAll("button").find((button) => button.text() === "Reveal to players")!.trigger("click");
    expect(wrapper.emitted("reveal")).toHaveLength(1);
  });

  it("shows saved visibility instead of another reveal action", () => {
    const wrapper = mount(QuestRunBeatCard, {
      props: { anchorQuestId: "quest-1", beat: beat("revealed"), attachments: [], threadBadge, placeName: null },
      global: { stubs: { RichTextViewer: true, RouterLink: { template: "<a><slot /></a>" } } },
    });
    expect(wrapper.text()).toContain("Visible to players");
    expect(wrapper.findAll("button").some((button) => button.text().includes("Reveal"))).toBe(false);
  });

  it("names the thread the party is on", () => {
    const wrapper = mount(QuestRunBeatCard, {
      props: { anchorQuestId: "quest-1", beat: beat("revealed"), attachments: [], threadBadge, placeName: "The Cloister" },
      global: { stubs: { RichTextViewer: true, RouterLink: { template: "<a><slot /></a>" } } },
    });
    expect(wrapper.text()).toContain("Party is here · Thread A");
    expect(wrapper.text()).toContain("The Cloister");
  });
});
