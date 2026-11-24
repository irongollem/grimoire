import { describe, expect, it } from "vitest";
import { sceneFrom } from "./sceneRows.ts";

const place = { id: "p", parent_id: "up", name: "Cellar", location_type: "room", description: JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Damp." }] }] }) };

describe("sceneFrom", () => {
  it("a disguised character is shown under the disguise until revealed", () => {
    const scene = sceneFrom(place, null, [], [], [
      { id: "n1", name: "Lord Vane", disguise_name: "Old Tom", is_revealed: false, occupation: "spy" },
      { id: "n2", name: "Lady Rue", disguise_name: "Mara", is_revealed: true, occupation: null },
    ], true);
    expect(scene.characters).toEqual([
      { id: "n1", name: "Old Tom", occupation: "spy" },
      { id: "n2", name: "Lady Rue", occupation: null },
    ]);
  });

  it("names what the place lies inside only when that place was found", () => {
    expect(sceneFrom(place, { name: "Keep" }, [], [], [], true).within).toBe("Keep");
    expect(sceneFrom(place, { name: "Keep" }, [], [], [], true).withinId).toBe("up");
    const orphan = sceneFrom(place, null, [], [], [], true);
    expect([orphan.within, orphan.withinId]).toEqual([null, null]);
  });

  it("sends the description as plain text, and rooms beside and inside as id and name", () => {
    const scene = sceneFrom(place, null, [{ id: "s", name: "Hall", extra: 1 }], [{ id: "c", name: "Vault" }], [], true);
    expect(scene.description).toBe("Damp.");
    expect(scene.beside).toEqual([{ id: "s", name: "Hall" }]);
    expect(scene.places).toEqual([{ id: "c", name: "Vault" }]);
  });

  // Bug caught: a map found above the place never reaching the narrator, so it drew a second map over the DM's.
  it("carries whether a map was found, as the loader decided it", () => {
    expect(sceneFrom(place, null, [], [], [], false).hasMap).toBe(false);
    expect(sceneFrom(place, null, [], [], [], true).hasMap).toBe(true);
  });
});
