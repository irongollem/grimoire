import { describe, expect, it } from "vitest";
import { soloFightOf, soloFightPath } from "./useSoloFight";

const SESSION = "02e4a234-bdbf-44c8-9b62-451db6ec84d9";
const MEMBER = "dff38375-c854-4dbd-8ab7-2ff131cea6b5";

describe("soloFightOf", () => {
  it("reads back what the table's own link carries", () => {
    const { query } = soloFightPath("e1", { sessionId: SESSION, memberId: MEMBER });
    expect(soloFightOf(query)).toEqual({ sessionId: SESSION, memberId: MEMBER });
  });

  // Bug caught: the DM's own fight screen setting itself up (and dropping the party) because of a stray or
  // half-written address.
  it.each([
    ["no sitting", { as: MEMBER }],
    ["no character", { table: SESSION }],
    ["a sitting that is not an id", { table: "new", as: MEMBER }],
    ["a character given twice", { table: SESSION, as: [MEMBER, MEMBER] }],
    ["nothing", {}],
  ])("is an ordinary fight with %s", (_what, query) => {
    expect(soloFightOf(query)).toBeNull();
  });
});
