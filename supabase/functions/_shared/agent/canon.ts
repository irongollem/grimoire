// The campaign's canon, as the AI table's Narrator reads it (#1226 story 9, frame 09 "The Narrator"). Pure: no I/O.
//
// What the Narrator carries every turn is the world block (premise, tone, lines and veils, the truths everyone knows),
// in the standing instructions. What it looks up is the rest of the canon, by meaning (`canon_lookup`). What it is
// shown where the party stands is "Canon here": the clues placed here (the clue's line, never the secret it points
// at), the lore that may come out here, what the people present know and may say, the questions nobody settles, and
// the forces that moved here. What it is never given is a secret's statement: that goes to the judge alone (the three
// checks, `canonCheck.ts`), and the generic readers refuse every canon type (`mcpTools.ts`).
//
// Two things it writes back, and nothing else of the canon: `bring_out` ticks a clue found or a passage told, and
// the invention rule files facts as before. Never a clock, a reveal or a truth.

import { tiptapToPlainText } from "../../../../src/lib/tiptap/tiptapText.ts";
import { ABSOLUTE_CEILING, RELATIVE_MARGIN } from "../campaignSearch.ts";
import { UUID_RE } from "./parse.ts";
import type { AgentTool, ToolAnswer } from "./types.ts";

/** Every list in "Canon here" has a ceiling: the section is read on every turn. */
export const CANON_LIST_MAX = 8;
/** A lore passage's text, as it is put in front of the Narrator. */
export const PASSAGE_TEXT_MAX = 500;
/** What one entry says in a lookup answer. */
export const LOOKUP_ENTRY_CHARS = 700;
/** Entries a lookup answers with. */
export const LOOKUP_HITS_MAX = 5;
/** Lookups in one turn: each costs an embedding. */
export const LOOKUPS_PER_TURN = 4;
/** The last sitting's chronicle entry, as it is put in the standing instructions. */
export const PREVIOUSLY_MAX = 600;

/** The parts the Narrator may look up. Never `secret`: it gets a secret's clues where the party stands, never its statement. */
export const LOOKUP_PARTS = ["truth", "force", "question", "lore", "premise"] as const;

export function plain(text: string | null | undefined, max: number): string {
  const flat = tiptapToPlainText(text).replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`;
}

// ── Previously ────────────────────────────────────────────────────────────────────────────────────────────────

/** Removes every `secretBlock` node, at any depth, as `private.withhold_secret_blocks` does for a player's copy. */
function withoutSecretBlocks(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(withoutSecretBlocks).filter((n) => n !== null);
  if (typeof node !== "object" || node === null) return node;
  const record = node as Record<string, unknown>;
  if (record.type === "secretBlock") return null;
  if (Array.isArray(record.content)) return { ...record, content: withoutSecretBlocks(record.content) };
  return record;
}

/**
 * A short plain excerpt of a chronicle entry (a note linked to a session): what the party knows happened, never a
 * DM-only passage. A value that is not a Tiptap document is plain text and has no secret blocks to strip.
 */
export function chronicleExcerpt(content: string | null, max: number = PREVIOUSLY_MAX): string {
  if (content === null || content.trim() === "") return "";
  let text = content;
  try {
    const doc: unknown = JSON.parse(content);
    if (typeof doc === "object" && doc !== null) text = JSON.stringify(withoutSecretBlocks(doc));
  } catch {
    // Legacy plain text.
  }
  return plain(text, max);
}

/** The standing "Previously" block; empty with no earlier sitting. */
export function previouslySection(excerpt: string): string {
  if (excerpt.trim() === "") return "";
  return `## Previously\n\nThe last sitting, as its chronicle tells it: ${excerpt}`;
}

// ── Canon here ─────────────────────────────────────────────────────────────────────────────────────────────────

export interface CanonHere {
  /** Clues not yet found that lie here or on someone present. `secretId` is for the checks and is never worded. */
  clues: { id: string; secretId: string; line: string }[];
  /** Lore passages not yet told that come out here or through someone present. */
  passages: { id: string; title: string; text: string }[];
  /** Truths only some know: who present may say them. */
  knows: { who: string[]; truth: string }[];
  /** The questions nobody settles (titles). */
  questions: string[];
  /** Forces that moved here, with the latest step they reached. */
  forces: { title: string; step: string | null }[];
}

export const NO_CANON_HERE: CanonHere = { clues: [], passages: [], knows: [], questions: [], forces: [] };

/** What a loader's rows become: every list capped, text flattened. */
export function capCanonHere(here: CanonHere): CanonHere {
  return {
    clues: here.clues.slice(0, CANON_LIST_MAX),
    passages: here.passages.slice(0, CANON_LIST_MAX).map((p) => ({ ...p, text: plain(p.text, PASSAGE_TEXT_MAX) })),
    knows: here.knows.slice(0, CANON_LIST_MAX),
    questions: here.questions.slice(0, CANON_LIST_MAX * 2),
    forces: here.forces.slice(0, CANON_LIST_MAX),
  };
}

export const CANON_HERE_HEADING = "## Canon here";

/** The state block for the party's place; empty when the canon has nothing to say here. */
export function canonHereSection(here: CanonHere): string {
  const parts: string[] = [];
  if (here.clues.length > 0) {
    parts.push(
      [
        "Clues here: hint at them through the scene, never state what they point to. When one comes out in play, call bring_out with its id.",
        ...here.clues.map((c) => `- ${c.id}: ${c.line}`),
      ].join("\n"),
    );
  }
  if (here.passages.length > 0) {
    parts.push(
      [
        "Lore that may come out here: tell it in your own words when the story reaches it, and call bring_out with its id when you do.",
        ...here.passages.map((p) => `- ${p.id} (${p.title}): ${p.text}`),
      ].join("\n"),
    );
  }
  if (here.knows.length > 0) {
    parts.push(
      [
        "Who may say what: a truth only some know may be said by them and by nobody else.",
        ...here.knows.map((k) => `- ${k.who.join(" and ")} may say: ${k.truth}`),
      ].join("\n"),
    );
  }
  if (here.questions.length > 0) {
    parts.push(["Kept open: nobody settles these, not even by a hint.", ...here.questions.map((q) => `- ${q}`)].join("\n"));
  }
  if (here.forces.length > 0) {
    parts.push(
      ["Forces that moved here:", ...here.forces.map((f) => `- ${f.title}${f.step === null ? "" : `: ${f.step}`}`)].join("\n"),
    );
  }
  return parts.length === 0 ? "" : [CANON_HERE_HEADING, ...parts].join("\n\n");
}

/**
 * The standing words about the canon, in the instructions beside the world block: constant for a campaign, so the
 * prompt cache keeps it. The Narrator is told what it may ask for and what refuses it, never anything of a secret.
 */
export const CANON_GUIDE =
  "The campaign keeps a canon beyond what is written above: lore, forces at work, truths only some people know, and " +
  "questions it leaves open on purpose. Look it up with canon_lookup before you invent anything about the world's " +
  "past, its powers or its magic. \"Canon here\", in the state of the table, lists the clues and the lore that may " +
  "come out where the party stands: hint at a clue through the scene and never state what it points to, and " +
  "call bring_out when one has come out. Never answer a question listed as kept open, not even by a hint. When you " +
  "put an invention on record it is held against the canon: one that contradicts a truth, answers an open question " +
  "or states a secret is refused with its reason and nothing is filed, so rephrase it and record it again in the same reply.";

// ── bring_out ──────────────────────────────────────────────────────────────────────────────────────────────────

export const BRING_OUT_TOOL_NAME = "bring_out";

export const BRING_OUT_TOOL: AgentTool = {
  name: BRING_OUT_TOOL_NAME,
  description:
    "Records that a clue or a lore passage listed under \"Canon here\" came out in play: the party found the clue, or " +
    "you told the passage. Give clue_id or passage_id, taken from that list, and only once it has really been put in " +
    "front of the player in this reply. It marks nothing else: it never reveals a secret, never moves a clock.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      clue_id: { type: "string", description: "The id of a clue under \"Clues here\"." },
      passage_id: { type: "string", description: "The id of a passage under \"Lore that may come out here\"." },
    },
  },
};

export type BroughtOut = { kind: "clue"; id: string } | { kind: "passage"; id: string };

/** The `bring_out` tool bound to one turn. It accepts only an id this turn's "Canon here" offered. */
export function makeBringOutTool(deps: {
  /** What this turn's "Canon here" offers at the party's place right now: nothing once the party has moved on. */
  offered: () => CanonHere;
  onBroughtOut(brought: BroughtOut): void;
}): { tool: AgentTool; call: (input: Record<string, unknown>) => Promise<ToolAnswer> } {
  const done = new Set<string>();
  return {
    tool: BRING_OUT_TOOL,
    call: async (input) => {
      const clue = input.clue_id;
      const passage = input.passage_id;
      if ((clue === undefined) === (passage === undefined)) {
        return { content: "Give clue_id or passage_id, one of them.", isError: true };
      }
      const raw = clue ?? passage;
      if (typeof raw !== "string" || !UUID_RE.test(raw.trim())) {
        return { content: "That is not an id. Use one listed under \"Canon here\".", isError: true };
      }
      const id = raw.trim().toLowerCase();
      const isClue = clue !== undefined;
      const here = deps.offered();
      const offered = isClue
        ? here.clues.some((c) => c.id.toLowerCase() === id)
        : here.passages.some((p) => p.id.toLowerCase() === id);
      if (!offered) {
        return { content: "That is not listed under \"Canon here\" for this place, so nothing was marked.", isError: true };
      }
      if (done.has(id)) return { content: "That was already marked this turn.", isError: true };
      done.add(id);
      deps.onBroughtOut(isClue ? { kind: "clue", id } : { kind: "passage", id });
      return { content: isClue ? "Marked: the party found that clue." : "Marked: that lore was told.", isError: false };
    },
  };
}

// ── canon_lookup ───────────────────────────────────────────────────────────────────────────────────────────────

export const CANON_LOOKUP_TOOL_NAME = "canon_lookup";

export const CANON_LOOKUP_TOOL: AgentTool = {
  name: CANON_LOOKUP_TOOL_NAME,
  description:
    "Looks up the campaign's own canon by meaning: its lore, its forces, the truths only some know (with who knows " +
    "them) and the questions it keeps open. Ask in a few words what you need to know, such as \"what does the river " +
    "give back\" or \"who runs the ferry\". Use it before you invent anything about the world's past, its powers or " +
    "its magic. Secrets are never in it.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: { query: { type: "string", maxLength: 200, description: "What you want to know, in a few words." } },
    required: ["query"],
  },
};

/** What the database's nearest-entries function answers with. */
export interface CanonMatch {
  id: string;
  part: string;
  knowledge: string | null;
  title: string;
  distance: number;
}

/**
 * The matches the Narrator may read: nothing of a secret (the caller asks for no such part, and this drops one
 * anyway, and a truth marked secret), and only those near enough, by the same cut the DM's own search uses.
 */
export function readableMatches(matches: readonly CanonMatch[]): CanonMatch[] {
  const allowed = matches.filter((m) => (LOOKUP_PARTS as readonly string[]).includes(m.part) && !(m.part === "truth" && m.knowledge === "secret"));
  if (allowed.length === 0) return [];
  const best = Math.min(...allowed.map((m) => m.distance));
  const cut = Math.min(best + RELATIVE_MARGIN, ABSOLUTE_CEILING);
  return allowed
    .filter((m) => m.distance <= cut)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, LOOKUP_HITS_MAX);
}

/** One entry as a lookup answers with it. */
export interface CanonLookupEntry {
  part: string;
  title: string;
  /** The entry's text, and for lore every passage's. */
  text: string;
  /** Who knows a truth only some know; empty for everything else. */
  knownTo: string[];
  /** The latest step a force has reached. */
  step: string | null;
}

export function lookupAnswer(entries: readonly CanonLookupEntry[]): string {
  if (entries.length === 0) return "The canon says nothing about that. It is yours to invent, within what is on record.";
  return entries
    .map((e) => {
      const label =
        e.part === "truth" ? (e.knownTo.length > 0 ? `Truth, known only to ${e.knownTo.join(", ")}: nobody else may say it` : "Truth known to all")
          : e.part === "question" ? "Open question: nobody settles it"
            : e.part === "force" ? "Force"
              : e.part === "lore" ? "Lore"
                : "Premise";
      const lines = [`## ${e.title} (${label})`];
      if (e.text !== "") lines.push(plain(e.text, LOOKUP_ENTRY_CHARS));
      if (e.step !== null) lines.push(`Latest step: ${e.step}`);
      return lines.join("\n");
    })
    .join("\n\n");
}

/** One lookup a turn at a time is bounded by count; the query is only ever text. */
export function parseLookupQuery(input: Record<string, unknown>): { ok: true; query: string } | { ok: false; error: string } {
  const query = input.query;
  if (typeof query !== "string" || query.trim().length < 2) return { ok: false, error: "query is required: a few words about what you want to know." };
  return { ok: true, query: query.trim().slice(0, 200) };
}
