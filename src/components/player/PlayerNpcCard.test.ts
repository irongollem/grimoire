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

describe("PlayerNpcCard what the player may see", () => {
  it("shows ??? and keeps the true name out of the card when the DM has not shared the name", async () => {
    const w = mountCard(npc({ name: "Mira Voss", player_visible_fields: ["portrait"] }));
    await flushPromises();
    expect(w.find("h3").text()).toBe("???");
    expect(w.html()).not.toContain("Mira Voss");
  });

  it("withholds race and occupation until they are in player_visible_fields, then shows them", async () => {
    const hidden = mountCard(npc({ race: "Tiefling", occupation: "Smuggler", player_visible_fields: ["name"] }));
    expect(hidden.text()).not.toContain("Tiefling");
    expect(hidden.text()).not.toContain("Smuggler");
    const shown = mountCard(npc({ race: "Tiefling", occupation: "Smuggler", player_visible_fields: ["name", "race", "occupation"] }));
    expect(shown.text()).toContain("Tiefling");
    expect(shown.text()).toContain("Smuggler");
  });

  it("swaps a withheld portrait for the mystery figure and never puts the real URL in the DOM", async () => {
    const w = mountCard(npc({ player_visible_fields: ["name"] }));
    await flushPromises();
    expect(w.find("img[alt='Identity hidden']").exists()).toBe(true);
    expect(w.html()).not.toContain("cdn.test/mira.webp");
  });

  it("shows a concealed NPC under its cover name, never the true one", async () => {
    const w = mountCard(
      npc({ name: "Lord Varrow", disguise_name: "Old Tom", disguise_portrait_url: "https://cdn.test/cover.webp", is_revealed: false }),
    );
    await flushPromises();
    expect(w.find("h3").text()).toBe("Old Tom");
    expect(w.html()).not.toContain("Lord Varrow");
  });

  it("emits click when the card is clicked", async () => {
    const w = mountCard(npc({}));
    await w.trigger("click");
    expect(w.emitted("click")).toHaveLength(1);
  });
});
