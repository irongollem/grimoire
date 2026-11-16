import { describe, expect, it, vi } from "vitest";
import { listTools } from "../mcp/tools";
import { agentToolsFrom, bindTools, SOLO_TABLE_TOOLS } from "./mcpTools";

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
});
