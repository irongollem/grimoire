import { describe, expect, it } from "vitest";
import { belongingsText, MAX_BELONGINGS } from "./belongings.ts";

describe("belongingsText", () => {
  // Bug caught: an empty heading sent to a character who carries nothing, read as "you have things" with none named.
  it("says nothing for a character with nothing on record, or only spent things", () => {
    expect(belongingsText([])).toBeNull();
    expect(belongingsText([{ name: "Healing salve", quantity: 0 }])).toBeNull();
  });

  // Bug caught: the count dropped, so a character with three doses believes it has one; or "(1)" on every line.
  it("names each thing, with its count when more than one", () => {
    const text = belongingsText([
      { name: "Workshop Keys", quantity: 1 },
      { name: "Healing salve", quantity: 3 },
    ]);
    expect(text).toContain("- Workshop Keys\n");
    expect(text).toContain("- Healing salve (3)");
    expect(text).not.toContain("Workshop Keys (1)");
  });

  // Bug caught: a merchant's whole stock poured into every call.
  it("tells at most the limit and counts the rest", () => {
    const many = Array.from({ length: MAX_BELONGINGS + 4 }, (_, i) => ({ name: `Thing ${i + 1}`, quantity: 1 }));
    const text = belongingsText(many);
    expect(text).toContain(`- Thing ${MAX_BELONGINGS}`);
    expect(text).not.toContain(`- Thing ${MAX_BELONGINGS + 1}\n`);
    expect(text).toContain("and 4 more things");
  });
});
