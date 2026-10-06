import type { CampaignSession } from "@/types/session.types";

/**
 * What the party learned (#985): every moment the DM shared or the table
 * discovered, shaped for the session page and the "learned outside any
 * session" list. Pure; the rows are read in `useSessionLearned`.
 */
/** The query-key root of every learned-moment read; the campaign channel invalidates it. */
export const SESSION_LEARNED_KEY = "session-learned";

export type LearnedKind = "person" | "place" | "handout" | "creature" | "quest" | "combat";

/** The tables a learned moment lives in, and the one column set that names a row. */
export type LearnedTable =
  | "npc_reveals"
  | "location_reveals"
  | "handout_reveals"
  | "discovered_monsters"
  | "quest_beat_transitions";

/** One underlying row: the table and the columns that pick it out. */
export interface LearnedRecordRef {
  table: LearnedTable;
  match: Readonly<Record<string, string>>;
}

export interface LearnedEntry {
  kind: LearnedKind;
  /** Stable per entry: kind, entity and session. */
  key: string;
  entityId: string;
  name: string;
  /** Who learned it, or the quest steps (one per line). */
  detail: string;
  /** The earliest moment among the rows. */
  whenIso: string;
  approximate: boolean;
  sessionId: string | null;
  /** The rows to update when the entry moves. Empty for read-only combat. */
  recordRefs: LearnedRecordRef[];
}

/** The order the kinds are listed in, and what each is called. */
export const LEARNED_KINDS: readonly { kind: LearnedKind; label: string }[] = [
  { kind: "person", label: "People met" },
  { kind: "place", label: "Places" },
  { kind: "handout", label: "Handouts" },
  { kind: "creature", label: "Creatures discovered" },
  { kind: "quest", label: "Quests" },
  { kind: "combat", label: "Combat" },
];

export function learnedKindLabel(kind: LearnedKind): string {
  return LEARNED_KINDS.find((k) => k.kind === kind)?.label ?? kind;
}

/** One per-character record, from npc_reveals / location_reveals / handout_reveals. */
export interface RevealRow {
  entityId: string;
  name: string;
  partyMemberId: string;
  revealedAt: string;
  approximate: boolean;
  sessionId: string | null;
}

export interface PartyName {
  id: string;
  name: string;
}

export interface RevealSource {
  kind: "person" | "place" | "handout";
  table: "npc_reveals" | "location_reveals" | "handout_reveals";
  entityColumn: "npc_id" | "location_id" | "document_id";
}

/** "Wren", "Wren and Brakka", "Wren, Brakka and Thessaly". */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * Who a set of party members is, as a sentence: everyone is "The whole party".
 * Members no longer in the party are dropped; with none left, nobody is named.
 */
export function audienceLabel(memberIds: readonly string[], party: readonly PartyName[]): string {
  const wanted = new Set(memberIds);
  const present = party.filter((m) => wanted.has(m.id));
  if (present.length === 0) return "";
  if (party.length > 0 && present.length === party.length) return "The whole party";
  return joinNames(present.map((m) => m.name));
}

/**
 * One entry per entity and session from the per-character rows, so three
 * characters who met the same NPC in one evening read as one line.
 */
export function groupPerCharacter(
  rows: readonly RevealRow[],
  party: readonly PartyName[],
  source: RevealSource,
): LearnedEntry[] {
  const groups = new Map<string, RevealRow[]>();
  for (const row of rows) {
    const key = `${row.entityId}|${row.sessionId ?? ""}`;
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  }
  const entries: LearnedEntry[] = [];
  for (const group of groups.values()) {
    const sorted = [...group].sort((a, b) => Date.parse(a.revealedAt) - Date.parse(b.revealedAt));
    const first = sorted[0];
    if (!first) continue;
    entries.push({
      kind: source.kind,
      key: `${source.kind}:${first.entityId}:${first.sessionId ?? "none"}`,
      entityId: first.entityId,
      name: first.name,
      detail: audienceLabel(
        sorted.map((r) => r.partyMemberId),
        party,
      ),
      whenIso: first.revealedAt,
      approximate: first.approximate,
      sessionId: first.sessionId,
      recordRefs: sorted.map((r) => ({
        table: source.table,
        match: { [source.entityColumn]: r.entityId, party_member_id: r.partyMemberId },
      })),
    });
  }
  return entries;
}

/** A transition kind, as the step reads in a quest's line. */
const STEP_VERBS: Readonly<Record<string, string>> = {
  enter: "Began",
  forward: "Advanced",
  previous: "Went back to",
  jump: "Jumped to",
  return: "Returned to",
  improv: "Improvised",
  pause: "Paused at",
  resume: "Resumed at",
  end: "Ended at",
};

export function questStepLine(transitionKind: string, beatTitle: string | null): string {
  const verb = STEP_VERBS[transitionKind] ?? "Moved to";
  const beat = beatTitle?.trim();
  return beat ? `${verb} · ${beat}` : verb;
}

export interface QuestStepRow {
  id: string;
  questId: string;
  questTitle: string;
  beatTitle: string | null;
  transitionKind: string;
  createdAt: string;
  seq: number;
  sessionId: string | null;
}

/** One entry per quest and session, its steps in the order they happened. */
export function groupQuestSteps(rows: readonly QuestStepRow[]): LearnedEntry[] {
  const groups = new Map<string, QuestStepRow[]>();
  for (const row of rows) {
    const key = `${row.questId}|${row.sessionId ?? ""}`;
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  }
  const entries: LearnedEntry[] = [];
  for (const group of groups.values()) {
    const sorted = [...group].sort((a, b) => a.seq - b.seq);
    const first = sorted[0];
    if (!first) continue;
    entries.push({
      kind: "quest",
      key: `quest:${first.questId}:${first.sessionId ?? "none"}`,
      entityId: first.questId,
      name: first.questTitle,
      detail: sorted.map((r) => questStepLine(r.transitionKind, r.beatTitle)).join("\n"),
      whenIso: first.createdAt,
      approximate: false,
      sessionId: first.sessionId,
      recordRefs: sorted.map((r) => ({ table: "quest_beat_transitions", match: { id: r.id } })),
    });
  }
  return entries;
}

/** Newest first, the order both lists read in. */
export function sortLearned(entries: readonly LearnedEntry[]): LearnedEntry[] {
  return [...entries].sort((a, b) => Date.parse(b.whenIso) - Date.parse(a.whenIso));
}

// ── Suggesting a session ────────────────────────────────────────────────────

export interface SessionSuggestion {
  sessionId: string;
  /** "Session 12?" or "Session 12 (next)?" */
  label: string;
}

interface Span {
  session: CampaignSession;
  start: number;
  /** Exclusive; Infinity while the session is running. */
  end: number;
}

function spanOf(session: CampaignSession): Span | null {
  if (session.started_at) {
    const start = Date.parse(session.started_at);
    const end = session.ended_at ? Date.parse(session.ended_at) : Number.POSITIVE_INFINITY;
    return { session, start, end };
  }
  if (session.played_on) {
    // A day logged by hand covers that local calendar day.
    const start = new Date(`${session.played_on}T00:00:00`).getTime();
    return { session, start, end: start + 24 * 60 * 60 * 1000 };
  }
  return null;
}

function shortName(session: CampaignSession): string {
  if (session.number !== null) return `Session ${session.number}`;
  return session.title?.trim() || "Unnumbered session";
}

/**
 * The session a learned moment most likely belongs to: the one whose span
 * holds it; else the next one after it (shared during prep, which is how the
 * database files it too); else the latest one before it. Null when the log
 * has no dated session.
 */
export function suggestSession(
  whenIso: string,
  sessions: readonly CampaignSession[],
): SessionSuggestion | null {
  const when = Date.parse(whenIso);
  if (Number.isNaN(when)) return null;
  const spans = sessions.map(spanOf).filter((s): s is Span => s !== null);

  const containing = spans.filter((s) => s.start <= when && when < s.end).sort((a, b) => b.start - a.start)[0];
  if (containing) return { sessionId: containing.session.id, label: `${shortName(containing.session)}?` };

  const next = spans.filter((s) => s.start > when).sort((a, b) => a.start - b.start)[0];
  if (next) return { sessionId: next.session.id, label: `${shortName(next.session)} (next)?` };

  const before = spans.filter((s) => s.end <= when).sort((a, b) => b.end - a.end)[0];
  if (before) return { sessionId: before.session.id, label: `${shortName(before.session)}?` };
  return null;
}

// ── Raw rows → entries ──────────────────────────────────────────────────────

export interface CreatureRow {
  id: string;
  /** The custom monster id, else the library monster id. */
  entityId: string;
  name: string;
  /** Null is the whole party (legacy rows). */
  visibleTo: string[] | null;
  discoveredAt: string;
  sessionId: string | null;
}

export interface CombatRow {
  id: string;
  encounterId: string;
  name: string;
  whenIso: string;
  sessionId: string | null;
}

/** Everything a read returned, before it is shaped. */
export interface LearnedRaw {
  person: RevealRow[];
  place: RevealRow[];
  handout: RevealRow[];
  creatures: CreatureRow[];
  quests: QuestStepRow[];
  combat: CombatRow[];
}

export const REVEAL_SOURCES: Readonly<Record<"person" | "place" | "handout", RevealSource>> = {
  person: { kind: "person", table: "npc_reveals", entityColumn: "npc_id" },
  place: { kind: "place", table: "location_reveals", entityColumn: "location_id" },
  handout: { kind: "handout", table: "handout_reveals", entityColumn: "document_id" },
};

export function shapeLearned(raw: LearnedRaw, party: readonly PartyName[]): LearnedEntry[] {
  const creatures: LearnedEntry[] = raw.creatures.map((c) => ({
    kind: "creature",
    key: `creature:${c.id}`,
    entityId: c.entityId,
    name: c.name,
    detail: c.visibleTo === null ? "The whole party" : audienceLabel(c.visibleTo, party),
    whenIso: c.discoveredAt,
    approximate: false,
    sessionId: c.sessionId,
    recordRefs: [{ table: "discovered_monsters", match: { id: c.id } }],
  }));
  const combat: LearnedEntry[] = raw.combat.map((c) => ({
    kind: "combat",
    key: `combat:${c.id}`,
    entityId: c.encounterId,
    name: c.name,
    detail: "",
    whenIso: c.whenIso,
    approximate: false,
    sessionId: c.sessionId,
    recordRefs: [],
  }));
  return sortLearned([
    ...groupPerCharacter(raw.person, party, REVEAL_SOURCES.person),
    ...groupPerCharacter(raw.place, party, REVEAL_SOURCES.place),
    ...groupPerCharacter(raw.handout, party, REVEAL_SOURCES.handout),
    ...creatures,
    ...groupQuestSteps(raw.quests),
    ...combat,
  ]);
}

/** Where an entry's name leads: the entity itself. */
export function learnedEntryLink(entry: Pick<LearnedEntry, "kind" | "entityId">): { path: string; query?: Record<string, string> } {
  switch (entry.kind) {
    case "person":
      return { path: `/npcs/${entry.entityId}` };
    case "place":
      return { path: "/locations", query: { at: entry.entityId } };
    case "handout":
      return { path: `/scriptorium/${entry.entityId}` };
    case "creature":
      return { path: `/monsters/${entry.entityId}` };
    case "quest":
      return { path: `/quests/${entry.entityId}` };
    case "combat":
      return { path: `/encounters/${entry.entityId}` };
  }
}
