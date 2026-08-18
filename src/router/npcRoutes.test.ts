import { createMemoryHistory, createRouter } from "vue-router";
import { describe, expect, it } from "vitest";
import { routes } from "./routes";

/**
 * Nesting `/npcs/:id` under `/npcs` put a dynamic segment in the same position
 * as three static siblings. Vue Router scores static above dynamic so the
 * siblings still win, but that is a property of the router rather than of this
 * file — and if it ever stopped holding, `/npcs/web` would quietly render the
 * NPC sheet for an NPC whose id is the string "web".
 */
const router = createRouter({ history: createMemoryHistory(), routes });

describe("NPC routes", () => {
  it.each([
    ["/npcs", "npcs"],
    ["/npcs/new", "npc-new"],
    ["/npcs/web", "npc-web"],
    ["/npcs/sets", "npc-sets"],
  ])("resolves %s to %s rather than the detail route", (path, name) => {
    expect(router.resolve(path).name).toBe(name);
  });

  it("resolves an id to the detail route", () => {
    const resolved = router.resolve("/npcs/2f1c9a3e-0000-4000-8000-000000000000");

    expect(resolved.name).toBe("npc-detail");
    expect(resolved.params.id).toBe("2f1c9a3e-0000-4000-8000-000000000000");
  });

  it("matches the detail under the list, so the grid can stay mounted behind it", () => {
    const resolved = router.resolve("/npcs/abc");

    expect(resolved.matched.map((r) => r.name)).toEqual(["npcs", "npc-detail"]);
  });

  it("keeps the phone takeover flag reachable through the nesting", () => {
    expect(router.resolve("/npcs/abc").meta.fullscreenMobile).toBe(true);
    expect(router.resolve("/npcs").meta.fullscreenMobile).toBeUndefined();
  });
});
