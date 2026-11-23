import { describe, expect, it } from "vitest";
import { askContextFor } from "./askContext";

describe("askContextFor", () => {
  // Bug caught: a record's page sending no record, so "make her older" has nothing to point at.
  it.each([
    ["/npcs/n1", "npc"],
    ["/monsters/m1", "monster"],
    ["/vault/i1", "item"],
    ["/spells/s1", "spell"],
    ["/factions/f1", "faction"],
    ["/quests/q1", "quest"],
    ["/party/p1", "party_member"],
  ])("names the record on %s", (path, type) => {
    expect(askContextFor({ path }).record).toEqual({ type, id: path.split("/")[2] });
  });

  // Bug caught: "new" or "fallen" read as record ids and sent to the server as a campaign record.
  it("sends no record for a list's own sub-pages", () => {
    expect(askContextFor({ path: "/npcs/new" })).toEqual({ route: "/npcs/new" });
    expect(askContextFor({ path: "/party/fallen" })).toEqual({ route: "/party/fallen" });
    expect(askContextFor({ path: "/npcs" })).toEqual({ route: "/npcs" });
  });

  // Bug caught: the Atlas (which selects in ?at=) never naming the place the DM is looking at.
  it("reads the Atlas's selected place from the address", () => {
    expect(askContextFor({ path: "/locations", query: { at: "l1" } }).record).toEqual({ type: "location", id: "l1" });
    expect(askContextFor({ path: "/locations", query: {} }).record).toBeUndefined();
  });

  // Bug caught: a quest's beat page being sent as the quest's id with the beat's id lost, or a deep path not cut.
  it("takes only the first segment under a record's prefix", () => {
    expect(askContextFor({ path: "/quests/q1/beats/b1" }).record).toEqual({ type: "quest", id: "q1" });
  });
});

describe("askContextFor: title", () => {
  // Bug caught: a drafted bug report naming only the address, because the page's title never reached the server.
  it("carries the page title, and leaves it out when blank or not a string", () => {
    expect(askContextFor({ path: "/quests" }, "Quests")).toEqual({ route: "/quests", title: "Quests" });
    expect(askContextFor({ path: "/quests" }, "  ")).toEqual({ route: "/quests" });
    expect(askContextFor({ path: "/quests" }, 7)).toEqual({ route: "/quests" });
    expect(askContextFor({ path: "/quests" })).toEqual({ route: "/quests" });
  });
});
