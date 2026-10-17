import { beforeEach, describe, expect, it, vi } from "vitest";
import { computed, ref } from "vue";
import { mount } from "@vue/test-utils";
import CartographerPlaceCatalog from "./CartographerPlaceCatalog.vue";
import type { LibraryDressing } from "@/types/dressing.types";

const { enabledRows, allRows, available, slugs, enableMutate } = vi.hoisted(() => ({
  enabledRows: { value: [] as unknown[] },
  allRows: { value: [] as unknown[] },
  available: { value: [] as unknown[] },
  slugs: { value: [] as string[] | null },
  enableMutate: vi.fn(),
}));

vi.mock("@/composables/cartographer/useLibraryDressing", () => ({
  useLibraryDressing: () => ({ data: computed(() => enabledRows.value), isLoading: ref(false) }),
  useAllLibraryDressing: () => ({ data: computed(() => allRows.value) }),
}));
vi.mock("@/composables/library/useEnabledSources", () => ({
  useAvailableLibraryDressingSources: () => ({ data: computed(() => available.value), isLoading: ref(false) }),
  useLibrarySourceSlugs: () => ({ slugs: computed(() => slugs.value) }),
  useEnableSource: () => ({ mutate: enableMutate }),
  useEnableUserSource: () => ({ mutate: vi.fn() }),
}));
vi.mock("@/composables/library/useSourceTitles", () => ({
  useSourceTitles: () => ({
    labelFor: (source: string, stored?: string | null) =>
      ({ "grimoire-dressing": "Grimoire Dressing" } as Record<string, string>)[source] ?? stored ?? null,
  }),
}));
vi.mock("@/composables/rules/useRuleset", () => ({ useContentScope: () => ({ standalone: ref(false) }) }));
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ error: vi.fn(), fromError: (e: unknown) => String(e) }) }));
vi.mock("@/components/common/settings/SourcesPickerPanel.vue", () => ({
  default: { name: "SourcesPickerPanel", template: "<div data-testid=picker />" },
}));

function prop(over: Partial<LibraryDressing>): LibraryDressing {
  return {
    id: "p", name: "Prop", group_key: "furniture", tags: [], footprint_w: 1, footprint_h: 1,
    image_url: null, source: "grimoire-dressing", flat: false, light: null, sway: null, ...over,
  };
}

const TABLE = prop({ id: "table", name: "Long table", tags: ["dining"], footprint_w: 3 });
const COFFIN = prop({ id: "coffin", name: "Coffin", group_key: "remains", footprint_h: 2, image_url: "https://cdn/c.webp" });
const CAMP = prop({ id: "fire", name: "Campfire", group_key: "camp", source: "wild-camp", image_url: "https://cdn/f.webp" });

const runtime = {
  manifest: { labels: { objectChest: ["Oak chest", "Iron chest"], objectBarrel: ["Hollow log"] } },
  variantCount: (c: string) => (c === "objectChest" ? 2 : c === "objectBarrel" ? 1 : 0),
  getTile: () => ({ source: {}, isPlaceholder: true }),
};

function mountCatalog(over: Record<string, unknown> = {}) {
  return mount(CartographerPlaceCatalog, {
    props: { item: null, runtime: runtime as never, setName: "Stone dungeon", recent: [], ...over },
  });
}

const names = (w: ReturnType<typeof mountCatalog>) =>
  w.findAll("button").map((b) => b.attributes("aria-label")).filter(Boolean);

beforeEach(() => {
  enabledRows.value = [TABLE, COFFIN];
  allRows.value = [TABLE, COFFIN, CAMP];
  available.value = [
    { source: "grimoire-dressing", source_title: "Grimoire Dressing", count: 2 },
    { source: "wild-camp", source_title: "Wild Camp", count: 1 },
  ];
  slugs.value = ["grimoire-dressing"];
  enableMutate.mockReset();
});

describe("CartographerPlaceCatalog", () => {
  it("lists the set's objects first: an Any tile and one tile per variant, named by the pack", () => {
    const labels = names(mountCatalog());
    expect(labels).toContain("Chest, any variant");
    expect(labels).toContain("Oak chest");
    expect(labels).toContain("Iron chest");
  });

  it("puts single-variant and artless kinds in one shared grid, captioned, and multi-variant kinds in rows", () => {
    const wrapper = mountCatalog();
    const grid = wrapper.find('[data-testid="single-objects"]');
    expect(grid.text()).toContain("Hollow log"); // one variant, the pack's label
    expect(grid.text()).toContain("Table"); // no art yet, the schema's name
    expect(grid.text()).not.toContain("Chest");
    expect(grid.find('[aria-label="Hollow log"]').exists()).toBe(true);
    expect(grid.text()).not.toContain("any variant"); // no separate Any for a lone tile
    const rows = wrapper.findAll('[data-testid="object-row"]');
    expect(rows).toHaveLength(1);
    expect(rows[0].text()).toContain("Chest"); // headed by the schema's name, not "Oak chest"
    expect(rows[0].find('[aria-label="Chest, any variant"]').exists()).toBe(true);
  });

  it("picks the lone tile of a single-variant kind as that kind, marked when it is in hand", async () => {
    const wrapper = mountCatalog({ item: { kind: "object", category: "objectBarrel", variant: "any" } });
    expect(wrapper.find('[aria-label="Hollow log"]').attributes("aria-pressed")).toBe("true");
    await wrapper.find('[aria-label="Hollow log"]').trigger("click");
    expect(wrapper.emitted("pick")?.[0]).toEqual([{ kind: "object", category: "objectBarrel", variant: "any" }]);
  });

  it("picks a variant, and Any, as the object the tool stamps", async () => {
    const wrapper = mountCatalog();
    await wrapper.find('[aria-label="Iron chest"]').trigger("click");
    await wrapper.find('[aria-label="Chest, any variant"]').trigger("click");
    expect(wrapper.emitted("pick")).toEqual([
      [{ kind: "object", category: "objectChest", variant: 1 }],
      [{ kind: "object", category: "objectChest", variant: "any" }],
    ]);
  });

  it("marks the armed item", () => {
    const wrapper = mountCatalog({ item: { kind: "object", category: "objectChest", variant: 0 } });
    expect(wrapper.find('[aria-label="Oak chest"]').attributes("aria-pressed")).toBe("true");
    expect(wrapper.find('[aria-label="Iron chest"]').attributes("aria-pressed")).toBe("false");
  });

  it("shows each enabled book under its title, its props by group, and arms a prop", async () => {
    const wrapper = mountCatalog();
    expect(wrapper.text()).toContain("Grimoire Dressing");
    expect(wrapper.text()).toContain("Furniture");
    expect(wrapper.text()).toContain("Remains");
    await wrapper.find('[aria-label="Coffin"]').trigger("click");
    expect(wrapper.emitted("pick")?.[0]).toEqual([{ kind: "prop", propId: "coffin" }]);
  });

  it("offers a book that is not switched on, with a preview and an Enable that switches it on", async () => {
    const wrapper = mountCatalog();
    expect(wrapper.text()).toContain("More books");
    expect(wrapper.text()).toContain("Wild Camp");
    expect(wrapper.findAll("img").some((i) => i.attributes("src") === "https://cdn/f.webp")).toBe(true);
    await wrapper.findAll("button").find((b) => b.text() === "Enable")!.trigger("click");
    expect(enableMutate.mock.calls[0][0]).toEqual({ source_slug: "wild-camp", source_title: "Wild Camp" });
  });

  it("one search filters objects, props and books by name, label and tag", async () => {
    const wrapper = mountCatalog();
    await wrapper.find("input").setValue("dining");
    expect(names(wrapper)).toContain("Long table");
    expect(names(wrapper)).not.toContain("Coffin");
    expect(names(wrapper)).not.toContain("Oak chest");
    await wrapper.find("input").setValue("iron");
    expect(names(wrapper)).toContain("Iron chest");
    expect(names(wrapper)).not.toContain("Oak chest");
    expect(names(wrapper)).not.toContain("Long table");
    await wrapper.find("input").setValue("zzz");
    expect(wrapper.text()).toContain("Nothing matches");
  });

  it("keeps a Recent row of the last picks, hidden while searching", async () => {
    const wrapper = mountCatalog({ recent: [{ kind: "prop", propId: "coffin" }] });
    expect(wrapper.text()).toContain("Recent");
    await wrapper.find("input").setValue("a");
    expect(wrapper.text()).not.toContain("Recent");
  });
});
