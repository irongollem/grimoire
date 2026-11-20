// The record of a campaign's story, as the narrator uses it (#1021). Pure: no I/O.
//
// AI narrators forget (maintainer, 16 Nov 2026: "long running quests shouldnt be a reason to start forgetting
// things"), and a session note is written to be told, not to be right. So what becomes true in play is filed as one
// plain sentence, tied to what it is about, and found again by those ties (`story_facts`, `story_fact_links`).
// Facts are overtaken, never rewritten: a later fact `closes` an earlier one. A fact the player has not learned yet
// is marked hidden, and the narrator is told to keep it that way until it comes out in play.

import type { AgentTool, ToolAnswer } from "./types.ts";
import { UUID_RE } from "./parse.ts";

export const RECORD_KINDS = ["npc", "location", "quest", "quest_beat", "item", "monster"] as const;
export type RecordKind = (typeof RECORD_KINDS)[number];

export const FACT_MAX_CHARS = 300;
export const ABOUT_MAX = 8;
/** What a turn puts in front of the narrator; a record that fills the system text costs on every turn. */
export const RECORD_SECTION_MAX = 30;

export const RECORD_TOOL_NAME = "record";

export const RECORD_TOOL: AgentTool = {
  name: RECORD_TOOL_NAME,
  description:
    "Puts a fact on the record of this campaign. File one the moment something becomes true or stops being true: " +
    "what was found, given, taken, promised, owed, decided, destroyed or learned, and who went where. Write one " +
    "plain sentence with names, never pronouns, and no drama. Tie it to everyone and everything it is about, by " +
    "type and id (people, places, quests, quest beats, items, monsters). When it ends or changes an earlier fact " +
    "listed under \"On record\", pass that fact's id as closes. Do not file what a character privately thinks or " +
    "feels: that is the character's own memory. Small talk and description are not facts.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      fact: { type: "string", maxLength: FACT_MAX_CHARS, description: "One plain sentence, with names." },
      about: {
        type: "array",
        maxItems: ABOUT_MAX,
        description: "What the fact is about, so it is found again when they come up.",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            type: { type: "string", enum: [...RECORD_KINDS] },
            id: { type: "string", description: "The id of that person, place, quest, beat, item or monster." },
          },
          required: ["type", "id"],
        },
      },
      hidden: { type: "boolean", description: "True when the player's character has not learned this yet." },
      closes: { type: "string", description: "The id of an earlier fact on record that this one replaces or ends." },
    },
    required: ["fact"],
  },
};


export interface RecordInput {
  fact: string;
  about: { type: RecordKind; id: string }[];
  hidden: boolean;
  closes: string | null;
}

export function parseRecordInput(input: Record<string, unknown>): { ok: true; value: RecordInput } | { ok: false; error: string } {
  const fact = input.fact;
  if (typeof fact !== "string" || fact.trim() === "") return { ok: false, error: "fact is required: one plain sentence of what became true." };
  const body = fact.trim();
  if (body.length > FACT_MAX_CHARS) {
    return { ok: false, error: `fact is ${body.length} characters; keep it to one sentence of at most ${FACT_MAX_CHARS}.` };
  }

  const about: RecordInput["about"] = [];
  if (input.about !== undefined) {
    if (!Array.isArray(input.about)) return { ok: false, error: "about must be a list of { type, id } entries." };
    if (input.about.length > ABOUT_MAX) return { ok: false, error: `about holds at most ${ABOUT_MAX} entries; keep the ones that matter most.` };
    const seen = new Set<string>();
    for (const entry of input.about as unknown[]) {
      const e = typeof entry === "object" && entry !== null ? (entry as Record<string, unknown>) : null;
      const type = e?.type;
      if (typeof type !== "string" || !(RECORD_KINDS as readonly string[]).includes(type)) {
        return { ok: false, error: `Every about entry needs a type, one of: ${RECORD_KINDS.join(", ")}.` };
      }
      const id = e?.id;
      if (typeof id !== "string" || !UUID_RE.test(id.trim())) {
        return { ok: false, error: "Every about entry needs the uuid of what it is about. Search for it to find its id." };
      }
      const key = `${type}:${id.trim().toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      about.push({ type: type as RecordKind, id: id.trim().toLowerCase() });
    }
  }

  if (input.hidden !== undefined && typeof input.hidden !== "boolean") {
    return { ok: false, error: "hidden must be true or false." };
  }

  let closes: string | null = null;
  if (input.closes !== undefined && input.closes !== null) {
    if (typeof input.closes !== "string" || !UUID_RE.test(input.closes.trim())) {
      return { ok: false, error: "closes must be the id of an earlier fact listed under \"On record\"." };
    }
    closes = input.closes.trim().toLowerCase();
  }

  return { ok: true, value: { fact: body, about, hidden: input.hidden === true, closes } };
}

/** A fact as the narrator reads it. `when` is a short label such as "Session 3". */
export interface RecordedFact {
  id: string;
  body: string;
  hidden: boolean;
  when: string | null;
}

const HEADING = "## On record";

/** The block of the system text that holds what is true here and about these people, oldest first. */
export function recordSection(facts: RecordedFact[]): string {
  if (facts.length === 0) return `${HEADING}\n\nNothing is on record yet for this place and these people.`;
  const shown = facts.slice(-RECORD_SECTION_MAX);
  const cut = facts.length - shown.length;
  const lines = [
    HEADING,
    "",
    "These are true. Never contradict one. A fact marked hidden is not yet known to the player: do not tell it " +
      "until it comes out in play. To change or end one, file a new fact with closes set to its id.",
    "",
  ];
  if (cut > 0) lines.push(`(${cut} older ${cut === 1 ? "fact is" : "facts are"} not shown.)`);
  for (const f of shown) {
    lines.push(`- ${f.id}${f.when ? ` (${f.when})` : ""}${f.hidden ? " [hidden from the player]" : ""}: ${f.body}`);
  }
  return lines.join("\n");
}

/** What the tool answers on success: the id, so the narrator can close this fact later. */
export function recordResult(id: string): string {
  // Said at the moment it matters: the narrator filed fact after fact about a person it had made up and never gave
  // them a record, whatever its standing rules said.
  return JSON.stringify({
    filed: true,
    id,
    next: "If this fact names a person you made up who has no record of their own, call introduce for them now.",
  });
}

export interface RecordToolDeps {
  /** Writes the fact and its ties; `{ error }` is a sentence the narrator can act on. */
  fileFact(input: RecordInput): Promise<{ id: string } | { error: string }>;
  /**
   * Holds an invention against the canon before it is filed (#1226): `{ error }` is the reason it is refused, in words
   * the narrator can act on, and nothing is filed. Only the narrator's own `record` calls come through here; a fact the
   * server writes itself (a fight's result, a harvest) never does. A check that throws files the fact unchecked.
   */
  check?(input: RecordInput): Promise<{ error: string } | null>;
  /** Told once per fact that was filed. */
  onFiled?(fact: { id: string; body: string; hidden: boolean }): void;
}

/** The `record` tool bound to one turn. Nothing the model writes decides the campaign or the session: `fileFact` has those. */
export function makeRecordTool(deps: RecordToolDeps): { tool: AgentTool; call: (input: Record<string, unknown>) => Promise<ToolAnswer> } {
  return {
    tool: RECORD_TOOL,
    call: async (input) => {
      const parsed = parseRecordInput(input);
      if (!parsed.ok) return { content: parsed.error, isError: true };
      if (deps.check !== undefined) {
        let refused: { error: string } | null = null;
        try {
          refused = await deps.check(parsed.value);
        } catch (error) {
          console.error("agent-turn: the canon check failed, so the fact was filed unchecked:", error);
        }
        if (refused !== null) return { content: refused.error, isError: true };
      }
      const filed = await deps.fileFact(parsed.value);
      if ("error" in filed) return { content: filed.error, isError: true };
      deps.onFiled?.({ id: filed.id, body: parsed.value.fact, hidden: parsed.value.hidden });
      return { content: recordResult(filed.id), isError: false };
    },
  };
}
