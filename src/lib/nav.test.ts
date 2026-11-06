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
    expect(sessionTabs(mode, offersAll).map((item) => item.to)).toEqual([...SESSION_TAB_ROUTES[mode]]);
  });
});

describe("navItemHiddenByFlag", () => {
  const flagged = NAV_ITEMS.find((item) => item.featureFlag === "simulacrum");
  const plain = NAV_ITEMS.find((item) => item.featureFlag === undefined);

  it("hides a flagged page only while its flag says hidden", () => {
    expect(flagged).toBeDefined();
    expect(navItemHiddenByFlag(flagged!, true, offersAll)).toBe(true);
    expect(navItemHiddenByFlag(flagged!, false, offersAll)).toBe(false);
  });

  it("never hides a page that carries no flag", () => {
    expect(plain).toBeDefined();
    expect(navItemHiddenByFlag(plain!, true, offersAll)).toBe(false);
  });
});

describe("game-system gating", () => {
  const FIVE_E: Record<string, GameFeature> = {
    "/encounters": "encounters",
    "/party": "party",
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
    expect(navItemHiddenByFlag(item, false, offersNone)).toBe(true);
    expect(navItemHiddenByFlag(item, false, offersAll)).toBe(false);
  });

  // Bug caught: gating by blanket would hide the neutral tools from Generic.
  it("never hides a neutral page, whatever the system offers", () => {
    for (const to of ["/quests", "/npcs", "/locations", "/notes", "/soundboard"]) {
      const item = NAV_ITEMS.find((i) => i.to === to)!;
      expect(navItemHiddenByFlag(item, false, offersNone)).toBe(false);
    }
  });

  // Bug caught: the session bar resolving tabs without the system, so it shows
  // Encounters/Items/Party while the sidebar hides them.
  it.each(Object.keys(SESSION_TAB_ROUTES) as DmMode[])("drops the %s session tabs a system lacks", (mode) => {
    const tos = sessionTabs(mode, offersNone).map((i) => i.to);
    for (const to of Object.keys(FIVE_E)) expect(tos).not.toContain(to);
    expect(tos).toContain("/npcs");
  });
});
