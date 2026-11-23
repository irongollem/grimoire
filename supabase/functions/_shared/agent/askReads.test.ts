import { describe, expect, it } from "vitest";
import { createReadLog, recordsRead, seedReadLog } from "./askReads.ts";
import type { AgentMessage } from "./types.ts";

const ok = (content: unknown) => ({ content: JSON.stringify(content), isError: false });

describe("recordsRead", () => {
  it("names the records a search, a list and a find returned, by type, id and name", () => {
    expect(recordsRead("search", {}, ok({ hits: [{ type: "npc", id: "n1", name: "Harl", summary: "SECRET" }] }))).toEqual([{ type: "npc", id: "n1", name: "Harl" }]);
    expect(recordsRead("list", {}, ok({ items: [{ type: "location", id: "l1", name: "Mill" }] }))).toEqual([{ type: "location", id: "l1", name: "Mill" }]);
    expect(recordsRead("find", {}, ok({ hits: [{ type: "faction", id: "f1", name: "Guild" }] }))).toEqual([{ type: "faction", id: "f1", name: "Guild" }]);
  });

  // Bug caught: canon idea "the campaign has an active quest called Perf Quest" read through campaign_overview was
  // demoted to a new idea, because the overview's records were never logged.
  it("names the party, active quests and recent notes a campaign_overview answer lists", () => {
    const answer = ok({
      campaign: { id: "c1", name: "Kind Country" },
      party: [{ id: "p1", name: "Ysolde" }],
      active_quests: [{ id: "q1", title: "Perf Quest" }],
      recent_notes: [{ id: "n1", title: "Session 3" }],
    });
    expect(recordsRead("campaign_overview", {}, answer)).toEqual([
      { type: "party_member", id: "p1", name: "Ysolde" },
      { type: "quest", id: "q1", name: "Perf Quest" },
      { type: "note", id: "n1", name: "Session 3" },
    ]);
  });

  it("names a `get` by the type that was asked for, taking the name or the title", () => {
    expect(recordsRead("get", { type: "quest", id: "q1" }, ok({ id: "q1", title: "The Stain", body: "x" }))).toEqual([{ type: "quest", id: "q1", name: "The Stain" }]);
  });

  it("never names a body or a field: only the three the event carries", () => {
    const refs = recordsRead("get", { type: "npc", id: "n1" }, ok({ id: "n1", name: "Harl", backstory: "poisoned the well" }));
    expect(Object.keys(refs[0]).sort()).toEqual(["id", "name", "type"]);
  });

  it("names nothing for a failed call, a tool that does not read records, or an answer that is not JSON", () => {
    expect(recordsRead("search", {}, { content: JSON.stringify({ hits: [{ type: "npc", id: "n1", name: "Harl" }] }), isError: true })).toEqual([]);
    expect(recordsRead("roll", {}, ok({ hits: [{ type: "npc", id: "n1", name: "Harl" }] }))).toEqual([]);
    expect(recordsRead("search", {}, { content: "not json", isError: false })).toEqual([]);
  });

  it("skips kinds the contract has no name for, such as a canon clue or a memory", () => {
    expect(recordsRead("search", {}, ok({ hits: [{ type: "npc_memory", id: "m1", name: "x" }, { type: "npc", id: "n1", name: "Harl" }] }))).toEqual([{ type: "npc", id: "n1", name: "Harl" }]);
  });

  it("still reads the hits before a cut notice when a long answer was truncated", () => {
    const whole = JSON.stringify({ hits: [{ type: "npc", id: "n1", name: "Harl" }] });
    expect(recordsRead("search", {}, { content: `${whole}\n[Cut: this answer was long]`, isError: false })).toHaveLength(1);
  });
});

describe("createReadLog", () => {
  it("reports a record once, however often it is read again", () => {
    const log = createReadLog();
    expect(log.add([{ type: "npc", id: "n1", name: "Harl" }])).toHaveLength(1);
    expect(log.add([{ type: "npc", id: "n1", name: "Harl" }])).toEqual([]);
    expect(log.has("npc", "n1")).toBe(true);
    expect(log.has("npc", "n2")).toBe(false);
    expect(log.has("location", "n1")).toBe(false);
  });
});

describe("seedReadLog", () => {
  it("recovers what earlier turns read, from the stored call and its result", () => {
    const history: AgentMessage[] = [
      { role: "assistant", blocks: [{ type: "tool_call", id: "c1", name: "search", input: { query: "harl" } }] },
      { role: "user", blocks: [{ type: "tool_result", callId: "c1", content: JSON.stringify({ hits: [{ type: "npc", id: "n1", name: "Harl" }] }), isError: false }] },
    ];
    const log = createReadLog();
    seedReadLog(log, history);
    expect(log.has("npc", "n1")).toBe(true);
  });
});
