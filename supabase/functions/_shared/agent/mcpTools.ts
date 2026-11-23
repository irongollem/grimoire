// The MCP tools as the agent's tools (#1205). The MCP layer already reads and rolls; the agent reuses it rather
// than growing a second set. Pure: this takes the tool list and an already-bound call, never a database client.

import type { AgentTool, CallTool } from "./types.ts";

interface McpToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/**
 * What a Dungeon Master at a solo table needs to READ the world and to ROLL. The table never writes through these
 * tools (`create`, `update` and the rest are left out on purpose); its writes go through its own tools. `get_image` and `get_audio` return files the table cannot read; `whoami` and
 * `list_campaigns` are about the account, not the table; `voice_coach` spends credits on another AI call.
 */
export const SOLO_TABLE_TOOLS: ReadonlySet<string> = new Set(["roll", "search", "get", "list", "campaign_overview"]);

/**
 * What Ask Grimoire reads with (#1253): the same four readers, and nothing that rolls or writes. The DM is the audience,
 * so there is no canon fence (`TABLE_REFUSED_TYPES` is the table's, not Ask's): a DM may read their own prep and
 * secrets. Ask never writes through these; what it proposes the browser runs, after the DM confirms.
 */
export const ASK_TOOLS: ReadonlySet<string> = new Set(["search", "get", "list", "campaign_overview"]);

/** Ask's own tools, which are not MCP tools (`askTools.ts` answers them). Named here so the two families can be held apart by test. */
export const ASK_OWN_TOOLS: ReadonlySet<string> = new Set(["find", "ask_choice", "offer_ideas", "propose", "draft_report", "read_manual", "log_manual_gap"]);

/** The schema with every `enum` that lists a refused value cut down to the rest, at any depth. */
function withoutRefused(node: unknown, refused: ReadonlySet<string>): unknown {
  if (Array.isArray(node)) return node.map((n) => withoutRefused(n, refused));
  if (typeof node !== "object" || node === null) return node;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    out[key] = key === "enum" && Array.isArray(value)
      ? value.filter((v) => !(typeof v === "string" && refused.has(v)))
      : withoutRefused(value, refused);
  }
  return out;
}

/**
 * Only tools on the allow list are offered. `refused` types are cut from the enums of the schemas the model is
 * shown, so it is never offered a type the call-time fence (`bindTools`) would refuse; the fence stays the guard.
 */
export function agentToolsFrom(mcpTools: McpToolDef[], allow: ReadonlySet<string>, refused: ReadonlySet<string> = new Set()): AgentTool[] {
  return mcpTools
    .filter((t) => allow.has(t.name))
    .map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: refused.size === 0 ? t.inputSchema : (withoutRefused(t.inputSchema, refused) as Record<string, unknown>),
    }));
}

/**
 * The canon's own entity types (#1226). At the table the canon reaches the Narrator in two ways only: the lookup by
 * meaning, which never asks for a secret, and what lies where the party stands, which gives a secret's clues and never
 * its statement. The generic readers would hand it everything, a secret's statement and every clue included, so they
 * refuse these types here.
 */
export const TABLE_REFUSED_TYPES: ReadonlySet<string> = new Set(["canon", "canon_clue", "canon_force_step"]);

/** What `bindTools` keeps the generic readers from: the types they refuse, and every type they could otherwise search. */
export interface TypeFence {
  refused: ReadonlySet<string>;
  /** `search` with no `types` reads all of them: the fence names the rest so the refused ones are never asked for. */
  allTypes: readonly string[];
}

const READERS = new Set(["search", "get", "list"]);

const REFUSED_TYPE_TEXT = "That is the DM's own canon, which the table reads only through canon_lookup and what lies where the party stands.";

/** The arguments a reader may run with, or the sentence that refuses it. */
function fenced(name: string, input: Record<string, unknown>, fence: TypeFence): { args: Record<string, unknown> } | { refusal: string } {
  if (!READERS.has(name)) return { args: input };
  if (name === "search") {
    const asked = Array.isArray(input.types) && input.types.length > 0 ? (input.types as unknown[]) : null;
    if (asked !== null) {
      const kept = asked.filter((t) => !(typeof t === "string" && fence.refused.has(t)));
      if (kept.length === 0) return { refusal: REFUSED_TYPE_TEXT };
      return { args: { ...input, types: kept } };
    }
    return { args: { ...input, types: fence.allTypes.filter((t) => !fence.refused.has(t)) } };
  }
  // get and list name one type; anything that is not a plain string cannot be one of ours, and the tool refuses it.
  if (typeof input.type === "string" && fence.refused.has(input.type)) return { refusal: REFUSED_TYPE_TEXT };
  return { args: input };
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
  pinned: Readonly<Record<string, unknown>> = {},
  fence?: TypeFence,
): CallTool {
  return async (name, input) => {
    if (!allow.has(name)) return { content: `No such tool: ${name}`, isError: true };
    let args = input;
    if (fence !== undefined) {
      const checked = fenced(name, input, fence);
      if ("refusal" in checked) return { content: checked.refusal, isError: true };
      args = checked.args;
    }
    let result: unknown;
    try {
      // Pinned arguments win over whatever the model wrote. The tools run with the caller's own access, which
      // covers every campaign they run, so a conversation in one campaign must not be talked into reading another:
      // the turn function pins `campaign_id` to the conversation's campaign.
      result = await call(name, { ...args, ...pinned });
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
