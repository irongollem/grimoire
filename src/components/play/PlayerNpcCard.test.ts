import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { defineComponent } from "vue";
import PlayerNpcCard from "./PlayerNpcCard.vue";
import AiGeneratedBadge from "@/components/common/AiGeneratedBadge.vue";
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
      stubs: {
        MiniPortraitOverlay: PassThrough,
        FocalImage: true,
        NpcRatingStars: true,
        EntityNewDot: true,
      },
    },
  });
}

describe("PlayerNpcCard AI badge", () => {
  it("shows the badge over a visible portrait when the NPC has provenance", () => {
    const w = mountCard(npc({ ai_provenance: { model: "gpt-image", generatedAt: "2026-09-01" } }));
    expect(w.findComponent(AiGeneratedBadge).exists()).toBe(true);
    expect(w.text()).toContain("AI");
  });

  it("shows no badge without provenance", () => {
    const w = mountCard(npc({ ai_provenance: null }));
    expect(w.text()).not.toContain("AI");
  });

  it("shows no badge when the portrait is withheld (mystery figure is a static asset)", () => {
    const w = mountCard(
      npc({ player_visible_fields: ["name"], ai_provenance: { model: "gpt-image" } }),
    );
    expect(w.text()).not.toContain("AI");
  });
});
