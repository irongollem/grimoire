import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { computed, ref } from "vue";
import ScriptoriumDocumentView from "./ScriptoriumDocumentView.vue";
import type { ScriptoriumDocument } from "@/types/scriptorium.types";

function flushEditor(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

const mocks = vi.hoisted(() => ({ dmData: vi.fn(), playerEmbed: vi.fn() }));

vi.mock("vue-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("vue-router")>()),
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/composables/scriptorium/useEntityEmbedData", () => ({ useEntityEmbedData: mocks.dmData }));
vi.mock("@/composables/scriptorium/usePlayerEntityEmbed", () => ({ usePlayerEntityEmbed: mocks.playerEmbed }));

function makeDoc(embedType: string, campaignId: string | null = "camp-1"): ScriptoriumDocument {
  return {
    id: "doc-1",
    user_id: "user-1",
    title: "Handout",
    content: JSON.stringify({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Before" }] },
        { type: "entityEmbed", attrs: { entityType: embedType, entityId: "e1", showArt: true } },
      ],
    }),
    doc_type: "custom",
    campaign_id: campaignId,
    player_visible_to: ["member-1"],
    tags: [],
    is_published: false,
    is_two_column: false,
    theme: "onednd2024",
    page_size: "A4",
    ink_friendly: false,
    word_count: 1,
    show_page_numbers: false,
    footer_text: "",
    page_number_start: 1,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
}

beforeEach(() => {
  mocks.dmData.mockReset();
  mocks.playerEmbed.mockReset();
  mocks.dmData.mockReturnValue({ lookup: ref({}), isLoading: ref(false) });
});

describe("EntityEmbedView audience", () => {
  it("never constructs useEntityEmbedData for a player", async () => {
    mocks.playerEmbed.mockReturnValue({ html: computed(() => null), isLoading: computed(() => false) });
    mount(ScriptoriumDocumentView, { props: { document: makeDoc("npc"), audience: "player" } });
    await flushEditor();
    expect(mocks.dmData).not.toHaveBeenCalled();
    expect(mocks.playerEmbed).toHaveBeenCalledWith("npc", "e1", "camp-1", expect.any(Function));
  });

  it("renders nothing, not even a missing marker, for an embed the player cannot see", async () => {
    mocks.playerEmbed.mockReturnValue({ html: computed(() => null), isLoading: computed(() => false) });
    const wrapper = mount(ScriptoriumDocumentView, { props: { document: makeDoc("npc"), audience: "player" } });
    await flushEditor();
    expect(wrapper.text()).toContain("Before");
    expect(wrapper.find(".sc-entity-embed").exists()).toBe(true);
    expect(wrapper.find(".sc-entity-embed-body").exists()).toBe(false);
    expect(wrapper.find(".sc-entity-embed-missing").exists()).toBe(false);
    expect(wrapper.find(".sc-entity-embed-toolbar").exists()).toBe(false);
    expect(wrapper.find(".sc-entity-embed").text()).toBe("");
  });

  it("shows only the projected NPC fields", async () => {
    mocks.playerEmbed.mockReturnValue({
      html: computed(() => "<h1>Mira</h1>\n<p><em>Elf</em></p>\n"),
      isLoading: computed(() => false),
    });
    const wrapper = mount(ScriptoriumDocumentView, { props: { document: makeDoc("npc"), audience: "player" } });
    await flushEditor();
    const body = wrapper.find(".sc-entity-embed-body");
    expect(body.text()).toContain("Mira");
    expect(body.text()).toContain("Elf");
    expect(body.text()).not.toContain("Identity");
  });

  it("still resolves through useEntityEmbedData for the DM", async () => {
    mount(ScriptoriumDocumentView, { props: { document: makeDoc("npc") } });
    await flushEditor();
    expect(mocks.dmData).toHaveBeenCalled();
    expect(mocks.playerEmbed).not.toHaveBeenCalled();
  });
});
