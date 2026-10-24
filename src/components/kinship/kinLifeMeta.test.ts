import { describe, expect, it } from "vitest";
import { kinLifeMeta } from "@/components/kinship/kinLifeMeta";
import { lifeMeta } from "@/components/kinship/familyRows";
import { k, testClock } from "@/components/kinship/testGraph";

const who = (bornYear: number | null, dead = false, diedYear: number | null = null) => ({
  key: k("a"),
  name: "A",
  bornYear,
  diedYear,
  dead,
  isPc: false,
});

describe("kinLifeMeta", () => {
  it("gives the living a birth year and an age against the campaign date", () => {
    expect(kinLifeMeta(who(1459), testClock(1495))).toEqual(["born 1459", "36"]);
    expect(kinLifeMeta(who(1459), testClock(1500))).toEqual(["born 1459", "41"]);
  });
  it("gives the dead a birth year and no age, and nobody an age before birth", () => {
    expect(kinLifeMeta(who(1428, true), testClock())).toEqual(["born 1428"]);
    expect(kinLifeMeta(who(1500), testClock(1495))).toEqual(["born 1500"]);
  });
  it("gives the dead with both years one range, and with one year just that year", () => {
    expect(kinLifeMeta(who(1428, true, 1491), testClock())).toEqual(["1428 \u2013 1491"]);
    expect(kinLifeMeta(who(null, true, 1491), testClock())).toEqual(["died 1491"]);
    expect(kinLifeMeta(who(1428, true, null), testClock())).toEqual(["born 1428"]);
  });
  it("ignores a death year on someone not dead", () => {
    expect(kinLifeMeta(who(1459, false, 1491), testClock(1495))).toEqual(["born 1459", "36"]);
  });
  it("says nothing for an unknown birth year", () => {
    expect(kinLifeMeta(who(null), testClock())).toEqual([]);
  });
  it("is what the list shows too, plus the word 'dead'", () => {
    expect(lifeMeta(who(1459), testClock())).toEqual(kinLifeMeta(who(1459), testClock()));
    expect(lifeMeta(who(1428, true), testClock())).toEqual(["born 1428", "dead"]);
    expect(lifeMeta(who(1428, true, 1491), testClock())).toEqual(["1428 \u2013 1491"]);
  });
});
