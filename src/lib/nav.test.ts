import { describe, expect, it } from "vitest";
import { NAV_ITEMS, SESSION_TAB_ROUTES, navItemHiddenByFlag, sessionTabs, type DmMode } from "@/lib/nav";

describe("the nav", () => {
  it("links each page once", () => {
    const routes = NAV_ITEMS.map((item) => item.to);
    expect(new Set(routes).size).toBe(routes.length);
  });

  // sessionTabs() drops a route it cannot find, so a renamed page would shrink
  // the session bar silently instead of failing.
  it.each(Object.keys(SESSION_TAB_ROUTES) as DmMode[])("has a nav entry for every %s session tab", (mode) => {
    expect(sessionTabs(mode).map((item) => item.to)).toEqual([...SESSION_TAB_ROUTES[mode]]);
  });
});

describe("navItemHiddenByFlag", () => {
  const flagged = NAV_ITEMS.find((item) => item.featureFlag === "simulacrum");
  const plain = NAV_ITEMS.find((item) => item.featureFlag === undefined);

  it("hides a flagged page only while its flag says hidden", () => {
    expect(flagged).toBeDefined();
    expect(navItemHiddenByFlag(flagged!, true)).toBe(true);
    expect(navItemHiddenByFlag(flagged!, false)).toBe(false);
  });

  it("never hides a page that carries no flag", () => {
    expect(plain).toBeDefined();
    expect(navItemHiddenByFlag(plain!, true)).toBe(false);
  });
});
