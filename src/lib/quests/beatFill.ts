import { tiptapToPlainText } from "@/lib/tiptap/tiptapText";
import type { Quest, QuestBeat, QuestObjective } from "@/types/quest.types";

/** The server's cap on a generator's constraint list (`generate-entity-text`). */
export const BEAT_FILL_MAX_LINES = 12;
export const BEAT_FILL_MAX_LINE_LENGTH = 400;
const NEIGHBOUR_CAP = 3;
const EXCERPT_LENGTH = 160;

export interface BeatFillContext {
  quest: Pick<Quest, "title" | "summary">;
  beat: Pick<QuestBeat, "kind" | "title" | "dm_content">;
  /** Beats with a route into this one. */
  incoming: Array<Pick<QuestBeat, "title" | "dm_content">>;
  /** Beats this one routes out to. */
  outgoing: Array<Pick<QuestBeat, "title" | "dm_content">>;
  objectives: Array<Pick<QuestObjective, "description" | "status">>;
  /** Name of the place the beat is staged at, if any. */
  stagedAt: string | null;
  /** The thread this beat sits on, when the quest runs more than one. */
  threadLabel: string | null;
}

export interface BeatFill {
  title: string;
  readAloud: string;
  dmContent: string;
}

function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`;
}

function excerpt(content: string | null): string {
  return clip(tiptapToPlainText(content), EXCERPT_LENGTH);
}

function neighbour(prefix: string, other: Pick<QuestBeat, "title" | "dm_content">): string {
  const lead = excerpt(other.dm_content);
  return clip(lead ? `${prefix}: ${other.title} — ${lead}` : `${prefix}: ${other.title}`, BEAT_FILL_MAX_LINE_LENGTH);
}

/**
 * One line per fact the model needs to continue the quest's flow: what the
 * quest is, what this beat is, and the beats on either side of it. Every line
 * is clipped to the server's per-line cap, and there are never more than the
 * server's line cap of them, because either overrun is a 400.
 */
export function buildBeatFillConstraints(context: BeatFillContext): string[] {
  const { quest, beat } = context;
  const lines: string[] = [];
  lines.push(`Quest: ${quest.title}${quest.summary ? ` — ${quest.summary}` : ""}`);

  const current = excerpt(beat.dm_content);
  lines.push(`This beat: ${beat.kind}${beat.title.trim() ? `, currently titled "${beat.title.trim()}"` : ""}${current ? `. Notes so far: ${current}` : ""}`);

  if (context.stagedAt) lines.push(`Staged at: ${context.stagedAt}`);
  if (context.threadLabel) lines.push(`Story thread: ${context.threadLabel}`);
  for (const other of context.incoming.slice(0, NEIGHBOUR_CAP)) lines.push(neighbour("Comes after", other));
  for (const other of context.outgoing.slice(0, NEIGHBOUR_CAP)) lines.push(neighbour("Leads to", other));

  const open = context.objectives.filter((objective) => objective.status === "dormant" || objective.status === "pending");
  if (open.length) lines.push(`Open objectives: ${open.map((objective) => objective.description).join("; ")}`);

  return lines.slice(0, BEAT_FILL_MAX_LINES).map((line) => clip(line, BEAT_FILL_MAX_LINE_LENGTH));
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * The model's output is untrusted. A fill is usable when it carries at least
 * the read-aloud or the DM lead; a title alone is not a fill.
 */
export function normalizeBeatFill(raw: unknown): BeatFill {
  if (!raw || typeof raw !== "object") throw new Error("The model returned nothing usable for this beat.");
  const record = raw as Record<string, unknown>;
  const fill: BeatFill = {
    title: text(record.title),
    readAloud: text(record.read_aloud),
    dmContent: text(record.dm_content),
  };
  if (!fill.readAloud && !fill.dmContent) throw new Error("The model returned no read-aloud or DM lead for this beat.");
  return fill;
}
