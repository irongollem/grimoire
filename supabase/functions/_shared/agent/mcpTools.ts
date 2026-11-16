// The MCP tools as the agent's tools (#1205). The MCP layer already reads and rolls; the agent reuses it rather
// than growing a second set. Pure: this takes the tool list and an already-bound call, never a database client.

import type { AgentTool, CallTool } from "./types.ts";

interface McpToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/**
 * What a Dungeon Master at a solo table needs to READ the world and to ROLL. Writes (`create`, `update`) and the
 * rest come in a later story. `get_image` and `get_audio` return files the table cannot read; `whoami` and
 * `list_campaigns` are about the account, not the table; `voice_coach` spends credits on another AI call.
 */
export const SOLO_TABLE_TOOLS: ReadonlySet<string> = new Set(["roll", "search", "get", "list", "campaign_overview"]);

/** Only tools on the allow list are offered. */
export function agentToolsFrom(mcpTools: McpToolDef[], allow: ReadonlySet<string>): AgentTool[] {
  return mcpTools
    .filter((t) => allow.has(t.name))
    .map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema }));
}

const DEFAULT_MAX_RESULT_CHARS = 20_000;

function hasFileContent(x: unknown): boolean {
  return typeof x === "object" && x !== null && Array.isArray((x as { _mcpContent?: unknown })._mcpContent);
}

/**
 * Runs a tool through `call`, but only when it is on the allow list: the list is the security boundary, so a model
 * naming anything else gets an error result and the function is never invoked.
 */
export function bindTools(
  call: (name: string, args: Record<string, unknown>) => Promise<unknown>,
  allow: ReadonlySet<string>,
  maxResultChars: number = DEFAULT_MAX_RESULT_CHARS,
): CallTool {
  return async (name, input) => {
    if (!allow.has(name)) return { content: `No such tool: ${name}`, isError: true };
    let result: unknown;
    try {
      result = await call(name, input);
    } catch (error) {
      return { content: error instanceof Error ? error.message : String(error), isError: true };
    }
    if (hasFileContent(result)) {
      return { content: "This tool returns a file the table cannot read.", isError: true };
    }
    // JSON.stringify gives undefined for undefined and throws on cycles or BigInt; a tool that did either failed.
    let json: string | undefined;
    try {
      json = JSON.stringify(result);
    } catch {
      return { content: "The tool's answer could not be read.", isError: true };
    }
    const content = json ?? "null";
    if (content.length > maxResultChars) {
      return {
        content: `${content.slice(0, maxResultChars)}\n[Cut: this answer was ${content.length} characters long and only the first ${maxResultChars} are shown. Ask for fewer rows or a narrower search.]`,
        isError: false,
      };
    }
    return { content, isError: false };
  };
}
