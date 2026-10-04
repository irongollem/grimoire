import { describe, expect, it } from "vitest";
import {
  describePending,
  describeRecipients,
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

describe("describeRecipients", () => {
  it("lists names naturally", () => {
    expect(describeRecipients(["Mira"], 4)).toBe("Mira");
    expect(describeRecipients(["Mira", "Tor"], 4)).toBe("Mira and Tor");
    expect(describeRecipients(["Mira", "Tor", "Ash"], 4)).toBe("Mira, Tor and Ash");
  });

  it("says the whole party when everyone is in", () => {
    expect(describeRecipients(["Mira", "Tor"], 2)).toBe("The whole party");
  });

  it("says no one for an empty list", () => {
    expect(describeRecipients([], 3)).toBe("No one");
  });
});

describe("describePending", () => {
  it("agrees in number", () => {
    expect(describePending(1)).toBe("1 linked entry is hidden from players.");
    expect(describePending(3)).toBe("3 linked entries are hidden from players.");
  });
});
