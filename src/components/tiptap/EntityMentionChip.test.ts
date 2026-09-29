import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { ref } from "vue";
import type { NodeViewProps } from "@tiptap/core";
import EntityMentionChip from "./EntityMentionChip.vue";

const push = vi.fn();
const route = { path: "/npcs/npc-1" };
vi.mock("vue-router", () => ({
  useRouter: () => ({ push }),
  useRoute: () => route,
}));
vi.mock("@/stores/ui", () => ({
  useUiStore: () => ({ dmPreviewMode: false, openPlayerLocationDialog: vi.fn() }),
}));

// The chip resolves its own name now (one mention, one lookup) rather than
// reading an extension option — see useMentionName.ts's own tests for the
// DM/player resolution logic itself; this file only exercises what the chip
// does with whatever that resolver returns.
const resolvedName = ref<string | null>(null);
vi.mock("@/composables/notes/useMentionName", () => ({
  useMentionName: () => resolvedName,
}));

/**
 * A real `NodeViewProps` is a ProseMirror `Node`/`Editor` pair this test has
 * no reason to construct — the chip only reads `editor.isEditable` and
 * `node.attrs.{id,entityType}`, so the rest of the shape is stubbed and cast
 * once, the same "as unknown as" escape hatch other component tests here use
 * for a type the mock doesn't need to satisfy structurally (e.g.
 * `NpcDetail.test.ts`).
 */
function mountChip(options: { editable?: boolean; entityType?: string; id?: string; name?: string | null }) {
  resolvedName.value = options.name ?? null;
  const props = {
    editor: { isEditable: options.editable ?? false },
    node: { attrs: { entityType: options.entityType ?? "npc", id: options.id ?? "npc-1" } },
    extension: {},
    decorations: [],
    selected: false,
    getPos: () => 0,
    updateAttributes: vi.fn(),
    deleteNode: vi.fn(),
    view: {},
    innerDecorations: {},
    HTMLAttributes: {},
  } as unknown as NodeViewProps;
  return mount(EntityMentionChip, { props });
}

describe("EntityMentionChip — unknown mention (#932 story 3)", () => {
  it("renders '???' and no button when the resolver returns null", () => {
    const wrapper = mountChip({ name: null });
    expect(wrapper.text()).toContain("???");
    expect(wrapper.find("button").exists()).toBe(false);
  });

  it("gives the unknown chip a title that names nothing", () => {
    const wrapper = mountChip({ name: null });
    expect(wrapper.find(".entity-chip--unknown").attributes("title")).toBe("Unknown");
  });

  it("cannot navigate when unknown — there is no clickable element to click", async () => {
    const wrapper = mountChip({ name: null });
    await wrapper.find(".entity-chip--unknown").trigger("click");
    expect(push).not.toHaveBeenCalled();
  });

  it("renders a muted, non-clickable chip in editor mode too, when unknown", () => {
    const wrapper = mountChip({ editable: true, name: null });
    expect(wrapper.find("button").exists()).toBe(false);
    expect(wrapper.text()).toContain("???");
    expect(wrapper.find(".entity-chip--unknown").exists()).toBe(true);
  });
});

describe("EntityMentionChip — known mention", () => {
  it("renders the resolved name as a clickable chip with a naming title", () => {
    const wrapper = mountChip({ name: "Elminster" });
    expect(wrapper.text()).toContain("Elminster");
    expect(wrapper.find("button").attributes("title")).toBe("Go to npc: Elminster");
  });

  it("navigates to the DM entity route on click", async () => {
    route.path = "/npcs/npc-1";
    const wrapper = mountChip({ name: "Elminster", entityType: "npc", id: "npc-1" });
    await wrapper.find("button").trigger("click");
    expect(push).toHaveBeenCalledWith("/npcs/npc-1");
  });

  it("renders a static (non-clickable) chip in editor mode", () => {
    const wrapper = mountChip({ editable: true, name: "Elminster" });
    expect(wrapper.find("button").exists()).toBe(false);
    expect(wrapper.text()).toContain("Elminster");
  });
});

describe("EntityMentionChip — /play root counts as the player portal", () => {
  it("navigates via the player list route (not the DM detail route) when the path is exactly /play", async () => {
    route.path = "/play";
    const wrapper = mountChip({ name: "Elminster", entityType: "npc", id: "npc-1" });
    await wrapper.find("button").trigger("click");
    expect(push).toHaveBeenCalledWith("/play/party");
  });
});
