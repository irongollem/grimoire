import type { WorldTie } from "./ties";

/** A tie row for tests: Brenna worships the Drowned Lady, overridden per case. */
export function tie(over: Partial<WorldTie>): WorldTie {
  return {
    source: "link",
    row_id: "r1",
    type: "worships",
    from_kind: "npc",
    from_id: "brenna",
    from_name: "Brenna Ashe",
    from_image: null,
    to_kind: "deity",
    to_id: "lady",
    to_name: "The Drowned Lady",
    to_image: null,
    told: null,
    role: null,
    status: null,
    ...over,
  };
}
