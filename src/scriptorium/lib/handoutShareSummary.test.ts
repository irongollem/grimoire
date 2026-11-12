import { describe, expect, it } from "vitest";
import {
  describeAudienceChange,
  describeHiddenFromHolders,
  describeHolders,
  describeRevealed,
  describeWithheld,
} from "./handoutShareSummary";

describe("describeRevealed", () => {
  it("names the NPC fields and the alias they are seen under", () => {
    expect(
      describeRevealed({ type: "npc", id: "1", name: "Ser Vallis", fields: ["name"], seen_as: "The Almoner" }),
    ).toEqual({ name: "Ser Vallis", detail: "name (seen as The Almoner)" });
  });

  it("humanizes field names and omits the alias when there is none", () => {
    expect(
      describeRevealed({ type: "npc", id: "1", name: "Ser Vallis", fields: ["name", "known_for"], seen_as: null }).detail,
    ).toBe("name, known for");
  });

  it("an NPC with no revealed fields is simply discovered", () => {
    expect(describeRevealed({ type: "npc", id: "1", name: "Ser Vallis", fields: [], seen_as: null }).detail).toBe("discovered");
  });

  it("says a quest starts, or is merely shown", () => {
    expect(describeRevealed({ type: "quest", id: "q", name: "The Bounty", starts: true }).detail).toBe("the quest starts");
    expect(describeRevealed({ type: "quest", id: "q", name: "The Bounty", starts: false }).detail).toBe("the quest is shown");
  });

  it("says a monster is discovered, with its stat block when shown", () => {
    expect(describeRevealed({ type: "monster", id: "m", name: "Tithe Wraith", stats: false }).detail).toBe("discovered");
    expect(describeRevealed({ type: "monster", id: "m", name: "Tithe Wraith", stats: true }).detail).toBe(
      "discovered, with its stat block",
    );
  });

  it("says a location is discovered, with its description when shown", () => {
    expect(describeRevealed({ type: "location", id: "l", name: "Gaol", description: true }).detail).toBe(
      "discovered, with its description",
    );
  });
});

describe("describeWithheld", () => {
  it("explains each reason in plain words", () => {
    expect(describeWithheld({ type: "npc", id: "1", name: "Ser Vallis", reason: "not_revealed" }).detail).toBe("set not to reveal");
    expect(describeWithheld({ type: "item", id: "2", name: "Ring", reason: "found_only" }).detail).toBe(
      "shown once the party has it",
    );
    expect(describeWithheld({ type: "npc", id: "3", reason: "outside_campaign" })).toEqual({
      name: "A linked npc",
      detail: "from another campaign",
    });
  });
});

describe("describeRevealed deity and faction", () => {
  it("says a deity or faction is shared, with the name the SQL returned", () => {
    expect(describeRevealed({ type: "deity", id: "d1", name: "Ilmater" })).toEqual({ name: "Ilmater", detail: "shared" });
    expect(describeRevealed({ type: "faction", id: "f1", name: "The Hand" })).toEqual({ name: "The Hand", detail: "shared" });
  });
});

describe("describeHolders", () => {
  it("lists names naturally", () => {
    expect(describeHolders(["Mira"], 4)).toBe("Mira");
    expect(describeHolders(["Mira", "Tor"], 4)).toBe("Mira and Tor");
    expect(describeHolders(["Mira", "Tor", "Ash"], 4)).toBe("Mira, Tor and Ash");
  });

  it("says the whole party when everyone is in", () => {
    expect(describeHolders(["Mira", "Tor"], 2)).toBe("the whole party");
  });

  it("a one-person party is named, not 'the whole party'", () => {
    expect(describeHolders(["Mira"], 1)).toBe("Mira");
  });

  it("with an unknown party size, two names are just listed", () => {
    expect(describeHolders(["Mira", "Tor"], 0)).toBe("Mira and Tor");
  });

  it("says no one for an empty list", () => {
    expect(describeHolders([], 3)).toBe("no one");
  });
});

describe("describeAudienceChange", () => {
  it("says who is new and who already has it", () => {
    expect(describeAudienceChange({ added: ["Bramble"], kept: ["Pip", "Wren"], removed: [] })).toBe(
      "Bramble is new; Pip and Wren already have it.",
    );
  });

  it("agrees in number", () => {
    expect(describeAudienceChange({ added: ["Pip", "Wren"], kept: ["Bramble"], removed: [] })).toBe(
      "Pip and Wren are new; Bramble already has it.",
    );
  });

  it("names who loses it", () => {
    expect(describeAudienceChange({ added: [], kept: ["Pip"], removed: ["Tolly"] })).toBe(
      "Pip already has it; Tolly will no longer have it.",
    );
  });

  it("is empty when nothing is ticked", () => {
    expect(describeAudienceChange({ added: [], kept: [], removed: [] })).toBe("");
  });
});

describe("describeHiddenFromHolders", () => {
  it("names one or two entries and counts past that", () => {
    expect(describeHiddenFromHolders(["The Bell-Mother"])).toBe("The Bell-Mother is linked but hidden from them.");
    expect(describeHiddenFromHolders(["Ser Vallis", "The Bounty"])).toBe(
      "Ser Vallis and The Bounty are linked but hidden from them.",
    );
    expect(describeHiddenFromHolders(["A", "B", "C"])).toBe("3 linked entries are hidden from them.");
  });

  it("says nothing when nothing is hidden", () => {
    expect(describeHiddenFromHolders([])).toBe("");
  });
});
