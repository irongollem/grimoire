import { describe, expect, it } from "vitest";
import { checkIdeas } from "./askIdeas.ts";
import { createReadLog } from "./askReads.ts";

function logWith(...refs: Array<[string, string, string]>) {
  const log = createReadLog();
  log.add(refs.map(([type, id, name]) => ({ type: type as "npc", id, name })));
  return log;
}

describe("checkIdeas", () => {
  it("keeps a canon line whose reference was read, under the name that was read", () => {
    const out = checkIdeas([{ title: "The mill", lines: [{ canon: true, text: "Harl owns it.", refs: [{ type: "npc", id: "n1", name: "Impostor" }] }] }], logWith(["npc", "n1", "Harl"]));
    expect(out.ideas[0].lines[0]).toEqual({ canon: true, text: "Harl owns it.", refs: [{ type: "npc", id: "n1", name: "Harl" }] });
  });

  it("drops a reference to a record that was not read, and says so", () => {
    const out = checkIdeas([{ title: "t", lines: [{ canon: true, text: "x", refs: [{ type: "npc", id: "n1" }, { type: "npc", id: "n9" }] }] }], logWith(["npc", "n1", "Harl"]));
    expect(out.ideas[0].lines[0].refs.map((r) => r.id)).toEqual(["n1"]);
    expect(out.notes.join(" ")).toContain("n9");
  });

  it("turns a canon line with no surviving reference into a new one, because nothing shows the campaign says it", () => {
    const out = checkIdeas([{ title: "t", lines: [{ canon: true, text: "The baron is a vampire.", refs: [{ type: "npc", id: "unread" }] }] }], createReadLog());
    expect(out.ideas[0].lines[0]).toMatchObject({ canon: false, refs: [] });
  });

  it("keeps a plain new line as it is", () => {
    const out = checkIdeas([{ title: "t", lines: [{ canon: false, text: "A flood." }] }], createReadLog());
    expect(out.ideas[0].lines[0]).toEqual({ canon: false, text: "A flood.", refs: [] });
  });

  it("skips an idea with no title or no lines, and takes no more than six", () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ title: `t${i}`, lines: [{ canon: false, text: "x" }] }));
    expect(checkIdeas([{ title: "", lines: [{ canon: false, text: "x" }] }, { title: "t", lines: [] }], createReadLog()).ideas).toEqual([]);
    expect(checkIdeas(many, createReadLog()).ideas).toHaveLength(6);
  });

  it("keeps a handoff only for a generator the contract lists", () => {
    const good = checkIdeas([{ title: "t", lines: [{ canon: false, text: "x" }], handoff: { generator: "npc", concept: "a baker" } }], createReadLog());
    expect(good.ideas[0].handoff).toEqual({ generator: "npc", concept: "a baker", inputs: {} });
    const bad = checkIdeas([{ title: "t", lines: [{ canon: false, text: "x" }], handoff: { generator: "wish", concept: "a baker" } }], createReadLog());
    expect(bad.ideas[0].handoff).toBeUndefined();
  });

  it("answers nothing for input that is not a list", () => {
    expect(checkIdeas("ideas", createReadLog()).ideas).toEqual([]);
  });
});
