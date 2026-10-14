import { effectScope, nextTick, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LibraryDressing } from "@/types/dressing.types";

const mocks = vi.hoisted(() => ({
  rows: null as unknown,
  loadDressingImage: vi.fn(),
}));

vi.mock("@tanstack/vue-query", () => ({ useQuery: () => ({ data: mocks.rows }) }));
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
    const { catalog } = scope.run(() => useDressingCatalog())!;
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
    const { catalog } = scope.run(() => useDressingCatalog())!;
    await Promise.resolve();
    await Promise.resolve();
    expect(catalog.value.get("a")?.image).toBeNull();
    scope.stop();
  });
});
