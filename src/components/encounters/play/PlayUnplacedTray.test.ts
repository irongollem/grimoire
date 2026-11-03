// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import type { RunCombatant } from "@/types/encounter.types";
import PlayUnplacedTray from "./PlayUnplacedTray.vue";

function who(id: string, type: RunCombatant["type"] = "monster"): RunCombatant {
  return {
    instance_id: id, type, name: id, faction_id: "f", initiative: 1, hp: 5, max_hp: 5, ac: "10",
    conditions: [], curses: [], death_saves: { successes: 0, failures: 0 }, dex_mod: 0,
  };
}
const mounted: ReturnType<typeof mount>[] = [];
function mountTray(combatants: RunCombatant[], rooms: { id: string; name: string }[]) {
  const w = mount(PlayUnplacedTray, {
    props: { combatants, factions: [], armedId: null, rooms },
    global: { stubs: { PlayPortrait: true } },
    attachTo: document.body,
  });
  mounted.push(w);
  return w;
}
const scatterButton = (w: ReturnType<typeof mountTray>) => w.findAll("button").find((b) => b.text().startsWith("Scatter"));

describe("PlayUnplacedTray scatter", () => {
  afterEach(() => {
    while (mounted.length) mounted.pop()?.unmount();
    document.body.innerHTML = "";
  });

  it("with one room, one click scatters in it and the button names the room", async () => {
    const w = mountTray([who("orc")], [{ id: "r1", name: "Crypt" }]);
    expect(scatterButton(w)?.text()).toBe("Scatter in Crypt");
    await scatterButton(w)?.trigger("click");
    expect(w.emitted("scatter")).toEqual([["r1"]]);
  });

  it("with several rooms, the picker lists them and choosing one scatters in that room", async () => {
    const w = mountTray([who("orc")], [{ id: "r1", name: "Crypt" }, { id: "r2", name: "Hall" }]);
    await scatterButton(w)?.trigger("click");
    const item = [...document.body.querySelectorAll<HTMLButtonElement>("[role=menuitem]")].find((b) => b.textContent?.includes("Hall"));
    item?.click();
    expect(w.emitted("scatter")).toEqual([["r2"]]);
  });

  it("offers nothing when the map has no room", () => {
    expect(scatterButton(mountTray([who("orc")], []))).toBeUndefined();
  });

  it("offers nothing when only party members wait, who are seated by their own flow", () => {
    expect(scatterButton(mountTray([who("pc", "player")], [{ id: "r1", name: "Crypt" }]))).toBeUndefined();
  });
});
