import { describe, expect, it } from "vitest";
import { pickSpellRecord } from "./spellChoice.ts";
import { fireball } from "./spellTestKit.ts";

const rec = (id: string, ruleset: "2014" | "2024", reviewed: boolean) => fireball({ id, ruleset, mechanics_reviewed: reviewed });

describe("pickSpellRecord", () => {
  // Library: Fireball exists in 2014 and 2024. A 2024 campaign casts the 2024 one.
  it("fails if a 2024 campaign is given the 2014 record of the same name", () => {
    const picked = pickSpellRecord("fireball", [rec("old", "2014", true), rec("new", "2024", true)], "2024");
    expect(picked?.record.id).toBe("new");
  });

  it("fails if another edition's record is not used when the campaign's edition has none", () => {
    expect(pickSpellRecord("fireball", [rec("old", "2014", true)], "2024")?.record.id).toBe("old");
  });

  // The wotc-srd Fireball row is unreviewed with empty mechanics; the srd-2014 row is reviewed. Same edition: reviewed wins.
  it("fails if an unreviewed row of the right edition beats a reviewed one of the same edition", () => {
    const picked = pickSpellRecord("Fireball", [rec("bare", "2014", false), rec("good", "2014", true)], "2014");
    expect(picked).toMatchObject({ automatable: true, record: { id: "good" } });
  });

  // Edition first (the app's rule), then reviewed: an unreviewed record of the campaign's edition still wins over a reviewed other edition.
  it("fails if the edition is not weighed before the review", () => {
    expect(pickSpellRecord("fireball", [rec("old", "2014", true), rec("new", "2024", false)], "2024")?.record.id).toBe("new");
  });

  it("fails if a record nobody reviewed is ever automatable", () => {
    expect(pickSpellRecord("fireball", [rec("bare", "2014", false)], "2014")).toMatchObject({ automatable: false });
    // A campaign's own spell has no reviewed flag at all.
    const own = { ...fireball(), mechanics_reviewed: undefined };
    expect(pickSpellRecord("fireball", [own], "2014")).toMatchObject({ automatable: false });
  });

  it("fails if the name is matched by letter case or spacing, or a different name matches, or none is reported as null", () => {
    expect(pickSpellRecord("  FIRE  ball", [fireball({ name: "Fire ball" })], "2014")).not.toBeNull();
    expect(pickSpellRecord("fireballs", [fireball()], "2014")).toBeNull();
    expect(pickSpellRecord("fireball", [], "2014")).toBeNull();
  });

  it("fails if a tie is not won by the record listed first (the campaign's own)", () => {
    expect(pickSpellRecord("fireball", [rec("mine", "2014", true), rec("lib", "2014", true)], "2014")?.record.id).toBe("mine");
  });

  // Bug caught: a DM's own Fireball losing to the library's record of the same name, or refused as "unchecked".
  it("takes a campaign's own spell first and at its word, over a reviewed library record", () => {
    const library = { ...fireball(), id: "lib", mechanics_reviewed: true };
    const own = { ...fireball(), id: "own", mechanics_reviewed: undefined, own: true as const };
    const chosen = pickSpellRecord("Fireball", [library, own], library.ruleset as never);
    expect(chosen?.record.id).toBe("own");
    expect(chosen?.automatable).toBe(true);
  });
});
