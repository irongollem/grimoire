import { createMemoryHistory, createRouter } from "vue-router";
import { describe, expect, it } from "vitest";
import { routes } from "./routes";

/**
 * The list routes that nest their detail so it can present as a modal over the
 * grid (#743). Nesting puts a dynamic segment in the same position as the
 * static siblings each list already had — Vue Router scores static above
 * dynamic so the siblings still win, but that is a property of the router
 * rather than of this file. If it ever stopped holding, `/npcs/web` would
 * quietly render the sheet for an NPC whose id is the string "web".
 */
const NESTED_LISTS = [
  {
    label: "NPCs",
    list: { path: "/npcs", name: "npcs" },
    detail: { name: "npc-detail", sample: "/npcs/2f1c9a3e-0000-4000-8000-000000000000" },
    // Objects rather than tuples: `it.each` resolves a tuple row against its
    // spread overload, which a readonly tuple does not satisfy.
    siblings: [
      { path: "/npcs/new", name: "npc-new" },
      { path: "/npcs/web", name: "npc-web" },
      { path: "/npcs/sets", name: "npc-sets" },
    ],
  },
  {
    label: "monsters",
    list: { path: "/monsters", name: "monsters" },
    detail: { name: "monster-detail", sample: "/monsters/7c4f1b2d-0000-4000-8000-000000000000" },
    siblings: [{ path: "/monsters/new", name: "monster-new" }],
  },
];

const router = createRouter({ history: createMemoryHistory(), routes });

describe.each(NESTED_LISTS)("$label detail route", ({ list, detail, siblings }) => {
  it("resolves the list itself", () => {
    expect(router.resolve(list.path).name).toBe(list.name);
  });

  it.each(siblings)("resolves $path to $name rather than the detail route", ({ path, name }) => {
    expect(router.resolve(path).name).toBe(name);
  });

  it("resolves an id to the detail route", () => {
    const resolved = router.resolve(detail.sample);

    expect(resolved.name).toBe(detail.name);
    expect(resolved.params.id).toBe(detail.sample.split("/").pop());
  });

  it("matches the detail under the list, so the grid can stay mounted behind it", () => {
    expect(router.resolve(detail.sample).matched.map((r) => r.name)).toEqual([
      list.name,
      detail.name,
    ]);
  });

  it("keeps the phone takeover flag reachable through the nesting", () => {
    expect(router.resolve(detail.sample).meta.fullscreenMobile).toBe(true);
    expect(router.resolve(list.path).meta.fullscreenMobile).toBeUndefined();
  });
});
