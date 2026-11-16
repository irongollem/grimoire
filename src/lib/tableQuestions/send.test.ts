import { describe, expect, it } from "vitest";
import { answererName, buildSendPayload, canSend, type SendChoices } from "./send";

const base: SendChoices = {
  campaignId: "c1",
  table: { id: "t1", dice: "1d8" },
  prompt: "  Choose a pet ",
  mode: "pick",
  exclusive: true,
  hidden: true,
  options: [],
};

describe("buildSendPayload", () => {
  it("a pick keeps exclusive and drops hidden and the die", () => {
    // Fails if a leftover vote switch reaches the insert and the DB check refuses it.
    expect(buildSendPayload(base)).toMatchObject({ exclusive: true, hidden: false, dice: null, prompt: "Choose a pet" });
  });
  it("a vote keeps hidden and drops exclusive", () => {
    expect(buildSendPayload({ ...base, mode: "vote" })).toMatchObject({ exclusive: false, hidden: true, dice: null });
  });
  it("a roll sends the table's die and neither switch", () => {
    expect(buildSendPayload({ ...base, mode: "roll" })).toMatchObject({ exclusive: false, hidden: false, dice: "1d8" });
  });
});

describe("canSend", () => {
  const option = { id: "a", label: "A", blurb: null, image_url: null, focal: null, ref: null, min: 1, max: 1 };
  it("needs words and an option", () => {
    expect(canSend("Hi", [option])).toBe(true);
    expect(canSend("  ", [option])).toBe(false);
    expect(canSend("Hi", [])).toBe(false);
  });
});

describe("answererName", () => {
  const members = [{ user_id: "u1", display_name: "Sam" }];
  const characters = [{ id: "p1", name: "Pip" }];
  it("prefers the character", () => {
    expect(answererName({ user_id: "u1", party_member_id: "p1" }, members, characters)).toBe("Pip");
  });
  it("falls back to the member, then to a plain label", () => {
    expect(answererName({ user_id: "u1", party_member_id: null }, members, characters)).toBe("Sam");
    expect(answererName({ user_id: "u9", party_member_id: null }, members, characters)).toBe("A player");
  });
});
