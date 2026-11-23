import { describe, expect, it, vi } from "vitest";
import { listTools } from "../mcp/tools";
import { ENTITY_TYPES } from "../mcp/registry";
import { agentToolsFrom, ASK_OWN_TOOLS, ASK_TOOLS, bindTools, SOLO_TABLE_TOOLS, TABLE_REFUSED_TYPES } from "./mcpTools";

describe("agentToolsFrom", () => {
  const tools = [
    { name: "roll", description: "r", inputSchema: { type: "object" } },
    { name: "create", description: "c", inputSchema: { type: "object" } },
  ];

  it("offers only the tools on the allow list, with their schema", () => {
    expect(agentToolsFrom(tools, new Set(["roll"]))).toEqual([{ name: "roll", description: "r", inputSchema: { type: "object" } }]);
  });
});

describe("bindTools", () => {
  it("never invokes a tool outside the allow list and answers with an error", async () => {
    const call = vi.fn(async () => ({ ok: true }));
    const run = bindTools(call, new Set(["roll"]));
    const out = await run("create", { type: "npc" });
    expect(out.isError).toBe(true);
    expect(call).not.toHaveBeenCalled();
  });

  it("returns an allowed tool's result as JSON text", async () => {
    const run = bindTools(async () => ({ total: 17 }), new Set(["roll"]));
    expect(await run("roll", {})).toEqual({ content: '{"total":17}', isError: false });
  });

  it("passes the name and arguments through", async () => {
    const call = vi.fn(async () => 1);
    await bindTools(call, new Set(["get"]))("get", { id: "x" });
    expect(call).toHaveBeenCalledWith("get", { id: "x" });
  });

  it("turns a throwing handler into an error result instead of rejecting", async () => {
    const run = bindTools(async () => {
      throw new Error("Not found");
    }, new Set(["get"]));
    expect(await run("get", {})).toEqual({ content: "Not found", isError: true });
  });

  it("refuses a result that carries a file for an MCP client", async () => {
    const run = bindTools(async () => ({ _mcpContent: [{ type: "image", data: "AAAA", mimeType: "image/png" }] }), new Set(["get"]));
    expect(await run("get", {})).toEqual({ content: "This tool returns a file the table cannot read.", isError: true });
  });

  it("cuts a long result and says it was cut and how long it was", async () => {
    const run = bindTools(async () => "x".repeat(100), new Set(["list"]), 50);
    const out = await run("list", {});
    expect(out.isError).toBe(false);
    expect(out.content.startsWith('"' + "x".repeat(49))).toBe(true);
    expect(out.content).toContain("102 characters");
    expect(out.content.length).toBeLessThan(102 + 200);
  });

  it("leaves a result exactly at the limit whole", async () => {
    const run = bindTools(async () => "x".repeat(8), new Set(["list"]), 10);
    expect((await run("list", {})).content).toBe('"' + "x".repeat(8) + '"');
  });

  it("answers an undefined result with null rather than undefined text", async () => {
    const run = bindTools(async () => undefined, new Set(["list"]));
    expect(await run("list", {})).toEqual({ content: "null", isError: false });
  });
});

describe("SOLO_TABLE_TOOLS", () => {
  it("holds no tool that writes, so a solo table cannot change the campaign", () => {
    expect(SOLO_TABLE_TOOLS.has("create")).toBe(false);
    expect(SOLO_TABLE_TOOLS.has("update")).toBe(false);
  });

  it("holds no file or account tool", () => {
    for (const name of ["get_image", "get_audio", "whoami", "list_campaigns", "soundboard", "voice_coach"]) {
      expect(SOLO_TABLE_TOOLS.has(name)).toBe(false);
    }
  });

  it("names only tools the MCP layer really has, so a rename cannot silently shrink the table's hands", () => {
    const real = new Set(listTools().map((t) => t.name));
    for (const name of SOLO_TABLE_TOOLS) expect(real.has(name)).toBe(true);
    expect(agentToolsFrom(listTools(), SOLO_TABLE_TOOLS).map((t) => t.name).sort()).toEqual([...SOLO_TABLE_TOOLS].sort());
  });
  it("fails if the model can point a tool at another campaign: a pinned argument wins over what the model wrote", async () => {
    const seen: Record<string, unknown>[] = [];
    const tool = bindTools(async (_name, args) => { seen.push(args); return { ok: true }; }, new Set(["list"]), undefined, { campaign_id: "this-campaign" });
    await tool("list", { type: "npc", campaign_id: "another-campaign" });
    await tool("list", { type: "npc" });
    expect(seen).toEqual([
      { type: "npc", campaign_id: "this-campaign" },
      { type: "npc", campaign_id: "this-campaign" },
    ]);
  });
});

describe("bindTools with the table's type fence (#1226)", () => {
  const fence = { refused: TABLE_REFUSED_TYPES, allTypes: ENTITY_TYPES };
  const allow = new Set(["search", "get", "list"]);

  it("refuses get and list of every canon type and never calls the reader", async () => {
    const call = vi.fn(async () => ({ title: "the Stain's maker" }));
    const run = bindTools(call, allow, undefined, {}, fence);
    for (const type of TABLE_REFUSED_TYPES) {
      expect((await run("get", { type, id: "x" })).isError).toBe(true);
      expect((await run("list", { type })).isError).toBe(true);
    }
    expect(call).not.toHaveBeenCalled();
  });

  it("lets a type that is not canon through", async () => {
    const call = vi.fn(async () => ({ name: "Harl" }));
    const out = await bindTools(call, allow, undefined, {}, fence)("get", { type: "npc", id: "x" });
    expect(out.isError).toBe(false);
    expect(call).toHaveBeenCalledWith("get", { type: "npc", id: "x" });
  });

  it("searches every type but the canon ones when no types are named", async () => {
    const call = vi.fn(async () => ({ hits: [] }));
    await bindTools(call, allow, undefined, {}, fence)("search", { query: "stain" });
    const types = (call.mock.calls[0] as unknown as [string, { types: string[] }])[1].types;
    expect(types).toContain("npc");
    for (const refused of TABLE_REFUSED_TYPES) expect(types).not.toContain(refused);
  });

  it("drops canon types a search names and refuses a search that names only canon", async () => {
    const call = vi.fn(async () => ({ hits: [] }));
    const run = bindTools(call, allow, undefined, {}, fence);
    await run("search", { query: "stain", types: ["npc", "canon_clue"] });
    expect((call.mock.calls[0] as unknown as [string, { types: string[] }])[1].types).toEqual(["npc"]);
    expect((await run("search", { query: "stain", types: ["canon"] })).isError).toBe(true);
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("holds the registry's canon types equal to the refused set", () => {
    expect(ENTITY_TYPES.filter((t) => t.startsWith("canon")).sort()).toEqual([...TABLE_REFUSED_TYPES].sort());
  });
});

describe("the table's tool schemas (#1226)", () => {
  it("never offer a canon type in any enum, or the model is invited to ask for what the fence refuses", () => {
    const shown = JSON.stringify(agentToolsFrom(listTools(), SOLO_TABLE_TOOLS, TABLE_REFUSED_TYPES).map((t) => t.inputSchema));
    for (const type of TABLE_REFUSED_TYPES) expect(shown).not.toContain(`"${type}"`);
    expect(shown).toContain('"npc"');
  });

  it("leave the other types as they were", () => {
    const search = agentToolsFrom(listTools(), SOLO_TABLE_TOOLS, TABLE_REFUSED_TYPES).find((t) => t.name === "search")!;
    const items = ((search.inputSchema.properties as Record<string, { items: { enum: string[] } }>).types).items.enum;
    expect(items).toEqual(ENTITY_TYPES.filter((t) => !TABLE_REFUSED_TYPES.has(t)));
  });
});

/** Tools only the table has (its own writes and its narrator's voice), by the names the model is shown. */
const TABLE_ONLY_TOOLS = [
  "go_to", "record", "hazard", "roll_table", "introduce", "canon_lookup", "start_fight", "fight_change", "speak", "act",
  "pass_days", "hand_over", "hit_points", "travel", "show", "quest_route", "pressure", "keep_talking",
];

describe("ASK_TOOLS and the table's tools are two configurations that never share a tool (#1253)", () => {
  it("holds exactly the four readers: no roll, no create or update, no table tool", () => {
    expect([...ASK_TOOLS].sort()).toEqual(["campaign_overview", "get", "list", "search"]);
    for (const name of ["roll", "create", "update", ...TABLE_ONLY_TOOLS]) expect(ASK_TOOLS.has(name)).toBe(false);
  });

  it("names only tools the MCP layer really has, so a rename cannot silently shrink Ask's hands", () => {
    const real = new Set(listTools().map((t) => t.name));
    for (const name of ASK_TOOLS) expect(real.has(name)).toBe(true);
    expect(agentToolsFrom(listTools(), ASK_TOOLS).map((t) => t.name).sort()).toEqual([...ASK_TOOLS].sort());
  });

  it("gives the table none of Ask's own tools, and gives Ask's own tools no MCP name", () => {
    for (const name of ASK_OWN_TOOLS) expect(SOLO_TABLE_TOOLS.has(name)).toBe(false);
    for (const name of ASK_OWN_TOOLS) expect(ASK_TOOLS.has(name)).toBe(false);
    expect([...ASK_OWN_TOOLS].sort()).toEqual(["ask_choice", "find", "offer_ideas", "propose"]);
  });

  it("refuses, without calling anything, every tool that belongs to the other configuration", async () => {
    const call = vi.fn(async () => ({ ok: true }));
    const asTable = bindTools(call, SOLO_TABLE_TOOLS);
    for (const name of ASK_OWN_TOOLS) expect((await asTable(name, {})).isError).toBe(true);
    const asAsk = bindTools(call, ASK_TOOLS);
    for (const name of ["roll", "create", "update", ...TABLE_ONLY_TOOLS]) expect((await asAsk(name, {})).isError).toBe(true);
    expect(call).not.toHaveBeenCalled();
  });

  it("lets Ask read canon, which the table's fence refuses: the DM is the audience", async () => {
    const call = vi.fn(async () => ({ title: "the Stain's maker" }));
    expect((await bindTools(call, ASK_TOOLS)("get", { type: "canon", id: "x" })).isError).toBe(false);
    expect((await bindTools(call, SOLO_TABLE_TOOLS, undefined, {}, { refused: TABLE_REFUSED_TYPES, allTypes: ENTITY_TYPES })("get", { type: "canon", id: "x" })).isError).toBe(true);
  });
});
