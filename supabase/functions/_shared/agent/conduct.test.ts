import { describe, expect, it } from "vitest";
import { CHARACTER_CONDUCT, shownText, STRIKES_BEFORE_CLOSED, TABLE_CONDUCT, tableClosed } from "./conduct.ts";
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

describe("tableClosed", () => {
  // Bug caught: closed one refusal early or one late.
  it("closes at the set number of refused messages, not before", () => {
    expect(tableClosed(STRIKES_BEFORE_CLOSED - 1)).toBe(false);
    expect(tableClosed(STRIKES_BEFORE_CLOSED)).toBe(true);
  });
});
