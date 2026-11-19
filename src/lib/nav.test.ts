import { describe, expect, it } from "vitest";
import type { GameFeature } from "@/systems/registry";
import { NAV_ITEMS, SESSION_TAB_ROUTES, navItemHiddenByFlag, sessionTabs, type DmMode } from "@/lib/nav";

const offersAll = () => true;
/** A system that offers nothing beyond the neutral tools, like Generic. */
const offersNone = () => false;

describe("the nav", () => {
  it("links each page once", () => {
    const routes = NAV_ITEMS.map((item) => item.to);
    expect(new Set(routes).size).toBe(routes.length);
  });

  // sessionTabs() drops a route it cannot find, so a renamed page would shrink
  // the session bar silently instead of failing.
  it.each(Object.keys(SESSION_TAB_ROUTES) as DmMode[])("has a nav entry for every %s session tab", (mode) => {
    expect(sessionTabs(mode, offersAll, true).map((item) => item.to)).toEqual([...SESSION_TAB_ROUTES[mode]]);
  });
});

describe("navItemHiddenByFlag", () => {
  const flagged = NAV_ITEMS.find((item) => item.featureFlag === "simulacrum");
  const plain = NAV_ITEMS.find((item) => item.featureFlag === undefined);

  it("hides a flagged page only while its flag says hidden", () => {
    expect(flagged).toBeDefined();
    expect(navItemHiddenByFlag(flagged!, true, offersAll, true)).toBe(true);
    expect(navItemHiddenByFlag(flagged!, false, offersAll, true)).toBe(false);
  });

  it("never hides a page that carries no flag", () => {
    expect(plain).toBeDefined();
    expect(navItemHiddenByFlag(plain!, true, offersAll, true)).toBe(false);
  });
});

describe("game-system gating", () => {
  const FIVE_E: Record<string, GameFeature> = {
    "/encounters": "encounters",
    "/party": "party",
    "/table": "party",
    "/rules": "reliquary",
    "/monsters": "bestiary",
    "/spells": "spellbook",
    "/vault": "item-vault",
    "/codex": "character-codex",
    "/character-sheet": "party",
  };

  // Bug caught: a 5e page added to the nav without a `feature` tag stays visible
  // in a Generic campaign, where the page it opens has nothing to show.
  it.each(Object.entries(FIVE_E))("tags %s with %s and hides it where the system lacks it", (to, feature) => {
    const item = NAV_ITEMS.find((i) => i.to === to)!;
    expect(item.feature).toBe(feature);
    expect(navItemHiddenByFlag(item, false, offersNone, true)).toBe(true);
    expect(navItemHiddenByFlag(item, false, offersAll, true)).toBe(false);
  });

  // Bug caught: gating by blanket would hide the neutral tools from Generic.
  it("never hides a neutral page, whatever the system offers", () => {
    for (const to of ["/quests", "/npcs", "/locations", "/notes", "/soundboard"]) {
      const item = NAV_ITEMS.find((i) => i.to === to)!;
      expect(navItemHiddenByFlag(item, false, offersNone, true)).toBe(false);
    }
  });

  // Bug caught: the session bar resolving tabs without the system, so it shows
  // Encounters/Items/Party while the sidebar hides them.
  it.each(Object.keys(SESSION_TAB_ROUTES) as DmMode[])("drops the %s session tabs a system lacks", (mode) => {
    const tos = sessionTabs(mode, offersNone, true).map((i) => i.to);
    for (const to of Object.keys(FIVE_E)) expect(tos).not.toContain(to);
    expect(tos).toContain("/npcs");
  });
});

describe("the AI table's entry", () => {
  const table = NAV_ITEMS.find((item) => item.to === "/table")!;

  // Bug caught: a Table entry that shows where the table is closed (AI off, or an owner without the grant, #1021)
  // opens a screen that can only say so.
  it("shows only while the table is open in the campaign", () => {
    expect(navItemHiddenByFlag(table, false, offersAll, false)).toBe(true);
    expect(navItemHiddenByFlag(table, false, offersAll, true)).toBe(false);
  });

  // Bug caught: the gate on AI swallowing every other nav gate, so the table showed in a Generic campaign.
  it("is still a party surface: hidden where the system has no party", () => {
    expect(navItemHiddenByFlag(table, false, offersNone, true)).toBe(true);
  });

  // Bug caught: the AI gate leaking onto pages that have nothing to do with AI.
  it("leaves every other page showing with AI off", () => {
    for (const item of NAV_ITEMS.filter((i) => i.to !== "/table")) {
      expect(navItemHiddenByFlag(item, false, offersAll, false)).toBe(false);
    }
  });
});
