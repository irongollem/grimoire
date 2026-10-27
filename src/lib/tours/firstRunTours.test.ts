// @vitest-environment happy-dom
import { readdirSync, readFileSync } from "node:fs";
import { describe, it, expect, afterEach } from "vitest";
import type { RouteRecordRaw } from "vue-router";
import { routes } from "@/router/routes";
import {
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

function routeNames(list: readonly RouteRecordRaw[]): string[] {
  return list.flatMap((r) => [...(typeof r.name === "string" ? [r.name] : []), ...routeNames(r.children ?? [])]);
}

describe("tourTargetRouteName", () => {
  // The tour waits for this route; a name the router does not have means it never starts.
  it.each(["dm", "player"] as const)("waits for a route that exists, for the %s tour", (kind) => {
    expect(routeNames(routes)).toContain(tourTargetRouteName(kind));
  });
});

/** Every `data-tour="x"` or `tour="x"` the app's templates put on an element. */
function anchorsInTemplates(): Set<string> {
  const found = new Set<string>();
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith(".vue")) {
        for (const m of readFileSync(path, "utf8").matchAll(/\b(?:data-)?tour="([a-z-]+)"/g)) found.add(m[1]);
      }
    }
  };
  walk(`${process.cwd()}/src`);
  return found;
}

describe("the tours' anchors", () => {
  // A step whose anchor was renamed away is silently dropped by the visibility filter,
  // so nothing else fails. Ask each tour for every step with a root that finds everything.
  const askedFor = (kind: "dm" | "player") => {
    const everything = document.createElement("div");
    const anchor = document.createElement("div");
    makeVisible(anchor);
    const selectors: string[] = [];
    everything.querySelector = ((selector: string) => {
      selectors.push(selector);
      return anchor;
    }) as typeof everything.querySelector;
    return { steps: buildTourSteps(kind, everything), selectors };
  };

  it.each(["dm", "player"] as const)("keeps the %s tour within the 4 to 6 step budget", (kind) => {
    const { steps } = askedFor(kind);
    expect(steps.length).toBeGreaterThanOrEqual(4);
    expect(steps.length).toBeLessThanOrEqual(6);
  });

  it.each(["dm", "player"] as const)("opens the %s tour on the anchor it waits for", (kind) => {
    expect(firstAnchorSelector(kind)).toBe(askedFor(kind).selectors[0]);
  });

  it.each(["dm", "player"] as const)("points every %s step at an anchor some template still carries", (kind) => {
    const templates = anchorsInTemplates();
    for (const selector of askedFor(kind).selectors) {
      const name = /^\[data-tour="([a-z-]+)"\]$/.exec(selector)?.[1];
      if (name !== undefined) expect(templates.has(name), `${kind} tour anchor ${name}`).toBe(true);
    }
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

  it.each([
    ["width", { width: 10, height: 0 }],
    ["height", { width: 0, height: 10 }],
  ])("is true when only the %s is non-zero", (_axis, size) => {
    const el = document.createElement("div");
    el.setAttribute("data-tour", "thin");
    document.body.appendChild(el);
    el.getBoundingClientRect = () => ({ ...size, top: 0, left: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    expect(isAnchorAvailable('[data-tour="thin"]')).toBe(true);
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
    expect(buildTourSteps("player", scope).map((step) => step.element)).toEqual(['[data-tour="character-pool"]']);
  });
});
