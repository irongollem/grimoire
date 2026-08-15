import { describe, it, expect, afterEach } from "vitest";
import {
  TOUR_FLAG_KEY,
  parseTourFlag,
  tourTargetRouteName,
  firstAnchorSelector,
  isAnchorAvailable,
  filterAvailableSteps,
  buildTourSteps,
} from "./firstRunTours";

/** Stamps a non-zero getBoundingClientRect on an element, simulating a real
 *  layout — happy-dom (like jsdom) never computes actual box geometry, so an
 *  element that should read as "visible" needs this to look that way here. */
function makeVisible(el: Element): void {
  el.getBoundingClientRect = () =>
    ({ width: 100, height: 40, top: 0, left: 0, right: 100, bottom: 40, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("parseTourFlag", () => {
  it("accepts the two known tour kinds", () => {
    expect(parseTourFlag("dm")).toBe("dm");
    expect(parseTourFlag("player")).toBe("player");
  });

  it("rejects anything else, including near-misses", () => {
    expect(parseTourFlag(null)).toBeNull();
    expect(parseTourFlag("")).toBeNull();
    expect(parseTourFlag("DM")).toBeNull();
    expect(parseTourFlag("dungeon-master")).toBeNull();
  });
});

describe("tourTargetRouteName", () => {
  it("maps each tour kind to the route it waits for", () => {
    expect(tourTargetRouteName("dm")).toBe("dashboard");
    expect(tourTargetRouteName("player")).toBe("play-home");
  });
});

describe("firstAnchorSelector", () => {
  it("returns the first step's selector for each tour", () => {
    expect(firstAnchorSelector("dm")).toBe('[data-tour="dm-party"]');
    expect(firstAnchorSelector("player")).toBe('[data-tour="character-pool"]');
  });
});

describe("isAnchorAvailable", () => {
  it("is false when the selector matches nothing", () => {
    expect(isAnchorAvailable('[data-tour="ghost"]')).toBe(false);
  });

  it("is false when the element exists but renders with zero size", () => {
    const el = document.createElement("div");
    el.setAttribute("data-tour", "hidden-thing");
    document.body.appendChild(el);
    expect(isAnchorAvailable('[data-tour="hidden-thing"]')).toBe(false);
  });

  it("is true once the element exists and has real size", () => {
    const el = document.createElement("div");
    el.setAttribute("data-tour", "real-thing");
    document.body.appendChild(el);
    makeVisible(el);
    expect(isAnchorAvailable('[data-tour="real-thing"]')).toBe(true);
  });

  it("can be scoped to a root other than document", () => {
    const scope = document.createElement("div");
    const el = document.createElement("span");
    el.setAttribute("data-tour", "scoped-thing");
    scope.appendChild(el);
    makeVisible(el);
    // Not attached to document.body — only reachable via the scoped root.
    expect(isAnchorAvailable('[data-tour="scoped-thing"]')).toBe(false);
    expect(isAnchorAvailable('[data-tour="scoped-thing"]', scope)).toBe(true);
  });
});

describe("filterAvailableSteps", () => {
  const defs = [
    { selector: '[data-tour="a"]', title: "A", description: "First." },
    { selector: '[data-tour="b"]', title: "B", description: "Second." },
    { selector: '[data-tour="c"]', title: "C", description: "Third." },
  ] as const;

  it("drops steps whose anchor never mounted", () => {
    const a = document.createElement("div");
    a.setAttribute("data-tour", "a");
    document.body.appendChild(a);
    makeVisible(a);
    // "b" and "c" are never appended.

    const steps = filterAvailableSteps(defs);
    expect(steps).toHaveLength(1);
    expect(steps[0]).toEqual({ element: '[data-tour="a"]', popover: { title: "A", description: "First." } });
  });

  it("drops steps whose anchor mounted but is not visible", () => {
    const a = document.createElement("div");
    a.setAttribute("data-tour", "a");
    document.body.appendChild(a);
    makeVisible(a);

    const b = document.createElement("div");
    b.setAttribute("data-tour", "b");
    document.body.appendChild(b);
    // b left with zero-size rect — simulates display:none behind a breakpoint.

    const steps = filterAvailableSteps(defs);
    expect(steps.map((s) => s.element)).toEqual(['[data-tour="a"]']);
  });

  it("preserves definition order for the steps that survive", () => {
    for (const tag of ["c", "a"]) {
      const el = document.createElement("div");
      el.setAttribute("data-tour", tag);
      document.body.appendChild(el);
      makeVisible(el);
    }

    const steps = filterAvailableSteps(defs);
    expect(steps.map((s) => s.element)).toEqual(['[data-tour="a"]', '[data-tour="c"]']);
  });

  it("returns an empty array when nothing is available", () => {
    expect(filterAvailableSteps(defs)).toEqual([]);
  });
});

describe("buildTourSteps", () => {
  it("stays within the 4-6 step budget for both tours regardless of what's mounted", () => {
    // All anchors present and visible — the upper bound.
    for (const selector of [
      '[data-tour="dm-party"]', '[data-tour="dm-quests"]', '[data-tour="dm-session"]', '[data-tour="account-menu"]',
    ]) {
      const el = document.createElement("div");
      el.setAttribute("data-tour", selector.replace(/\[data-tour="(.+)"\]/, "$1"));
      document.body.appendChild(el);
      makeVisible(el);
    }
    const asideNav = document.createElement("nav");
    document.body.appendChild(document.createElement("aside")).appendChild(asideNav);
    makeVisible(asideNav);

    const dmSteps = buildTourSteps("dm");
    expect(dmSteps.length).toBeGreaterThanOrEqual(4);
    expect(dmSteps.length).toBeLessThanOrEqual(6);
  });

  it("degrades gracefully to zero steps when nothing on the page matches", () => {
    expect(buildTourSteps("dm")).toEqual([]);
    expect(buildTourSteps("player")).toEqual([]);
  });

  it("scopes to a provided root", () => {
    const scope = document.createElement("div");
    const el = document.createElement("div");
    el.setAttribute("data-tour", "character-pool");
    scope.appendChild(el);
    makeVisible(el);

    expect(buildTourSteps("player")).toEqual([]);
    expect(buildTourSteps("player", scope)).toEqual([
      { element: '[data-tour="character-pool"]', popover: { title: "Your Roster", description: "Every character you've created waits here, ready for a new adventure." } },
    ]);
  });
});

describe("TOUR_FLAG_KEY", () => {
  it("is the key WelcomeView is expected to write", () => {
    expect(TOUR_FLAG_KEY).toBe("grimoire:tour-pending");
  });
});
