import { describe, expect, it } from "vitest";
import { CHARACTER_CONDUCT, FIXED_TABLE_CONDUCT, readsAsChild, shownText, speakerIdsOf, STRIKES_BEFORE_CLOSED, TABLE_CONDUCT, tableClosed, tableConduct, tableViolenceOf, violenceLine, type TableViolence } from "./conduct.ts";
import { soloTableSystem } from "./soloTablePrompt.ts";
import { speakerSystem } from "./characterTurn.ts";
import type { AgentMessage } from "./types.ts";

describe("the table's conduct rules", () => {
  // Bug caught: the rules written and never given to the model, for the narrator or for a character's own call
  // (a character answers from its own instructions and never sees the narrator's).
  it("are part of the narrator's instructions and of every character's", () => {
    expect(soloTableSystem({ id: "c1", name: "Sugarwell", rulesetLabel: "D&D 5e (2024)" })).toContain(TABLE_CONDUCT);
    expect(speakerSystem({ name: "Crumb", profile: null, manner: null, memories: "", heard: [] })).toContain(CHARACTER_CONDUCT);
  });

  // Bug caught: the rules placed after the campaign's own section, where a campaign's text could be read as the
  // last word, and where they would fall outside the cached prefix.
  it("come before the campaign's own section", () => {
    const system = soloTableSystem({ id: "c1", name: "Sugarwell", rulesetLabel: "D&D 5e (2024)" });
    expect(system.indexOf(TABLE_CONDUCT)).toBeLessThan(system.indexOf("## This table"));
  });
});

describe("shownText", () => {
  const added: AgentMessage[] = [
    { role: "user", blocks: [{ type: "text", text: "[The player says: hello] (written for the model)" }] },
    { role: "assistant", blocks: [{ type: "text", text: "A young person waits on the step." }, { type: "tool_call", id: "t1", name: "get", input: { note: "DM-ONLY" } }] },
    {
      role: "user",
      blocks: [{ type: "tool_result", callId: "t1", content: "DM-ONLY secret", isError: false, lines: [{ kind: "spoken", speaker: { id: "n1", name: "Honeycomb" }, text: "Apprentice, once." }, { kind: "acted", speaker: { id: "n1", name: "Honeycomb" }, text: "Holds out the keys." }] }],
    },
    { role: "assistant", blocks: [{ type: "text", text: "She still stands there.", unshown: true }] },
  ];

  // Bug caught: the DM's private notes (a tool's answer) or the wording written for the model sent to the screen,
  // refusing a turn for words no player would ever see; or a character's line left out of it.
  it("is the narration the player sees and every line a character said or did, and nothing else", () => {
    expect(shownText(added)).toBe("A young person waits on the step.\nApprentice, once.\nHolds out the keys.");
  });

  it("is empty for a turn that showed nothing", () => {
    expect(shownText([{ role: "assistant", blocks: [{ type: "tool_call", id: "t", name: "roll", input: {} }] }])).toBe("");
  });
});

describe("readsAsChild", () => {
  // App convention: under 18 years is a child to the screen, whatever kind of creature the record names.
  it.each([
    ["~7 half-named Pours", true],
    ["17", true],
    ["18", false],
    ["~20 Pours by Sugarspun reckoning", false],
    ["a boy of the docks", true],
    ["teenager", true],
    // Bug caught: "young" read as a child, so every young adult's scene is held to the child's bar.
    ["young", false],
    // Bug caught: a word inside another word ("boyish", "kidnapped") read as a child.
    ["a boyish man, once kidnapped", false],
    ["ancient", false],
  ])("%s -> %s", (age, child) => {
    expect(readsAsChild(age)).toBe(child);
  });

  it("says nothing of a record with no age", () => {
    expect(readsAsChild(null)).toBe(false);
  });
});

describe("speakerIdsOf", () => {
  // Bug caught: a child who only did something (no spoken line), or someone with no record, deciding the bar wrongly.
  it("is everyone with a record who said or did something, once each", () => {
    const added: AgentMessage[] = [
      {
        role: "user",
        blocks: [
          {
            type: "tool_result",
            callId: "a",
            content: "ok",
            isError: false,
            lines: [
              { kind: "acted", speaker: { id: "crumb", name: "Crumb" }, text: "Hides." },
              { kind: "spoken", speaker: { id: "crumb", name: "Crumb" }, text: "No." },
              { kind: "spoken", speaker: { id: null, name: "A passer-by" }, text: "Oi." },
            ],
          },
        ],
      },
    ];
    expect(speakerIdsOf(added)).toEqual(["crumb"]);
  });
});

describe("tableClosed", () => {
  // Bug caught: closed one refusal early or one late.
  it("closes at the set number of refused messages, not before", () => {
    expect(tableClosed(STRIKES_BEFORE_CLOSED - 1)).toBe(false);
    expect(tableClosed(STRIKES_BEFORE_CLOSED)).toBe(true);
  });
});

describe("the violence dial", () => {
  const LEVELS: TableViolence[] = ["gentle", "standard", "grim"];
  const system = (violence?: TableViolence) => soloTableSystem({ id: "c1", name: "Sugarwell", rulesetLabel: "D&D 5e (2024)", violence });

  // Bug caught: the standard wording drifting when the line became a setting, changing every existing table's narrator.
  it("keeps the standard wording exactly as the table always had it", () => {
    expect(violenceLine("standard")).toBe(
      "- Violence, danger, cruelty and horror are told the way a D&D table tells them: plainly, without relish and without\n  gore for its own sake.",
    );
    expect(TABLE_CONDUCT).toBe(tableConduct("standard"));
  });

  // Bug caught: two levels sharing a wording, so the setting changes nothing the narrator reads.
  it("words each level differently, gentle toward less lingering and grim toward weight", () => {
    const lines = LEVELS.map(violenceLine);
    expect(new Set(lines).size).toBe(3);
    expect(violenceLine("gentle")).toMatch(/without lingering on wounds, blood or cruelty/);
    expect(violenceLine("grim")).toMatch(/grim and unflinching/);
    expect(violenceLine("grim")).toMatch(/never gore for its own sake/);
  });

  // Bug caught: a level that loosens the sexual-content rules (the dial reaching what must never move).
  it.each(LEVELS)("tells the sexual-content and child rules word for word at %s", (level) => {
    expect(tableConduct(level)).toContain(FIXED_TABLE_CONDUCT);
    expect(FIXED_TABLE_CONDUCT).toContain("This table tells nothing sexual.");
    expect(FIXED_TABLE_CONDUCT).toContain("Never anything sexual or romantic involving a child");
    // The only text that differs between two levels is the violence line.
    const rest = tableConduct(level).replace(violenceLine(level), "");
    expect(rest).toBe(tableConduct("standard").replace(violenceLine("standard"), ""));
  });

  // Bug caught: the setting never reaching the system text, so a DM's choice is stored and ignored.
  it.each(LEVELS)("puts the %s wording, and only that wording, into the narrator's system text", (level) => {
    const text = system(level);
    expect(text).toContain(violenceLine(level));
    for (const other of LEVELS.filter((l) => l !== level)) expect(text).not.toContain(violenceLine(other));
  });

  // Bug caught: a caller that gives no level getting something other than the default table.
  it("reads no level as the standard one", () => {
    expect(system()).toBe(system("standard"));
  });

  // Bug caught: an unexpected stored value reaching the prompt as undefined text.
  it("reads only the two named levels, and anything else as standard", () => {
    expect(tableViolenceOf("gentle")).toBe("gentle");
    expect(tableViolenceOf("grim")).toBe("grim");
    expect(tableViolenceOf("savage")).toBe("standard");
    expect(tableViolenceOf(null)).toBe("standard");
  });
});
