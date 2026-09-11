import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { QuestBeat, QuestBeatAttachmentSummary } from "@/types/quest.types";
import { threadBadges } from "@/lib/quests/threads";
import QuestRunBeatCard from "./QuestRunBeatCard.vue";

// A plain box, not a `ref`: same convention as QuestAdvanceDialog.test.ts —
// set once before each case mounts, never toggled reactively mid-test.
const mocks = vi.hoisted(() => ({ belowXl: { value: false } }));
vi.mock("@/composables/useBreakpoint", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/composables/useBreakpoint")>(),
  useBelow: () => mocks.belowXl,
}));

const beat = (visibility: QuestBeat["visibility"], overrides: Partial<QuestBeat> = {}): QuestBeat => ({
  id: "beat-1", quest_id: "quest-1", campaign_id: "campaign-1", title: "The bell tolls",
  dm_content: null, read_aloud: null, how_it_plays: null, converge_mode: "any",
  rumor_text: null, reveal_text: null, visibility, kind: "discovery", presentation_hint: null,
  canvas_x: 0, canvas_y: 0, is_improvised: false, staged_at_location_id: null, improv_reviewed_at: null,
  created_by: "dm", created_at: "now", updated_at: "now",
  ...overrides,
});

const threadBadge = threadBadges([{ id: "t1", label: "Main", status: "live" as const, created_at: "2026-01-01T00:00:00Z" }])[0]!;

describe("QuestRunBeatCard", () => {
  beforeEach(() => {
    mocks.belowXl.value = false;
  });

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

  it("puts a check first as a primary Roll button, ahead of other placements", () => {
    const attachments: QuestBeatAttachmentSummary[] = [
      {
        id: "a-npc", beat_id: "beat-1", quest_id: "quest-1", campaign_id: "campaign-1", attachment_type: "npc",
        ref_id: "npc-1", role: "", is_required: true, metadata: {}, sort_order: 0, created_by: "dm", created_at: "now",
        label: "Ser Vallis", target_exists: true, prep_gap: false, compact_detail: null, full_editor_to: "/npcs/npc-1",
      },
      {
        id: "a-check", beat_id: "beat-1", quest_id: "quest-1", campaign_id: "campaign-1", attachment_type: "check",
        ref_id: "check", role: "", is_required: true, metadata: { skill: "Insight", dc: 15, contested_by: "Deception" },
        sort_order: 1, created_by: "dm", created_at: "now", label: "Insight DC 15", target_exists: true, prep_gap: false,
        compact_detail: "Contested by Deception", full_editor_to: null,
      },
    ];
    const wrapper = mount(QuestRunBeatCard, {
      props: { anchorQuestId: "quest-1", beat: beat("revealed"), attachments, threadBadge, placeName: null },
      global: { stubs: { RichTextViewer: true, RouterLink: { template: "<a><slot /></a>" } } },
    });
    const attachmentButtons = wrapper
      .findAllComponents({ name: "AppButton" })
      .filter((button) => ["Roll Insight", "Ser Vallis"].includes(button.props("label")));
    expect(attachmentButtons.map((button) => button.props("label"))).toEqual(["Roll Insight", "Ser Vallis"]);
    expect(attachmentButtons[0]!.props("variant")).toBe("primary");
    expect(attachmentButtons[1]!.props("variant")).toBe("subtle");
  });

  // #872, frame 1: below `xl` the DM content / how-it-plays block collapses
  // into a fold row rather than sitting open on the card.
  it("collapses DM content and how-it-plays into a fold row below xl, with a paragraph count", () => {
    mocks.belowXl.value = true;
    const withCount = beat("revealed", { dm_content: JSON.stringify({ type: "doc", content: [{ type: "paragraph" }, { type: "paragraph" }] }) });
    const wrapper = mount(QuestRunBeatCard, {
      props: { anchorQuestId: "quest-1", beat: withCount, attachments: [], threadBadge, placeName: null },
      global: { stubs: { RichTextViewer: true, RouterLink: { template: "<a><slot /></a>" } } },
    });
    expect(wrapper.findComponent({ name: "QuestFoldRow" }).exists()).toBe(true);
    expect(wrapper.text()).toContain("DM notes & how it plays");
    expect(wrapper.text()).toContain("2 paragraphs");
    expect(wrapper.find("section.space-y-3").exists()).toBe(false);
  });

  it("falls back to a plain 'notes' caption when the content isn't parseable Tiptap JSON", () => {
    mocks.belowXl.value = true;
    const legacy = beat("revealed", { dm_content: "Plain legacy notes" });
    const wrapper = mount(QuestRunBeatCard, {
      props: { anchorQuestId: "quest-1", beat: legacy, attachments: [], threadBadge, placeName: null },
      global: { stubs: { RichTextViewer: true, RouterLink: { template: "<a><slot /></a>" } } },
    });
    expect(wrapper.text()).toContain("notes");
  });

  it("renders the DM content plainly, unfolded, at xl and above", () => {
    mocks.belowXl.value = false;
    const withContent = beat("revealed", { dm_content: JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] }) });
    const wrapper = mount(QuestRunBeatCard, {
      props: { anchorQuestId: "quest-1", beat: withContent, attachments: [], threadBadge, placeName: null },
      global: { stubs: { RichTextViewer: true, RouterLink: { template: "<a><slot /></a>" } } },
    });
    expect(wrapper.findComponent({ name: "QuestFoldRow" }).exists()).toBe(false);
    expect(wrapper.find("section.space-y-3").exists()).toBe(true);
  });
});
