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

  // Bug caught: what went on record spread across the column (it was taking over the story before), or the newest
  // fact buried at the bottom of the list.
  it("keeps what is on record folded shut behind its count, and lists the newest first when opened", async () => {
    const recorded = [{ id: "f1", text: "Rosie took the keys." }, { id: "f2", text: "Rosie ran for the stairs." }];
    const w = mount(SoloScene, { props: { placeName: "The Workshop", here: [], recorded }, attachTo: document.body });
    const section = w.get('[data-testid="solo-record"]');
    expect(section.text()).toContain("On record · 2");
    expect(section.get("ul").isVisible()).toBe(false);
    await section.get("button").trigger("click");
    expect(section.get("ul").isVisible()).toBe(true);
    expect(section.findAll("li").map((li) => li.text())).toEqual(["Rosie ran for the stairs.", "Rosie took the keys."]);
    w.unmount();
  });

  // Bug caught: an empty "On record · 0" heading on a sitting that has recorded nothing.
  it("shows no record section when nothing is on record", () => {
    const w = mount(SoloScene, { props: { placeName: "The Workshop", here: [] } });
    expect(w.find('[data-testid="solo-record"]').exists()).toBe(false);
  });
});
