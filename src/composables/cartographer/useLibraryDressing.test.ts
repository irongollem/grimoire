import { effectScope, nextTick, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LibraryDressing } from "@/types/dressing.types";

const mocks = vi.hoisted(() => ({
  rows: null as unknown,
  loadDressingImage: vi.fn(),
}));

vi.mock("@tanstack/vue-query", () => ({
  useQuery: () => ({ data: mocks.rows }),
  useQueryClient: () => ({ ensureQueryData: async () => (mocks.rows as { value: unknown }).value }),
}));
vi.mock("@/lib/supabase", () => ({ supabase: {} }));
vi.mock("@/composables/library/useEnabledSources", () => ({ useLibrarySourceSlugs: () => ({ slugs: ref(null) }) }));
vi.mock("@/cartographer/dressingImages", async () => {
  const actual = await vi.importActual<typeof import("@/cartographer/dressingImages")>("@/cartographer/dressingImages");
  return { ...actual, loadDressingImage: mocks.loadDressingImage };
});

import { useDressingCatalog } from "./useLibraryDressing";

function row(id: string, image_url: string | null): LibraryDressing {
  return { id, name: id, group_key: "furniture", tags: [], footprint_w: 2, footprint_h: 1, image_url, source: "grimoire" };
}

describe("useDressingCatalog", () => {
  beforeEach(() => {
    mocks.loadDressingImage.mockReset();
  });

  it("lists every prop at once with no image, then swaps in a new Map as art arrives", async () => {
    const img = {} as HTMLImageElement;
    let resolve!: (v: HTMLImageElement | null) => void;
    mocks.loadDressingImage.mockReturnValue(new Promise((r) => (resolve = r)));
    mocks.rows = ref([row("a", "https://cdn/a.webp"), row("b", null)]);

    const scope = effectScope();
    const { catalog } = scope.run(() => useDressingCatalog(() => ["a", "b"]))!;
    const first = catalog.value;
    expect([...first.keys()]).toEqual(["a", "b"]);
    expect(first.get("a")?.image).toBeNull();
    expect(mocks.loadDressingImage).toHaveBeenCalledTimes(1);

    resolve(img);
    await nextTick();
    await Promise.resolve();
    expect(catalog.value).not.toBe(first);
    expect(catalog.value.get("a")?.image).toBe(img);
    expect(catalog.value.get("b")?.image).toBeNull();
    scope.stop();
  });

  it("keeps a prop with art that fails to load as a placeholder", async () => {
    mocks.loadDressingImage.mockResolvedValue(null);
    mocks.rows = ref([row("a", "https://cdn/a.webp")]);
    const scope = effectScope();
    const { catalog } = scope.run(() => useDressingCatalog(() => ["a"]))!;
    await Promise.resolve();
    await Promise.resolve();
    expect(catalog.value.get("a")?.image).toBeNull();
    scope.stop();
  });

  it("loads art only for the props it is asked for, and more as they are placed", async () => {
    mocks.loadDressingImage.mockResolvedValue({} as HTMLImageElement);
    mocks.rows = ref([row("a", "https://cdn/a.webp"), row("b", "https://cdn/b.webp"), row("c", "https://cdn/c.webp")]);
    const placed = ref<string[]>([]);
    const scope = effectScope();
    const { catalog } = scope.run(() => useDressingCatalog(() => placed.value))!;
    expect([...catalog.value.keys()]).toEqual(["a", "b", "c"]);
    expect(mocks.loadDressingImage).not.toHaveBeenCalled();

    placed.value = ["b"];
    await nextTick();
    expect(mocks.loadDressingImage).toHaveBeenCalledTimes(1);
    expect(mocks.loadDressingImage).toHaveBeenCalledWith("https://cdn/b.webp");
    scope.stop();
  });

  it("load() resolves only once every wanted prop's art is in", async () => {
    const img = {} as HTMLImageElement;
    let resolve!: (v: HTMLImageElement | null) => void;
    mocks.loadDressingImage.mockReturnValue(new Promise((r) => (resolve = r)));
    mocks.rows = ref([row("a", "https://cdn/a.webp")]);
    const scope = effectScope();
    const { load } = scope.run(() => useDressingCatalog(() => ["a"]))!;
    let loaded: Awaited<ReturnType<typeof load>> | null = null;
    void load().then((c) => (loaded = c));
    await Promise.resolve();
    await Promise.resolve();
    expect(loaded).toBeNull();

    resolve(img);
    await new Promise((r) => setTimeout(r, 0));
    expect(loaded!.get("a")?.image).toBe(img);
    scope.stop();
  });
});
