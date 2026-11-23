import { describe, expect, it, vi } from "vitest";
import type { AskEvent } from "./askContract.ts";
import { createReadLog } from "./askReads.ts";
import { makeAskTools, type AskToolsInput } from "./askTools.ts";
import type { AgentTool, CallModel, ToolAnswer } from "./types.ts";

const CAMPAIGN = "00000000-0000-4000-8000-0000000000c1";
const OTHER = "00000000-0000-4000-8000-0000000000c2";
const NPC = "00000000-0000-4000-8000-0000000000f1";
const mcpTools: AgentTool[] = ["search", "get", "list", "campaign_overview"].map((name) => ({ name, description: name, inputSchema: {} }));
const ok = (content: unknown): ToolAnswer => ({ content: JSON.stringify(content), isError: false });

function setup(over: Partial<AskToolsInput> = {}) {
  const events: AskEvent[] = [];
  const input: AskToolsInput = {
    campaign: { id: CAMPAIGN, user_id: "u", name: "c", game_system: "dnd5e-2024", ai_enabled: true },
    fiveE: true,
    mcpTools,
    callMcp: async () => ok({ hits: [] }),
    find: async () => [],
    loadRecord: async () => ({ name: "Harl" }),
    newId: () => "proposal-1",
    reads: createReadLog(),
    emit: (e) => events.push(e),
    ...over,
  };
  return { tools: makeAskTools(input), events, input };
}

describe("the tool list", () => {
  it("offers the four readers and Ask's own four, and no tool that writes or rolls", () => {
    const names = setup().tools.tools.map((t) => t.name);
    expect(names.sort()).toEqual(["ask_choice", "campaign_overview", "find", "get", "list", "offer_ideas", "propose", "search"]);
  });

  it("offers a 5e generator in propose only where the campaign plays 5e", () => {
    const enumOf = (fiveE: boolean) => {
      const propose = setup({ fiveE }).tools.tools.find((t) => t.name === "propose")!;
      return ((propose.inputSchema.properties as Record<string, { enum: string[] }>).generator).enum;
    };
    expect(enumOf(true)).toContain("monster");
    expect(enumOf(false)).not.toContain("monster");
    expect(enumOf(false)).toContain("npc");
  });

  it("refuses a tool it does not have, such as the table's roll", async () => {
    const { tools } = setup();
    expect(await tools.callTool("roll", { expression: "1d20" })).toMatchObject({ isError: true });
    expect(await tools.callTool("create", { type: "npc" })).toMatchObject({ isError: true });
  });
});

describe("reading", () => {
  it("tells the browser which records a read named, once each, as names only", async () => {
    const { tools, events } = setup({ callMcp: async () => ok({ hits: [{ type: "npc", id: NPC, name: "Harl", summary: "poisoned the well" }] }) });
    await tools.callTool("search", { query: "harl" });
    await tools.callTool("search", { query: "harl" });
    expect(events).toEqual([{ type: "read", records: [{ type: "npc", id: NPC, name: "Harl" }] }]);
  });

  it("refuses a `get` of a row that belongs to another campaign of the same DM, and shows nothing of it", async () => {
    const { tools, events } = setup({ callMcp: async () => ok({ id: NPC, name: "Elsewhere", campaign_id: OTHER }) });
    const answer = await tools.callTool("get", { type: "npc", id: NPC });
    expect(answer.isError).toBe(true);
    expect(answer.content).not.toContain("Elsewhere");
    expect(events).toEqual([]);
  });

  it("lets a `get` of this campaign's row, or of the general catalogue (no campaign), through", async () => {
    for (const campaign_id of [CAMPAIGN, null]) {
      const { tools } = setup({ callMcp: async () => ok({ id: NPC, name: "Harl", campaign_id }) });
      expect((await tools.callTool("get", { type: "npc", id: NPC })).isError).toBe(false);
    }
  });

  it("answers find with the nearest records, and tells the model to use search when find is not available", async () => {
    const found = setup({ find: async () => [{ type: "location", id: NPC, name: "The mill", descriptor: "building" }] });
    const answer = await found.tools.callTool("find", { query: "where the grain is ground" });
    expect(JSON.parse(answer.content)).toMatchObject({ count: 1, hits: [{ type: "location", id: NPC, name: "The mill", summary: "building" }] });
    expect(found.events).toEqual([{ type: "read", records: [{ type: "location", id: NPC, name: "The mill" }] }]);
    const down = setup({ find: async () => null });
    expect(await down.tools.callTool("find", { query: "mill" })).toMatchObject({ isError: true });
    expect(await down.tools.callTool("find", { query: "x" })).toMatchObject({ isError: true });
  });
});

describe("ask_choice", () => {
  const valid = { question: "With a portrait?", choices: [{ label: "Yes", reply: "Yes, paint one", note: "costs extra" }, { label: "No", reply: "No portrait" }] };

  it("emits the question with its chips and ends the turn", async () => {
    const { tools, events } = setup();
    const answer = await tools.callTool("ask_choice", valid);
    expect(answer.isError).toBe(false);
    expect(events).toEqual([{ type: "ask", question: "With a portrait?", choices: [{ label: "Yes", reply: "Yes, paint one", note: "costs extra" }, { label: "No", reply: "No portrait" }] }]);
    expect(tools.ended()).toBe("ask");
  });

  it("refuses a question with fewer than two choices, or none", async () => {
    const { tools, events } = setup();
    expect((await tools.callTool("ask_choice", { question: "?", choices: [{ label: "Only", reply: "Only" }] })).isError).toBe(true);
    expect((await tools.callTool("ask_choice", { question: "", choices: valid.choices })).isError).toBe(true);
    expect(events).toEqual([]);
    expect(tools.ended()).toBeNull();
  });

  it("asks one question per turn: a second is refused", async () => {
    const { tools, events } = setup();
    await tools.callTool("ask_choice", valid);
    expect((await tools.callTool("ask_choice", valid)).isError).toBe(true);
    expect(events).toHaveLength(1);
  });
});

describe("propose", () => {
  it("emits one proposal with an id of the server's making, and ends the turn", async () => {
    const { tools, events } = setup();
    const answer = await tools.callTool("propose", { generator: "npc", concept: "a baker who lies", inputs: { name: "Mara" } });
    expect(answer.isError).toBe(false);
    expect(events).toEqual([{ type: "propose", proposal: { proposalId: "proposal-1", generator: "npc", concept: "a baker who lies", inputs: { name: "Mara" } } }]);
    expect(tools.proposal()?.proposalId).toBe("proposal-1");
    expect(tools.ended()).toBe("propose");
  });

  it("allows one proposal per turn: a second is refused and not emitted", async () => {
    const { tools, events } = setup();
    await tools.callTool("propose", { generator: "npc", concept: "a" });
    expect((await tools.callTool("propose", { generator: "faction", concept: "b" })).isError).toBe(true);
    expect(events).toHaveLength(1);
  });

  it("refuses a proposal once a question has been put to the DM", async () => {
    const { tools, events } = setup();
    await tools.callTool("ask_choice", { question: "?", choices: [{ label: "a", reply: "a" }, { label: "b", reply: "b" }] });
    expect((await tools.callTool("propose", { generator: "npc", concept: "a" })).isError).toBe(true);
    expect(events.map((e) => e.type)).toEqual(["ask"]);
  });

  it("when a question lands while the target is still being checked, the proposal is the one refused", async () => {
    let release: (v: { name: string }) => void = () => undefined;
    const { tools, events } = setup({ loadRecord: () => new Promise((resolve) => { release = resolve; }) });
    const pending = tools.callTool("propose", { generator: "portrait", concept: "x", target: { type: "npc", id: NPC } });
    await tools.callTool("ask_choice", { question: "?", choices: [{ label: "a", reply: "a" }, { label: "b", reply: "b" }] });
    release({ name: "Harl" });
    expect((await pending).isError).toBe(true);
    expect(events.map((e) => e.type)).toEqual(["ask"]);
  });

  it("emits nothing for a proposal the checks refuse", async () => {
    const { tools, events } = setup({ loadRecord: async () => null });
    expect((await tools.callTool("propose", { generator: "portrait", concept: "x", target: { type: "npc", id: NPC } })).isError).toBe(true);
    expect((await tools.callTool("propose", { generator: "wish", concept: "x" })).isError).toBe(true);
    expect(events).toEqual([]);
    expect(tools.proposal()).toBeNull();
  });
});

describe("offer_ideas", () => {
  it("emits ideas and drops a reference to a record this conversation did not read", async () => {
    const reads = createReadLog();
    const { tools, events } = setup({ reads, callMcp: async () => ok({ hits: [{ type: "npc", id: NPC, name: "Harl" }] }) });
    await tools.callTool("search", { query: "harl" });
    await tools.callTool("offer_ideas", { ideas: [{ title: "t", lines: [{ canon: true, text: "Harl owns it.", refs: [{ type: "npc", id: NPC }, { type: "npc", id: "unread" }] }] }] });
    const ideas = events.find((e) => e.type === "ideas");
    expect(ideas).toMatchObject({ ideas: [{ lines: [{ canon: true, refs: [{ id: NPC }] }] }] });
    expect(tools.ended()).toBeNull();
  });

  it("is refused when no idea has a title and a line", async () => {
    const { tools, events } = setup();
    expect((await tools.callTool("offer_ideas", { ideas: [] })).isError).toBe(true);
    expect(events).toEqual([]);
  });
});

describe("endAware", () => {
  const who = { provider: "openai", model: "m1" };
  it("passes the model through until the turn has ended, then answers with an empty step and no call", async () => {
    const real = vi.fn<CallModel>(async () => ({ blocks: [], stop: "end", usage: { ...who, inputTokens: 9, outputTokens: 9, cacheReadTokens: 0, cacheWriteTokens: 0 } }));
    const { tools } = setup();
    const call = tools.endAware(real, who);
    await call({ system: "", messages: [], tools: [], maxOutputTokens: 1 });
    expect(real).toHaveBeenCalledOnce();
    await tools.callTool("propose", { generator: "npc", concept: "a" });
    const after = await call({ system: "", messages: [], tools: [], maxOutputTokens: 1 });
    expect(real).toHaveBeenCalledOnce();
    expect(after).toMatchObject({ blocks: [], stop: "end", usage: { inputTokens: 0, outputTokens: 0 } });
  });
});
