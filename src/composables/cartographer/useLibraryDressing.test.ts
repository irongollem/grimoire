import { createApp, defineComponent, h, nextTick, ref } from "vue";
import { flushPromises } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LibraryDressing } from "@/types/dressing.types";
import type { FakeRow } from "@/test/supabaseFake";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
const mocks = vi.hoisted(() => ({ loadDressingImage: vi.fn() }));

vi.mock("@/lib/supabase", () => ({ supabase: fake.client }));
const sources = vi.hoisted(() => ({ slugs: null as { value: string[] | null } | null }));
vi.mock("@/composables/library/useEnabledSources", () => ({ useLibrarySourceSlugs: () => ({ slugs: sources.slugs }) }));
vi.mock("@/cartographer/dressingImages", async () => {
  const actual = await vi.importActual<typeof import("@/cartographer/dressingImages")>("@/cartographer/dressingImages");
  return { ...actual, loadDressingImage: mocks.loadDressingImage };
});

import { useAllLibraryDressing, useDressingCatalog, useLibraryDressing } from "./useLibraryDressing";

function row(id: string, image_url: string | null, source = "grimoire"): FakeRow {
  const dressing: LibraryDressing = { id, name: id, group_key: "furniture", tags: [], footprint_w: 2, footprint_h: 1, image_url, source, flat: false, light: null, sway: null };
  return { ...dressing };
}

/** Runs a composable inside a mounted app so it has the query client, and returns what it returned. */
function inApp<T>(use: () => T): T {
  let out!: T;
  const app = createApp(defineComponent({ setup() { out = use(); return () => h("div"); } }));
  app.use(VueQueryPlugin, { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) });
  app.mount(document.createElement("div"));
  return out;
}

beforeEach(() => {
  fake.reset();
  mocks.loadDressingImage.mockReset();
  sources.slugs = ref<string[] | null>(["grimoire"]);
});

describe("which props the library offers", () => {
  beforeEach(() => {
    fake.seed("library_dressing", [row("rug", null, "grimoire"), row("anvil", null, "grimoire"), row("kobold-cask", null, "kobold-press")]);
  });

  it("offers only the enabled books' props, by name, for the picker", async () => {
    const offered = inApp(() => useLibraryDressing());
    await flushPromises();
    expect(offered.data.value?.map((d) => d.id)).toEqual(["anvil", "rug"]);
  });

  it("waits, still loading and reading nothing, while the enabled books are unknown", async () => {
    sources.slugs = ref<string[] | null>(null);
    const offered = inApp(() => useLibraryDressing());
    await flushPromises();
    expect(fake.calls).toEqual([]);
    expect(offered.isLoading.value).toBe(true);
  });

  it("resolves a placed prop from any book, enabled or not", async () => {
    const all = inApp(() => useAllLibraryDressing());
    await flushPromises();
    expect(all.data.value?.map((d) => d.id).sort()).toEqual(["anvil", "kobold-cask", "rug"]);
  });

  it("throws a failed read rather than offering an empty catalogue", async () => {
    fake.failNext("library_dressing", { message: "denied" });
    const offered = inApp(() => useLibraryDressing());
    await flushPromises();
    expect(offered.error.value?.message).toBe("denied");
  });
});

describe("useDressingCatalog", () => {
  it("lists every prop at once with no image, then swaps in a new Map as art arrives", async () => {
    const img = {} as HTMLImageElement;
    let resolve!: (v: HTMLImageElement | null) => void;
    mocks.loadDressingImage.mockReturnValue(new Promise((r) => (resolve = r)));
    fake.seed("library_dressing", [row("a", "https://cdn/a.webp"), row("b", null)]);

    const { catalog } = inApp(() => useDressingCatalog(() => ["a", "b"]));
    await flushPromises();
    const first = catalog.value;
    expect([...first.keys()]).toEqual(["a", "b"]);
    expect(first.get("a")?.image).toBeNull();
    expect(mocks.loadDressingImage).toHaveBeenCalledTimes(1);

    resolve(img);
    await flushPromises();
    expect(catalog.value).not.toBe(first);
    expect(catalog.value.get("a")?.image).toBe(img);
    expect(catalog.value.get("b")?.image).toBeNull();
  });

  it("keeps a prop with art that fails to load as a placeholder", async () => {
    mocks.loadDressingImage.mockResolvedValue(null);
    fake.seed("library_dressing", [row("a", "https://cdn/a.webp")]);
    const { catalog } = inApp(() => useDressingCatalog(() => ["a"]));
    await flushPromises();
    expect(catalog.value.get("a")?.image).toBeNull();
  });

  it("loads art only for the props it is asked for, and more as they are placed", async () => {
    mocks.loadDressingImage.mockResolvedValue({} as HTMLImageElement);
    fake.seed("library_dressing", [row("a", "https://cdn/a.webp"), row("b", "https://cdn/b.webp"), row("c", "https://cdn/c.webp")]);
    const placed = ref<string[]>([]);
    const { catalog } = inApp(() => useDressingCatalog(() => placed.value));
    await flushPromises();
    expect([...catalog.value.keys()]).toEqual(["a", "b", "c"]);
    expect(mocks.loadDressingImage).not.toHaveBeenCalled();

    placed.value = ["b"];
    await nextTick();
    expect(mocks.loadDressingImage).toHaveBeenCalledTimes(1);
    expect(mocks.loadDressingImage).toHaveBeenCalledWith("https://cdn/b.webp");

    // b's art is in; placing c fetches c alone.
    await flushPromises();
    placed.value = ["b", "c"];
    await nextTick();
    expect(mocks.loadDressingImage.mock.calls.map(([url]) => url)).toEqual(["https://cdn/b.webp", "https://cdn/c.webp"]);
  });

  it("load() resolves only once every wanted prop's art is in", async () => {
    const img = {} as HTMLImageElement;
    let resolve!: (v: HTMLImageElement | null) => void;
    mocks.loadDressingImage.mockReturnValue(new Promise((r) => (resolve = r)));
    fake.seed("library_dressing", [row("a", "https://cdn/a.webp")]);
    const { load } = inApp(() => useDressingCatalog(() => ["a"]));
    let loaded: Awaited<ReturnType<typeof load>> | null = null;
    void load().then((c) => (loaded = c));
    await flushPromises();
    expect(loaded).toBeNull();

    resolve(img);
    await flushPromises();
    expect(loaded!.get("a")?.image).toBe(img);
  });
});
