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
import { defineComponent } from "vue";
import PlayerNpcCard from "./PlayerNpcCard.vue";
import AiImageBadge from "@/components/common/ai/AiImageBadge.vue";
import type { PlayerNpc } from "@/types/npc.types";

const PassThrough = defineComponent({ template: "<div><slot /></div>" });

function npc(over: Record<string, unknown>): PlayerNpc {
  return {
    id: "n1",
    name: "Mira",
    portrait_url: "https://cdn.test/mira.webp",
    relationship: "neutral",
    status: "alive",
    player_visible_fields: ["portrait", "name"],
    ...over,
  } as unknown as PlayerNpc;
}

function mountCard(n: PlayerNpc) {
  return mount(PlayerNpcCard, {
    props: { npc: n },
    global: {
      plugins: [queryPlugin()],
      stubs: {
        MiniPortraitOverlay: PassThrough,
        NpcRatingStars: true,
        EntityNewDot: true,
      },
    },
  });
}

describe("PlayerNpcCard AI badge", () => {
  it("badges a registered portrait even when the row has no ai_provenance", async () => {
    registered.clear();
    registered.add("https://cdn.test/mira.webp");
    const w = mountCard(npc({ ai_provenance: null }));
    await flushPromises();
    expect(w.findComponent(AiImageBadge).exists()).toBe(true);
    expect(w.text()).toContain("AI");
  });

  it("shows no badge for an unregistered portrait even when the row has ai_provenance", async () => {
    registered.clear();
    const w = mountCard(npc({ ai_provenance: { model: "gpt-image", generatedAt: "2026-09-01" } }));
    await flushPromises();
    expect(w.text()).not.toContain("AI");
  });

  it("shows no badge when the portrait is withheld (mystery figure is a static asset)", async () => {
    registered.clear();
    registered.add("https://cdn.test/mira.webp");
    const w = mountCard(npc({ player_visible_fields: ["name"] }));
    await flushPromises();
    expect(w.text()).not.toContain("AI");
  });

  it("badges a concealed NPC by its disguise portrait's record, not the true portrait's", async () => {
    registered.clear();
    registered.add("https://cdn.test/true.webp");
    const concealed = { portrait_url: "https://cdn.test/true.webp", disguise_name: "Old Tom", disguise_portrait_url: "https://cdn.test/cover.webp", is_revealed: false };
    const w = mountCard(npc(concealed));
    await flushPromises();
    expect(w.text()).not.toContain("AI");

    registered.add("https://cdn.test/cover.webp");
    const w2 = mountCard(npc({ ...concealed, portrait_url: "https://cdn.test/other.webp" }));
    await flushPromises();
    expect(w2.text()).toContain("AI");
  });
});
