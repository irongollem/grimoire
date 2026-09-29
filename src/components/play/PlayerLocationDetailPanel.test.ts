import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
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
      stubs: {
        FocalImage: true,
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
  it("badges the sigil image when the location has provenance", () => {
    expect(panel({ ai_provenance: { model: "gpt-image" } }).text()).toContain("AI");
  });

  it("shows no badge without provenance", () => {
    expect(panel({ ai_provenance: null }).text()).not.toContain("AI");
  });

  it("shows no badge when there is no image", () => {
    expect(panel({ image_url: null, ai_provenance: { model: "gpt-image" } }).text()).not.toContain("AI");
  });
});
