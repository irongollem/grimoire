import { describe, expect, it } from "vitest";
import { countPreparedAgainstLimit } from "@/rules/preparedSpellCount";

describe("countPreparedAgainstLimit", () => {
  it("counts only prepared leveled spells that are not granted", () => {
    expect(
      countPreparedAgainstLimit([
        { is_prepared: true, spell: { level: 0 } },
        { is_prepared: true, spell: { level: 1 } },
        { is_prepared: true, always_prepared: true, spell: { level: 2 } },
        { is_prepared: false, spell: { level: 3 } },
        { is_prepared: true, always_prepared: false, spell: { level: 3 } },
      ]),
    ).toBe(2);
  });

  it("is zero for an empty list", () => {
    expect(countPreparedAgainstLimit([])).toBe(0);
  });
});
