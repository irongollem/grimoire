import { describe, expect, it, vi, beforeEach } from "vitest";
import { computed, ref } from "vue";
import { mount } from "@vue/test-utils";
import CartographerDressingPanel from "./CartographerDressingPanel.vue";
import type { LibraryDressing } from "@/types/dressing.types";

const { rows, loading } = vi.hoisted(() => ({
  rows: { value: [] as unknown[] },
  loading: { value: false },
}));

vi.mock("@/composables/cartographer/useLibraryDressing", () => ({
  useLibraryDressing: () => ({ data: computed(() => rows.value), isLoading: computed(() => loading.value) }),
}));
vi.mock("@/composables/library/useEnabledSources", () => ({
  useAvailableLibraryDressingSources: () => ({ data: ref([]), isLoading: ref(false) }),
}));
vi.mock("@/components/common/settings/SourcesPickerPanel.vue", () => ({
  default: { name: "SourcesPickerPanel", template: "<div data-testid=picker />" },
}));

function prop(over: Partial<LibraryDressing>): LibraryDressing {
  return {
    id: "p", name: "Prop", group_key: "furniture", tags: [], footprint_w: 1, footprint_h: 1,
    image_url: null, source: "grimoire-dressing", ...over,
  };
}

const TABLE = prop({ id: "table", name: "Long table", tags: ["dining"], footprint_w: 3, footprint_h: 1 });
const COFFIN = prop({ id: "coffin", name: "Coffin", group_key: "remains", footprint_w: 1, footprint_h: 2, image_url: "https://cdn/c.webp" });

function mountPanel(over: Record<string, unknown> = {}) {
  return mount(CartographerDressingPanel, {
    props: { brushId: null, brushRotation: 0, selected: null, ...over },
  });
}

beforeEach(() => {
  rows.value = [TABLE, COFFIN];
  loading.value = false;
});

describe("CartographerDressingPanel", () => {
  it("lists props under their group, in the picker's group order", () => {
    const wrapper = mountPanel();
    expect(wrapper.findAll("h4").map((h) => h.text())).toEqual(["Furniture", "Remains"]);
    expect(wrapper.text()).toContain("3×1");
    expect(wrapper.text()).toContain("1×2");
  });

  it("shows the library picture when there is one, a footprint box when there is not", () => {
    const wrapper = mountPanel();
    expect(wrapper.findAll("img").map((i) => i.attributes("src"))).toEqual(["https://cdn/c.webp"]);
  });

  it("arms a prop on click and disarms it on a second click", async () => {
    const wrapper = mountPanel();
    const tile = wrapper.findAll("button").find((b) => b.text().includes("Long table"))!;
    await tile.trigger("click");
    expect(wrapper.emitted("update:brushId")).toEqual([["table"]]);

    await wrapper.setProps({ brushId: "table" });
    const armedTile = wrapper.findAll("button").find((b) => b.text().includes("Long table"))!;
    expect(armedTile.attributes("aria-pressed")).toBe("true");
    await armedTile.trigger("click");
    expect(wrapper.emitted("update:brushId")?.[1]).toEqual([null]);
  });

  it("filters by name or tag, case-insensitively, and says so when nothing matches", async () => {
    const wrapper = mountPanel();
    const input = wrapper.get("input");
    await input.setValue("DINING");
    expect(wrapper.text()).toContain("Long table");
    expect(wrapper.text()).not.toContain("Coffin");
    await input.setValue("zzz");
    expect(wrapper.text()).toContain("No props match.");
  });

  it("points at the book icon when no book is switched on", () => {
    rows.value = [];
    expect(mountPanel().text()).toContain("Switch on a dressing book from the book icon to place props.");
  });

  it("shows a skeleton, not the empty line, while the sources are loading", () => {
    rows.value = [];
    loading.value = true;
    const wrapper = mountPanel();
    expect(wrapper.find("[role=status]").exists()).toBe(true);
    expect(wrapper.text()).not.toContain("Switch on");
  });

  it("changes its hint with the brush", async () => {
    const wrapper = mountPanel();
    expect(wrapper.text()).toContain("Pick a prop to place it");
    await wrapper.setProps({ brushId: "table" });
    expect(wrapper.text()).toContain("Esc puts it down");
  });

  it("without a selection the rotate row turns the brush", async () => {
    const wrapper = mountPanel({ brushRotation: 0 });
    await wrapper.findAll("button").find((b) => b.text().includes("E"))!.trigger("click");
    expect(wrapper.emitted("update:brushRotation")).toEqual([[90]]);
    expect(wrapper.emitted("rotateSelected")).toBeUndefined();
  });

  it("with a selection the rotate row and Delete act on that prop", async () => {
    const wrapper = mountPanel({ selected: { name: "Long table", rotation: 180 } });
    expect(wrapper.text()).toContain("Long table");
    expect(wrapper.get("[data-testid=rotation-readout]").text()).toBe("180°");
    await wrapper.findAll("button").find((b) => b.text().includes("E"))!.trigger("click");
    expect(wrapper.emitted("rotateSelected")).toEqual([[270]]);
    expect(wrapper.emitted("update:brushRotation")).toBeUndefined();
    await wrapper.findAll("button").find((b) => b.text().includes("Delete"))!.trigger("click");
    expect(wrapper.emitted("deleteSelected")).toHaveLength(1);
  });
});
