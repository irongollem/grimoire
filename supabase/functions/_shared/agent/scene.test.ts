import { describe, expect, it } from "vitest";
import {
  CHARACTERS_MAX,
  DESCRIPTION_MAX,
  PLACES_MAX,
  parseGoToInput,
  sceneResult,
  sceneSection,
  trimScene,
  type SceneView,
} from "./scene";

const ID = "00000000-0000-4000-8000-0000000000a5";

function view(over: Partial<SceneView> = {}): SceneView {
  return { id: ID, name: "Honey Cellar", kind: "cellar", description: "Damp stone.", within: "Cup Town", withinId: null, beside: [], places: [], characters: [], ...over };
}
const people = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, name: `Person${i}`, occupation: null }));

describe("trimScene", () => {
  it("cuts 21 characters to 20 and says one more exists", () => {
    const trimmed = trimScene(view({ characters: people(CHARACTERS_MAX + 1) }));
    expect(trimmed.characters).toHaveLength(CHARACTERS_MAX);
    expect(sceneSection(trimmed)).toContain("and 1 more");
    expect(sceneSection(trimmed)).not.toContain(`Person${CHARACTERS_MAX},`);
  });

  it("cuts places past the limit and counts them", () => {
    const places = Array.from({ length: PLACES_MAX + 3 }, (_, i) => ({ id: `p${i}`, name: `Room${i}` }));
    const trimmed = trimScene(view({ places }));
    expect(trimmed.places).toHaveLength(PLACES_MAX);
    expect(sceneSection(trimmed)).toContain("and 3 more");
  });

  it("cuts a long description with an ellipsis and leaves a short one alone", () => {
    const long = trimScene(view({ description: "x".repeat(DESCRIPTION_MAX + 50) }));
    expect(long.description.length).toBeLessThanOrEqual(DESCRIPTION_MAX);
    expect(long.description.endsWith("…")).toBe(true);
    expect(trimScene(view()).description).toBe("Damp stone.");
  });
});

describe("sceneSection", () => {
  it("tells the narrator an empty room is empty", () => {
    expect(sceneSection(trimScene(view()))).toContain("Nobody with a record is here.");
  });

  it("shows a disguised character under the name it is given, never another", () => {
    const text = sceneSection(trimScene(view({ characters: [{ id: ID, name: "Mr Smith", occupation: "baker" }] })));
    expect(text).toContain("Mr Smith, baker");
    expect(text).not.toContain("TRUE-NAME");
  });

  // Bug caught live (17 Nov 2026): "I leave the room" answered "The Gathering-Room has no other exit listed here",
  // because a room with nothing inside it was shown no place to go to at all.
  it("names the way out of a room with nothing inside it, and the rooms beside it, each with its id", () => {
    const OUT = "22222222-2222-4222-8222-222222222222";
    const NEXT = "33333333-3333-4333-8333-333333333333";
    const text = sceneSection(trimScene(view({ within: "The Middle", withinId: OUT, beside: [{ id: NEXT, name: "The Roost" }] })));
    expect(text).toContain(`Inside: The Middle, id ${OUT}`);
    expect(text).toContain(`- The Roost, id ${NEXT}`);
    expect(text).toContain("The party can always leave");
  });

  // Bug caught: the top of the world told it has a way out to nowhere.
  it("offers no way out of a place that is inside nothing", () => {
    const text = sceneSection(trimScene(view({ within: null, withinId: null })));
    expect(text).not.toContain("can always leave");
    expect(text).not.toContain("Places beside");
  });

  it("says how many rooms beside this one were left off a long list", () => {
    const beside = Array.from({ length: 15 }, (_, i) => ({ id: ID, name: `Room ${i}` }));
    expect(sceneSection(trimScene(view({ withinId: ID, beside })))).toContain("and 3 more");
  });

  it("leaves out empty parts instead of printing blanks", () => {
    const text = sceneSection(trimScene(view({ within: null, kind: null, description: "" })));
    expect(text).not.toContain("Inside:");
    expect(text).not.toContain("()");
    expect(text).not.toContain("Places inside");
  });

  it("says there is no place and asks for go_to when the party has none", () => {
    expect(sceneSection(null)).toContain("go_to");
  });
});

describe("sceneResult", () => {
  it("holds the place, its people and its places as JSON", () => {
    const parsed = JSON.parse(sceneResult(trimScene(view({ characters: people(1) }))));
    expect(parsed.moved_to).toMatchObject({ id: ID, name: "Honey Cellar" });
    expect(parsed.characters_here).toHaveLength(1);
  });
});

describe("parseGoToInput", () => {
  it("refuses a missing, non-string and non-uuid id", () => {
    for (const bad of [{}, { location_id: 5 }, { location_id: "  " }, { location_id: "cellar" }]) {
      expect(parseGoToInput(bad)).toMatchObject({ ok: false });
    }
    expect(parseGoToInput({ location_id: ID })).toEqual({ ok: true, locationId: ID, companions: [] });
  });

  it("takes who comes along, once each, and refuses a companion named by name", () => {
    const friend = "00000000-0000-4000-8000-0000000000f1";
    expect(parseGoToInput({ location_id: ID, with: [friend, friend] })).toEqual({ ok: true, locationId: ID, companions: [friend] });
    expect(parseGoToInput({ location_id: ID, with: ["Honeycomb"] })).toMatchObject({ ok: false });
  });
});
