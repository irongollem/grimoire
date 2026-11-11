import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { computed, ref } from "vue";
import EntityEmbedView from "./EntityEmbedView.vue";
import { placeRoute } from "@/lib/locations/placeRoute";
import { EMBED_DETACH_EVENT, EMBED_OPEN_EVENT } from "@/scriptorium/lib/panel/embedSignals";
import ScriptoriumDocumentView from "./ScriptoriumDocumentView.vue";
import type { JSONContent } from "@tiptap/core";
import type { ReadableBook } from "@/scriptorium/types";

function flushEditor(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

const mocks = vi.hoisted(() => ({ dmData: vi.fn(), playerEmbed: vi.fn(), push: vi.fn(), confirm: vi.fn() }));

vi.mock("vue-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("vue-router")>()),
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: mocks.confirm }) }));
vi.mock("@/scriptorium/composables/useEntityEmbedData", () => ({ useEntityEmbedData: mocks.dmData }));
vi.mock("@/scriptorium/composables/usePlayerEntityEmbed", () => ({ usePlayerEntityEmbed: mocks.playerEmbed }));

/** The book's head plus the one chapter the view renders, kept together so a case reads as one document. */
function makeDoc(embedType: string, campaignId: string | null = "camp-1"): ReadableBook & { content: JSONContent } {
  return {
    id: "doc-1",
    title: "Handout",
    kind: "handout",
    content: {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Before" }] },
        { type: "entityEmbed", attrs: { entityType: embedType, entityId: "e1", showArt: true } },
      ],
    },
    doc_type: "custom",
    campaign_id: campaignId,
    theme: "onednd2024",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
}

/** Mounts the read-only view on that document's own chapter. */
function mountView(document: ReturnType<typeof makeDoc>, extra: { audience?: "dm" | "player" } = {}) {
  return mount(ScriptoriumDocumentView, { props: { document, content: document.content, ...extra } });
}

beforeEach(() => {
  mocks.dmData.mockReset();
  mocks.playerEmbed.mockReset();
  mocks.dmData.mockReturnValue({ lookup: ref({}), isLoading: ref(false) });
});

describe("EntityEmbedView audience", () => {
  it("never constructs useEntityEmbedData for a player", async () => {
    mocks.playerEmbed.mockReturnValue({ html: computed(() => null), isLoading: computed(() => false) });
    mountView(makeDoc("npc"), { audience: "player" });
    await flushEditor();
    expect(mocks.dmData).not.toHaveBeenCalled();
    expect(mocks.playerEmbed).toHaveBeenCalledWith("npc", "e1", "camp-1", expect.any(Function));
  });

  it("renders nothing, not even a missing marker, for an embed the player cannot see", async () => {
    mocks.playerEmbed.mockReturnValue({ html: computed(() => null), isLoading: computed(() => false) });
    const wrapper = mountView(makeDoc("npc"), { audience: "player" });
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
    const wrapper = mountView(makeDoc("npc"), { audience: "player" });
    await flushEditor();
    const body = wrapper.find(".sc-entity-embed-body");
    expect(body.text()).toContain("Mira");
    expect(body.text()).toContain("Elf");
    expect(body.text()).not.toContain("Identity");
  });

  it("still resolves through useEntityEmbedData for the DM", async () => {
    mountView(makeDoc("npc"));
    await flushEditor();
    expect(mocks.dmData).toHaveBeenCalled();
    expect(mocks.playerEmbed).not.toHaveBeenCalled();
  });
});

describe("EntityEmbedView theme", () => {
  it("formats an embedded entity in the document's own theme, for the DM and for a player", async () => {
    mocks.dmData.mockReturnValue({ lookup: ref({}), isLoading: ref(false) });
    mountView({ ...makeDoc("monster"), theme: "phb2014" });
    await flushEditor();
    expect(mocks.dmData.mock.calls[0][1].theme.value).toBe("phb2014");

    mocks.playerEmbed.mockReturnValue({ html: computed(() => null), isLoading: computed(() => false) });
    mountView({ ...makeDoc("monster"), theme: "phb2014" }, { audience: "player" });
    await flushEditor();
    expect(mocks.playerEmbed.mock.calls[0][3]()).toBe("phb2014");
  });
});

describe("EntityEmbedView as the DM edits it", () => {
  const insertContentAt = vi.fn();
  const chain = { focus: () => chain, insertContentAt: (...args: unknown[]) => { insertContentAt(...args); return chain; }, run: vi.fn() };

  beforeEach(() => {
    insertContentAt.mockReset();
    mocks.push.mockReset();
    mocks.confirm.mockReset().mockResolvedValue(true);
    mocks.dmData.mockReturnValue({ lookup: ref({ "monster:e1": "<h1>Owlbear</h1>" }), isLoading: ref(false) });
  });

  // The node-view props are Tiptap's own (a live Editor, a ProseMirror node); the view reads only the few members given here.
  function mountEmbed(attrs: Record<string, unknown> = {}, getPos: () => number | undefined = () => 7) {
    return mount(EntityEmbedView, {
      props: {
        node: { attrs: { entityType: "monster", entityId: "e1", ...attrs }, nodeSize: 1 },
        editor: { isEditable: true, chain: () => chain },
        updateAttributes: vi.fn(),
        getPos,
      } as never,
      global: { stubs: { NodeViewWrapper: { template: "<div><slot /></div>" } } },
    });
  }
  const tool = (w: ReturnType<typeof mountEmbed>, label: string) =>
    w.findAllComponents({ name: "AppButton" }).find((b) => b.props("label") === label)!;

  // Fails on: the size, art, lore, band and reveal controls coming back onto the page, which the panel beside it now owns.
  it("keeps only Open and Detach on the page; the other options are chosen in the panel", () => {
    const labels = mountEmbed()
      .findAllComponents({ name: "AppButton" })
      .map((b) => b.props("label"));
    expect(labels).toEqual(["Open", "Detach…"]);
    expect(mountEmbed().findComponent({ name: "SegmentedControl" }).exists()).toBe(false);
  });

  it("opens a monster by its page and a location by its place route", async () => {
    await tool(mountEmbed(), "Open").trigger("click");
    expect(mocks.push).toHaveBeenLastCalledWith("/monsters/e1");
    await tool(mountEmbed({ entityType: "location" }), "Open").trigger("click");
    expect(mocks.push).toHaveBeenLastCalledWith(placeRoute("e1"));
  });

  // Fails on: the panel's Open and Detach buttons doing nothing because the view stopped answering the event.
  it("answers the panel's open and detach requests on its own element", async () => {
    const wrapper = mountEmbed({}, () => 7);
    const entry = wrapper.find(".sc-entity-embed").element;
    entry.dispatchEvent(new CustomEvent(EMBED_OPEN_EVENT));
    expect(mocks.push).toHaveBeenLastCalledWith("/monsters/e1");
    entry.dispatchEvent(new CustomEvent(EMBED_DETACH_EVENT));
    await flushEditor();
    expect(mocks.confirm).toHaveBeenCalledTimes(1);
    expect(insertContentAt).toHaveBeenCalledTimes(1);
    wrapper.unmount();
    entry.dispatchEvent(new CustomEvent(EMBED_OPEN_EVENT));
    expect(mocks.push).toHaveBeenCalledTimes(1);
  });

  it("keeps the link when the detach is cancelled, and when the block has no position", async () => {
    mocks.confirm.mockResolvedValue(false);
    await tool(mountEmbed(), "Detach…").trigger("click");
    await flushEditor();
    expect(insertContentAt).not.toHaveBeenCalled();
    mocks.confirm.mockResolvedValue(true);
    await tool(mountEmbed({}, () => undefined), "Detach…").trigger("click");
    await flushEditor();
    expect(insertContentAt).not.toHaveBeenCalled();
  });

  it("detaches into the content it was showing, in the block's place", async () => {
    await tool(mountEmbed(), "Detach…").trigger("click");
    await flushEditor();
    expect(insertContentAt).toHaveBeenCalledTimes(1);
    expect(insertContentAt.mock.calls[0][0]).toEqual({ from: 7, to: 8 });
    expect(insertContentAt.mock.calls[0][1]).toContain("Owlbear");
  });
});
