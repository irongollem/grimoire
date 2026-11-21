import { describe, expect, it } from "vitest";
import { hideOutcome, searchFinds } from "@/rules/hide";

describe("hideOutcome", () => {
  // SRD 5.2 "Hide [Action]": Dexterity (Stealth), DC 15. Bug caught: off by one at the DC.
  it("2024 hides at exactly 15, not at 14, and says so", () => {
    expect(hideOutcome(15, "2024").hidden).toBe(true);
    expect(hideOutcome(14, "2024")).toEqual({ hidden: false, message: "Stealth 14: not hidden (DC 15)." });
  });

  // PHB 2014 ch. 7 "Hiding" and "Passive Perception": with no watchers known, the DM compares (hidden, total shown); with
  // watchers known, one whose passive Perception is at least the total notices. Bugs caught: a watcher at exactly the total
  // missed, or a hider noticed by watchers who are all below it.
  it("2014 is noticed by a watching foe whose passive Perception meets the total, and only then", () => {
    expect(hideOutcome(3, "2014").hidden).toBe(true);
    expect(hideOutcome(13, "2014", [10, 13]).hidden).toBe(false);
    expect(hideOutcome(14, "2014", [10, 13]).hidden).toBe(true);
    expect(hideOutcome(14, "2014", []).hidden).toBe(true);
  });
});

describe("searchFinds", () => {
  const hid = (stealth?: number) => (stealth === undefined ? { name: "Hidden" } : { name: "Hidden", stealth });
  // SRD 5.2: the Stealth total is the DC, so meeting it finds. PHB 2014: a contest, so a tie leaves the hider hidden.
  // Bug caught: the editions' tie rule swapped, or one comparison used for both.
  it("fails if a tie finds in 2014 or does not find in 2024", () => {
    expect(searchFinds(17, hid(17), "2024")).toBe(true);
    expect(searchFinds(16, hid(17), "2024")).toBe(false);
    expect(searchFinds(17, hid(17), "2014")).toBe(false);
    expect(searchFinds(18, hid(17), "2014")).toBe(true);
  });

  // APP CONVENTION: a Hidden put on by hand has no total and is found as if it were 15. Bug caught: never found, or always found.
  it("fails if a Hidden with no total is not found as if it were 15", () => {
    expect(searchFinds(15, hid(), "2024")).toBe(true);
    expect(searchFinds(14, hid(), "2024")).toBe(false);
  });
});
