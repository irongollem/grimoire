import { describe, expect, it } from "vitest";
import { DM_MENTION, PARTY_MENTION, addresses, mightBeAnswered, emphasiseMentions, insertMention, matchingTargets, mentionQueryAt, mentionsIn, type MentionTarget } from "./chatMentions";

const rosie: MentionTarget = { kind: "member", partyMemberId: "pm-rosie", name: "Rosie" };
const rosieV: MentionTarget = { kind: "member", partyMemberId: "pm-rv", name: "Rosie Vermeil" };
const chicory: MentionTarget = { kind: "member", partyMemberId: "pm-chic", name: "Chicory" };
const dm = DM_MENTION;

// App convention throughout: a chat mention is ours to define (#1021 row 26).
describe("mentionQueryAt", () => {
  it("finds the mention being typed, names with a space included", () => {
    expect(mentionQueryAt("hold on @Ros", 12)).toEqual({ start: 8, query: "Ros" });
    expect(mentionQueryAt("@Dungeon Ma", 11)).toEqual({ start: 0, query: "Dungeon Ma" });
  });

  it("opens nothing for an @ inside a word, so an email address is left alone", () => {
    expect(mentionQueryAt("mail me at a@b", 14)).toBeNull();
  });

  it("opens nothing once the line has ended or the caret sits before the @", () => {
    expect(mentionQueryAt("@Ros\nnext", 9)).toBeNull();
    expect(mentionQueryAt("hi @Ros", 2)).toBeNull();
  });
});

describe("matchingTargets", () => {
  it("offers a name by any of its words, whole-name matches first", () => {
    expect(matchingTargets([dm, chicory, rosie], "ma").map((t) => t.name)).toEqual(["Dungeon Master"]);
    expect(matchingTargets([rosieV, rosie, chicory], "ros").map((t) => t.name)).toEqual(["Rosie", "Rosie Vermeil"]);
    expect(matchingTargets([rosieV, chicory], "ver").map((t) => t.name)).toEqual(["Rosie Vermeil"]);
  });

  it("offers everyone for a bare @", () => {
    expect(matchingTargets([chicory, rosie], "")).toHaveLength(2);
  });
});

describe("insertMention", () => {
  it("replaces what was typed with the name and puts the caret after one space", () => {
    expect(insertMention("hold @ro the door", 5, 8, "Rosie")).toEqual({ text: "hold @Rosie the door", caret: 12 });
  });
});

describe("mentionsIn", () => {
  it("reads the longest name, so a full name is not taken for the shorter one it starts with", () => {
    expect(mentionsIn("@Rosie Vermeil, with me", [rosie, rosieV])).toEqual([{ kind: "member", party_member_id: "pm-rv", name: "Rosie Vermeil" }]);
  });

  it("names each person once, whatever the case, and the Dungeon Master by a null id", () => {
    expect(mentionsIn("@rosie and @ROSIE, ask the @Dungeon Master", [rosie, dm])).toEqual([
      { kind: "member", party_member_id: "pm-rosie", name: "Rosie" },
      { kind: "dm", party_member_id: null, name: "Dungeon Master" },
    ]);
  });

  it("does not read a mention into a longer word or an email address", () => {
    expect(mentionsIn("@Rosiest of them, write to x@Rosie", [rosie])).toEqual([]);
  });
});

describe("emphasiseMentions", () => {
  it("sets only the mention in bold and leaves the rest of the line as typed", () => {
    expect(emphasiseMentions("so, @Rosie: go. Not you, Rosie.", [rosie])).toBe("so, **@Rosie**: go. Not you, Rosie.");
  });
});

describe("addresses", () => {
  it("counts a character as addressed by name or by @party, and not by a mention of someone else or of the DM", () => {
    const toParty = mentionsIn("@party, to me!", [rosie, PARTY_MENTION]);
    expect(addresses(toParty, "pm-chic")).toBe(true);
    expect(addresses(mentionsIn("@Rosie go", [rosie, chicory]), "pm-rosie")).toBe(true);
    expect(addresses(mentionsIn("@Rosie go", [rosie, chicory]), "pm-chic")).toBe(false);
    expect(addresses(mentionsIn("@Dungeon Master?", [dm]), "pm-chic")).toBe(false);
  });
});

describe("mightBeAnswered", () => {
  const toRosie = mentionsIn("@Rosie go", [rosie]);
  const played = [{ ai_stands_in: false }, { ai_stands_in: true }];

  it("asks only for a line that addresses a character, the party, or is a whisper", () => {
    expect(mightBeAnswered(null, toRosie, played)).toBe(true);
    expect(mightBeAnswered("user-7", [], played)).toBe(true);
    expect(mightBeAnswered(null, [], played)).toBe(false);
    expect(mightBeAnswered(null, mentionsIn("@Dungeon Master?", [dm]), played)).toBe(false);
  });

  it("spares the call when nobody at the table is played, and asks when the reader cannot tell", () => {
    expect(mightBeAnswered(null, toRosie, [{ ai_stands_in: false }])).toBe(false);
    expect(mightBeAnswered(null, toRosie, [{}])).toBe(true);
  });
});
