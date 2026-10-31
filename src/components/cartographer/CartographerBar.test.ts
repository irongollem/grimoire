// The bar and its Map menu (#1125, canvas frame 07). The menu is teleported to the body,
// so it is read from there.
import { afterEach, describe, expect, it } from "vitest";
import { enableAutoUnmount, flushPromises, mount } from "@vue/test-utils";
import CartographerBar from "./CartographerBar.vue";
import type { MapMenuAction } from "@/cartographer/tools";

enableAutoUnmount(afterEach);

function bar(over: Record<string, unknown> = {}) {
  return mount(CartographerBar, {
    props: {
      packs: [{ pack_id: "flagstone", pack_version: 1, name: "Flagstone" }, { pack_id: "icy", pack_version: 2, name: "Icy Cave" }],
      currentPackId: "flagstone", loadedPackIds: new Set(["flagstone", "icy"]), packRuntime: null, packName: "Flagstone",
      validationMissing: 0, darkness: "daylight", campaignId: null, spaceCount: 3, spacesOpen: false,
      canUndo: true, canRedo: true, referenceAvailable: false, showReference: false,
      menuActions: [] as MapMenuAction[], showReady: false,
      ...over,
    },
    global: { stubs: { CampaignScopeField: true, CartographerPackSwatch: true } },
  });
}

async function openMenu(w: ReturnType<typeof bar>) {
  await w.findAll("button").find((b) => b.text() === "Map")?.trigger("click");
  await flushPromises();
}
const menuButtons = () => [...document.body.querySelectorAll<HTMLElement>("[role=dialog] button")];
const menuButton = (text: string) => menuButtons().find((b) => b.textContent?.includes(text));

describe("the bar", () => {
  it("shows Ready only when the host has a finish to offer, and reports the click", async () => {
    const without = bar();
    expect(without.findAll("button").some((b) => b.text() === "Ready")).toBe(false);
    const w = bar({ showReady: true });
    await w.findAll("button").find((b) => b.text() === "Ready")?.trigger("click");
    expect(w.emitted("ready")).toHaveLength(1);
  });

  it("ticks only a saved state, never one that is still saving", () => {
    expect(bar({ saveState: "Saved" }).find("header svg").exists()).toBe(true);
    const saving = bar({ saveState: "Saving…" });
    expect(saving.text()).toContain("Saving…");
    expect(saving.html()).not.toContain("lucide-check");
  });

  it("undoes and redoes from its icon buttons, and disables them when there is nothing to do", async () => {
    const w = bar();
    await w.find('[aria-label="Undo"]').trigger("click");
    await w.find('[aria-label="Redo"]').trigger("click");
    expect(w.emitted("undo")).toHaveLength(1);
    expect(w.emitted("redo")).toHaveLength(1);
    const idle = bar({ canUndo: false, canRedo: false });
    expect(idle.find('[aria-label="Undo"]').attributes("disabled")).toBeDefined();
  });
});

describe("the Map menu", () => {
  it("keeps the Spaces list reachable and reports the toggle", async () => {
    const w = bar();
    await openMenu(w);
    menuButton("Spaces on this map")?.click();
    expect(w.emitted("toggleSpaces")).toHaveLength(1);
  });

  it("offers only the host actions it was given, with a rule only between groups that exist", async () => {
    const w = bar({ menuActions: ["download", "delete"] });
    await openMenu(w);
    expect(menuButton("Download a picture")).toBeDefined();
    expect(menuButton("Delete map")).toBeDefined();
    expect(menuButton("Style it with AI")).toBeUndefined();
    expect(menuButton("Export for another VTT")).toBeUndefined();
    // Base group, then Download's group, then Delete's: two rules, not three.
    expect(document.body.querySelectorAll("[role=dialog] hr")).toHaveLength(2);
  });

  it("reports which action was picked and closes", async () => {
    const w = bar({ menuActions: ["export-vtt"] });
    await openMenu(w);
    menuButton("Export for another VTT")?.click();
    await flushPromises();
    expect(w.emitted("menuAction")?.[0]).toEqual(["export-vtt"]);
    expect(document.body.querySelector("[role=dialog]")).toBeNull();
  });

  it("chips the review row with its count only when there is something to review", async () => {
    const w = bar({ menuActions: ["review"], reviewCount: 4 });
    await openMenu(w);
    expect(menuButton("Review changes to the site")?.textContent).toContain("4");
    const none = bar({ menuActions: ["review"], reviewCount: 0 });
    await openMenu(none);
    const row = menuButtons().filter((b) => b.textContent?.includes("Review changes to the site")).pop();
    expect(row?.textContent?.replace("Review changes to the site", "").trim()).toBe("");
  });

  it("offers the picture-underneath toggle only when the site has a Picture", async () => {
    const without = bar();
    await openMenu(without);
    expect(document.body.textContent).not.toContain("Show picture underneath");
    const withPic = bar({ referenceAvailable: true });
    await openMenu(withPic);
    expect(document.body.textContent).toContain("Show picture underneath");
  });

  it("changes the tile set from its own page and goes back to the menu", async () => {
    const w = bar();
    await openMenu(w);
    menuButton("Tile set")?.click();
    await flushPromises();
    menuButton("Icy Cave")?.click();
    await flushPromises();
    expect(w.emitted("update:currentPackId")?.[0]).toEqual(["icy"]);
    expect(menuButton("Spaces on this map")).toBeDefined();
  });

  it("changes the light level from the menu", async () => {
    const w = bar();
    await openMenu(w);
    menuButtons().find((b) => b.textContent === "Dim")?.click();
    expect(w.emitted("update:darkness")?.[0]).toEqual(["dim"]);
  });
});
