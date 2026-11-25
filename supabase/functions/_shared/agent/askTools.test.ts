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
    readRules: async () => ({ status: "ok", edition: "2024", hits: [], books: [] }),
    newId: () => "proposal-1",
    recordManualGap: async () => undefined,
    reads: createReadLog(),
    emit: (e) => events.push(e),
    ...over,
  };
  return { tools: makeAskTools(input), events, input };
}

describe("the tool list", () => {
  it("offers the four readers and Ask's own eight, and no tool that writes or rolls", () => {
    const names = setup().tools.tools.map((t) => t.name);
    expect(names.sort()).toEqual(["ask_choice", "campaign_overview", "draft_report", "find", "get", "list", "log_manual_gap", "offer_ideas", "propose", "read_manual", "read_rules", "search"]);
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

  // Bug caught (#1253 audit): bindTools cuts an answer over 20,000 characters, the cut text no longer parses, and
  // the check used to pass it on as "naming no campaign", so a long row of another campaign reached the model.
  it("refuses a cut `get` answer of another campaign's row, and keeps a cut one of this campaign's", async () => {
    const cut = (campaign_id: string) => ({ content: `${JSON.stringify({ id: NPC, campaign_id, name: "Long", notes: "x".repeat(25_000) }).slice(0, 20_000)}\n[Cut: too long]`, isError: false });
    const foreign = setup({ callMcp: async () => cut(OTHER) });
    const refused = await foreign.tools.callTool("get", { type: "quest", id: NPC });
    expect(refused.isError).toBe(true);
    expect(foreign.events).toEqual([]);
    const own = setup({ callMcp: async () => cut(CAMPAIGN) });
    expect((await own.tools.callTool("get", { type: "quest", id: NPC })).isError).toBe(false);
  });

  // Bug caught: an answer whose campaign cannot be read at all passing on the benefit of the doubt.
  it("refuses a `get` answer whose campaign it cannot read", async () => {
    const { tools } = setup({ callMcp: async () => ({ content: "not json and names nothing", isError: false }) });
    expect((await tools.callTool("get", { type: "npc", id: NPC })).isError).toBe(true);
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

describe("propose's inputs", () => {
  // Bug caught: the model was never told which keys `inputs` takes, so it could not name a tie it was never shown.
  it("tells the model every generator's option keys, and a tie's words by kind of record", () => {
    const propose = setup({ fiveE: true }).tools.tools.find((t) => t.name === "propose")!;
    const inputs = (propose.inputSchema.properties as Record<string, { description: string }>).inputs.description;
    expect(inputs).toMatch(/(^|\n)npc: /);
    expect(inputs).toContain("links (list of {kind, id, relation})");
    expect(inputs).toContain("deity: ");
    expect(inputs).toContain("worships");
    expect(inputs).toContain("works_at");
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

describe("ask_choice about a picture the DM already settled", () => {
  const picture = { question: "Want a portrait for Mara?", choices: [{ label: "Yes", reply: "Yes, paint one" }, { label: "No", reply: "No portrait" }] };
  // Bug caught: the model asking about a portrait after the DM wrote "No portrait." (live run, twice).
  it("refuses it, tells the model what the DM said, and ends nothing", async () => {
    const { tools, events } = setup({ dmMessages: ["Make a baker called Mara. No portrait."] });
    const answer = await tools.callTool("ask_choice", picture);
    expect(answer.isError).toBe(true);
    expect(answer.content).toContain("no picture");
    expect(events).toEqual([]);
    expect(tools.ended()).toBeNull();
  });

  it("also refuses it when an earlier message settled it", async () => {
    const { tools } = setup({ dmMessages: ["no portrait", "make her a baker"] });
    expect((await tools.callTool("ask_choice", picture)).isError).toBe(true);
  });

  // Bug caught: the guard blocking every question, or asking nothing of a DM who never settled the picture.
  it("lets a picture question through when the DM said nothing, and other questions when they said no", async () => {
    const open = setup({ dmMessages: ["a baker"] });
    expect((await open.tools.callTool("ask_choice", picture)).isError).toBe(false);
    const other = setup({ dmMessages: ["a baker, no portrait"] });
    const answer = await other.tools.callTool("ask_choice", { question: "Where do they live?", choices: [{ label: "Town", reply: "Town" }, { label: "Farm", reply: "Farm" }] });
    expect(answer.isError).toBe(false);
  });
});

describe("draft_report", () => {
  const bug = { kind: "bug", where: "NPCs, Mara", action: "Opened Mara", expected: "A portrait", actual: "A blank box" };

  // Bug caught: a draft that did not reach the browser, or one that left the turn running to write "I sent it".
  it("emits the draft, ends the turn and tells the model to stop", async () => {
    const { tools, events } = setup();
    const answer = await tools.callTool("draft_report", bug);
    expect(answer.isError).toBe(false);
    expect(events).toEqual([{ type: "report", report: bug }]);
    expect(tools.ended()).toBe("report");
    expect(answer.content).toMatch(/Stop now/);
  });

  // Bug caught: an invalid draft shown to the DM, or ending the turn so the model cannot correct it.
  it("refuses a draft missing a field, emits nothing and leaves the turn open", async () => {
    const { tools, events } = setup();
    expect(await tools.callTool("draft_report", { ...bug, actual: "" })).toMatchObject({ isError: true });
    expect(events).toEqual([]);
    expect(tools.ended()).toBeNull();
  });

  // Bug caught: a second draft (or a draft after a question) stacking forms on the DM's screen.
  it("allows one draft per turn, and none after the turn ended another way", async () => {
    const { tools, events } = setup();
    await tools.callTool("draft_report", bug);
    expect(await tools.callTool("draft_report", bug)).toMatchObject({ isError: true });
    expect(events).toHaveLength(1);
    const asked = setup();
    await asked.tools.callTool("ask_choice", { question: "Which?", choices: [{ label: "a", reply: "a" }, { label: "b", reply: "b" }] });
    expect(await asked.tools.callTool("draft_report", bug)).toMatchObject({ isError: true });
  });

  // Bug caught: the model being called again after a draft, billing a restatement of what is on the screen.
  it("makes the next model call answer at once, like a proposal", async () => {
    const { tools } = setup();
    await tools.callTool("draft_report", bug);
    const real: CallModel = vi.fn();
    const step = await tools.endAware(real, { provider: "p", model: "m" })({} as never);
    expect(real).not.toHaveBeenCalled();
    expect(step.blocks).toEqual([]);
  });
});

describe("read_manual", () => {
  // Bug caught: the DM's "about" versus "known to" question answered from campaign records because the manual tool
  // returned nothing useful (#1253: Ask read six records, found nothing and guessed).
  it("returns the Canon page for the about / known to question, without ending the turn or telling the browser", async () => {
    const { tools, events } = setup();
    const answer = await tools.callTool("read_manual", { query: "about known to backstory connection" });
    const parsed = JSON.parse(answer.content) as { pages: Array<{ id: string; text: string }> };
    expect(answer.isError).toBe(false);
    expect(parsed.pages[0].id).toBe("worldbuilding-canon");
    expect(parsed.pages[0].text).toMatch(/known to/i);
    expect(tools.ended()).toBeNull();
    expect(events).toEqual([]);
  });

  // Bug caught: an empty result that gives the model nothing to act on, so it fills the silence with a guess.
  it("says so when no page matches, and tells the model not to guess", async () => {
    const answer = await setup().tools.callTool("read_manual", { query: "zzqx flurble wombat" });
    expect(JSON.parse(answer.content)).toMatchObject({ pages: [], note: expect.stringContaining("log_manual_gap") });
  });

  // Bug caught: the gap reminder only riding on an empty search, so pages on the topic that leave the question open
  // (can a voice speak Dutch?) were answered "the manual does not say" and never reached the ledger.
  it("reminds the model to note a gap even when pages match", async () => {
    const answer = await setup().tools.callTool("read_manual", { query: "about known to backstory connection" });
    const parsed = JSON.parse(answer.content) as { pages: unknown[]; note?: string };
    expect(parsed.pages.length).toBeGreaterThan(0);
    expect(parsed.note).toContain("log_manual_gap");
  });
});

describe("read_rules", () => {
  const grappled = { status: "ok" as const, edition: "2024" as const, books: ["Grimoire Rules"], hits: [{ kind: "condition" as const, name: "Grappled", source: "srd-2024", sourceTitle: "Grimoire Rules", text: "Speed 0." }] };

  // Bug caught: the model's `kind` reaching the reader unchecked, so a made-up kind searched nothing and answered "not covered".
  it("refuses a kind it does not know and never calls the reader", async () => {
    const readRules = vi.fn(async () => grappled);
    const answer = await setup({ readRules }).tools.callTool("read_rules", { query: "grappled", kind: "weather" });
    expect(answer.isError).toBe(true);
    expect(readRules).not.toHaveBeenCalled();
  });

  // Bug caught: a rules answer that does not name the book, so the DM cannot tell it from the model's memory.
  it("answers with the passage, its book's title and the edition, without ending the turn", async () => {
    const t = setup({ readRules: async () => grappled });
    const answer = await t.tools.callTool("read_rules", { query: "grappled", kind: "condition" });
    const parsed = JSON.parse(answer.content) as { edition: string; hits: Array<{ book: string; text: string }> };
    expect(parsed.edition).toBe("2024");
    expect(parsed.hits).toEqual([expect.objectContaining({ book: "Grimoire Rules", text: "Speed 0." })]);
    expect(t.tools.ended()).toBeNull();
  });

  // Bug caught: an empty result that invites the model to answer from memory instead of saying the books do not cover it.
  it("says the enabled books do not cover it when nothing is found", async () => {
    const t = setup({ readRules: async () => ({ status: "ok", edition: "2014", hits: [], books: ["Grimoire Rules"] }) });
    const parsed = JSON.parse((await t.tools.callTool("read_rules", { query: "flurble", kind: "any" })).content) as { hits: unknown[]; note: string };
    expect(parsed.hits).toEqual([]);
    expect(parsed.note).toContain("Grimoire Rules");
    expect(parsed.note).toContain("do not cover it");
  });
});

describe("log_manual_gap", () => {
  const read = (t: ReturnType<typeof setup>) => t.tools.callTool("read_manual", { query: "zzqx" });

  // Bug caught: the ledger gaining a user, campaign or session argument, which makes an "anonymous" row identifiable.
  it("passes the dep the question and the page ids and nothing else", async () => {
    const recordManualGap = vi.fn(async () => undefined);
    const t = setup({ recordManualGap });
    await read(t);
    await t.tools.callTool("log_manual_gap", { question: "What does the flurble switch do?", pages_checked: ["worldbuilding-canon"] });
    expect(recordManualGap).toHaveBeenCalledTimes(1);
    expect(recordManualGap.mock.calls[0]).toEqual(["What does the flurble switch do?", ["worldbuilding-canon"]]);
  });

  // Bug caught: a model that loops on the tool filling the ledger with one question many times.
  it("refuses a second note in the same turn", async () => {
    const recordManualGap = vi.fn(async () => undefined);
    const t = setup({ recordManualGap });
    await read(t);
    await t.tools.callTool("log_manual_gap", { question: "one" });
    const second = await t.tools.callTool("log_manual_gap", { question: "two" });
    expect(second.isError).toBe(true);
    expect(recordManualGap).toHaveBeenCalledTimes(1);
  });

  // Bug caught: noting a gap without looking, so a question the manual does answer lands in the ledger.
  it("refuses before the manual was searched this turn", async () => {
    const recordManualGap = vi.fn(async () => undefined);
    const answer = await setup({ recordManualGap }).tools.callTool("log_manual_gap", { question: "How does X work?" });
    expect(answer.isError).toBe(true);
    expect(recordManualGap).not.toHaveBeenCalled();
  });

  // Bug caught: invented page ids, a long pasted question and duplicate ids reaching the ledger.
  it("drops ids that are not manual pages, caps the question and the pages", async () => {
    const recordManualGap = vi.fn(async () => undefined);
    const manualPages = Array.from({ length: 12 }, (_, i) => ({ id: `p${i}`, title: `P${i}`, section: "S", summary: "", keywords: [], body: "" }));
    const t = setup({ recordManualGap, manualPages });
    await read(t);
    await t.tools.callTool("log_manual_gap", { question: "q".repeat(900), pages_checked: ["ghost", "p1", "p1", ...manualPages.map((p) => p.id)] });
    const [question, pages] = recordManualGap.mock.calls[0] as unknown as [string, string[]];
    expect(question).toHaveLength(500);
    expect(pages).toHaveLength(10);
    expect(pages).not.toContain("ghost");
    expect(new Set(pages).size).toBe(pages.length);
  });

  // Bug caught: a ledger outage failing the DM's answer (the maintainer: a failed note is never fatal).
  it("does not fail the turn when the ledger write throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const t = setup({ recordManualGap: async () => { throw new Error("db down"); } });
    await read(t);
    const answer = await t.tools.callTool("log_manual_gap", { question: "How does X work?" });
    expect(answer.isError).toBe(false);
  });
});
