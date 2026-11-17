import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import SoloScene from "./SoloScene.vue";
import type { SceneNpc } from "@/composables/table/useTableScene";

const npc = (over: Partial<SceneNpc> = {}): SceneNpc => ({
  id: "n1",
  name: "Duchess Vael",
  portrait_url: "https://cdn.example/true.webp",
  portrait_focal_point: null,
  disguise_name: null,
  disguise_portrait_url: null,
  disguise_portrait_focal_point: null,
  is_revealed: false,
  unmasked_at: null,
  ...over,
});

describe("SoloScene", () => {
  // Bug caught: the scene column naming a disguised character by their true name, which the player has not learned.
  it("shows a disguised, unrevealed character under the disguise, never the true name", () => {
    const w = mount(SoloScene, { props: { placeName: "The Workshop", here: [npc({ disguise_name: "Mara the baker", disguise_portrait_url: "https://cdn.example/mask.webp" })] } });
    expect(w.text()).toContain("Mara the baker");
    expect(w.text()).not.toContain("Duchess Vael");
    expect(w.html()).not.toContain("true.webp");
  });

  it("shows the true name once the disguise has fallen", () => {
    const w = mount(SoloScene, { props: { placeName: "The Workshop", here: [npc({ disguise_name: "Mara the baker", is_revealed: true })] } });
    expect(w.text()).toContain("Duchess Vael");
  });

  // Bug caught: an empty column that looks broken instead of saying there is no one.
  it("says where you are and that no one is here, when no one is", () => {
    const w = mount(SoloScene, { props: { placeName: "The Locked Workshop", here: [] } });
    expect(w.text()).toContain("The Locked Workshop");
    expect(w.text()).toContain("No one else is here.");
  });
});
