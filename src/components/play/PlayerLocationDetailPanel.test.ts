import { mount, flushPromises } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";

// The registry answers by image URL; only URLs listed here have a record.
const registered = vi.hoisted(() => new Set<string>());

vi.mock("@/lib/storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/storage")>()),
  imageProvenanceKey: (url: string) => (url.startsWith("https://cdn.test/") ? { bucket: "b", stem: url } : null),
  loadImageProvenance: vi.fn(async (key: { stem: string }) =>
    registered.has(key.stem) ? { model: "gpt-image", generatedAt: "2026-09-01T10:00:00Z" } : null,
  ),
}));

function queryPlugin(): [typeof VueQueryPlugin, { queryClient: QueryClient }] {
  return [VueQueryPlugin, { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }];
}
import PlayerLocationDetailPanel from "./PlayerLocationDetailPanel.vue";
import type { Location } from "@/types/location.types";

function panel(over: Record<string, unknown>) {
  const loc = {
    id: "l1",
    name: "Sugarwell",
    location_type: "town",
    image_url: "https://cdn.test/sugarwell.webp",
    player_summary: "A quiet village.",
    is_map_shared: false,
    ...over,
  } as unknown as Location;
  return mount(PlayerLocationDetailPanel, {
    props: { loc, sharedChildIds: new Set<string>() },
    global: {
      plugins: [queryPlugin()],
      stubs: {
        PlayerSiteMap: true,
        LocationMap: true,
        PlayerStoreWares: true,
        PlayerNotesWidget: true,
        RichTextViewer: true,
      },
    },
  });
}

describe("PlayerLocationDetailPanel AI badge", () => {
  it("badges a registered image even when the row has no ai_provenance", async () => {
    registered.clear();
    registered.add("https://cdn.test/sugarwell.webp");
    const w = panel({ ai_provenance: null });
    await flushPromises();
    expect(w.text()).toContain("AI");
  });

  it("shows no badge for an unregistered image even when the row has ai_provenance", async () => {
    registered.clear();
    const w = panel({ ai_provenance: { model: "gpt-image" } });
    await flushPromises();
    expect(w.text()).not.toContain("AI");
  });

  it("shows no badge when there is no image", async () => {
    registered.clear();
    registered.add("https://cdn.test/sugarwell.webp");
    const w = panel({ image_url: null });
    await flushPromises();
    expect(w.text()).not.toContain("AI");
  });
});
