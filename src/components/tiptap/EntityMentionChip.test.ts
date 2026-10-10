import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { ref } from "vue";
import EntityMentionChip from "./EntityMentionChip.vue";
import type { EntityType } from "@/lib/tiptap/nodeViewTypes";

const push = vi.fn();
const route = { path: "/npcs/npc-1" };
vi.mock("vue-router", () => ({
  useRouter: () => ({ push }),
  useRoute: () => route,
}));
vi.mock("@/stores/ui/app", () => ({
  useAppUiStore: () => ({ dmPreviewMode: false }),
}));
vi.mock("@/stores/ui/player", () => ({
  usePlayerUiStore: () => ({ openPlayerLocationDialog: vi.fn() }),
}));

// The chip resolves its own name now (one mention, one lookup) rather than
// reading an extension option — see useMentionName.ts's own tests for the
// DM/player resolution logic itself; this file only exercises what the chip
// does with whatever that resolver returns.
const resolvedName = ref<string | null>(null);
vi.mock("@/composables/notes/useMentionName", () => ({
  useMentionName: () => resolvedName,
}));

function mountChip(options: { editable?: boolean; entityType?: string; id?: string; name?: string | null }) {
  resolvedName.value = options.name ?? null;
  return mount(EntityMentionChip, {
    props: {
      editable: options.editable ?? false,
      entityType: (options.entityType ?? "npc") as EntityType,
      id: options.id ?? "npc-1",
    },
  });
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
