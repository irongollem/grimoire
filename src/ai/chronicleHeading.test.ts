import { describe, it, expect } from "vitest";
import { parseChronicleHeading } from "./chronicleHeading";

describe("parseChronicleHeading", () => {
  it("splits a numbered session title off the top", () => {
    const r = parseChronicleHeading("# Session 4: The Duke's Blood\n\nThe party arrived at dusk.\n");
    expect(r).toEqual({
      title: "The Duke's Blood",
      sessionNum: 4,
      body: "The party arrived at dusk.\n",
    });
  });

  it("reads the separators models actually emit", () => {
    for (const line of [
      "# Session 12 — The Long Dark",
      "# Session 12 - The Long Dark",
      "# Session 12: The Long Dark",
      "# Session #12 – The Long Dark",
      "# Session 12. The Long Dark",
    ]) {
      const r = parseChronicleHeading(`${line}\n\nBody.`);
      expect(r.sessionNum, line).toBe(12);
      expect(r.title, line).toBe("The Long Dark");
    }
  });

  it("takes an unnumbered H1 as the title", () => {
    const r = parseChronicleHeading("# The Duke's Blood\n\nThe party arrived.");
    expect(r).toEqual({ title: "The Duke's Blood", sessionNum: null, body: "The party arrived." });
  });

  it("takes a lower-level heading only when it names a session", () => {
    const numbered = parseChronicleHeading("## Session 7: Ashes\n\nSmoke.");
    expect(numbered).toEqual({ title: "Ashes", sessionNum: 7, body: "Smoke." });

    // A run of `##` scene dividers — eating the first would delete a section.
    const divider = parseChronicleHeading("## The Confrontation\n\nThey fought.\n\n## The Retreat\n\nThey ran.");
    expect(divider.title).toBeNull();
    expect(divider.sessionNum).toBeNull();
    expect(divider.body).toContain("## The Confrontation");
  });

  it("keeps a session number whose heading carries no title of its own", () => {
    const r = parseChronicleHeading("# Session 9\n\nThe road went on.");
    expect(r).toEqual({ title: null, sessionNum: 9, body: "The road went on." });
  });

  it("strips the emphasis models wrap titles in", () => {
    const r = parseChronicleHeading("# **Session 3: The Sunless Vault**\n\nDeep.");
    expect(r.title).toBe("The Sunless Vault");
    expect(r.sessionNum).toBe(3);
  });

  it("leaves output that opens with prose completely alone", () => {
    const md = "The party arrived at dusk.\n\n# Not a title, a later heading\n\nMore.";
    expect(parseChronicleHeading(md)).toEqual({ title: null, sessionNum: null, body: md });
  });

  it("does not read a number out of a title that merely says 'session'", () => {
    const r = parseChronicleHeading("# The Session of Blades\n\nSteel.");
    expect(r).toEqual({ title: "The Session of Blades", sessionNum: null, body: "Steel." });
  });

  it("tolerates leading blank lines and closing hashes", () => {
    const r = parseChronicleHeading("\n\n# Session 2: Rivergate #\n\nWater.");
    expect(r).toEqual({ title: "Rivergate", sessionNum: 2, body: "Water." });
  });

  it("returns the input untouched when there is nothing to parse", () => {
    expect(parseChronicleHeading("")).toEqual({ title: null, sessionNum: null, body: "" });
    expect(parseChronicleHeading("   \n  \n")).toEqual({ title: null, sessionNum: null, body: "   \n  \n" });
  });

  it("keeps a scene marker that precedes any heading", () => {
    const md = "[[scene: a rain-soaked gate]]\n\n# Session 1: Arrival\n\nRain.";
    expect(parseChronicleHeading(md).body).toBe(md);
  });
});
