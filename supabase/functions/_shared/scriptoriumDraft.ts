/**
 * Pure helpers for the `draft-scriptorium-document` edge function (epic #910,
 * story S12): request validation, the campaign context blocks the model is
 * grounded in, and the HTML whitelist its output passes through.
 *
 * Nothing here reads the database. The function fetches rows with the admin
 * client (always filtered by `campaign_id`) and hands them to the builders, so
 * what a player-facing draft may contain is decided in one tested place rather
 * than inline in a handler.
 *
 * The audience rule: for `audience: "players"` a block carries only what the
 * players could already see in the app (name, race, occupation, appearance for
 * an NPC; the description of a location only when it is shared; notes and
 * related entities only when shared with at least one player). A DM-facing
 * draft gets everything the row holds.
 */

import { toPlainText } from "./ai-prompt.ts";

// ── Request ──────────────────────────────────────────────────────────────────

export const DRAFT_KINDS = ["handout", "faction_dossier", "session_recap"] as const;
export type DraftKind = (typeof DRAFT_KINDS)[number];

export const DRAFT_SUBJECT_TYPES = ["npc", "location", "faction", "session"] as const;
export type DraftSubjectType = (typeof DRAFT_SUBJECT_TYPES)[number];

export type DraftAudience = "players" | "dm";

/** Which subjects each kind may be written about. */
export const KIND_SUBJECTS: Record<DraftKind, readonly DraftSubjectType[]> = {
  handout: ["npc", "location", "faction"],
  faction_dossier: ["faction"],
  session_recap: ["session"],
};

export interface DraftRequest {
  campaignId: string;
  kind: DraftKind;
  subjectType: DraftSubjectType;
  subjectId: string;
  audience: DraftAudience;
  prompt: string;
}

export type DraftRequestResult =
  | { ok: true; value: DraftRequest }
  | { ok: false; error: string };

export function isDraftKind(v: unknown): v is DraftKind {
  return typeof v === "string" && (DRAFT_KINDS as readonly string[]).includes(v);
}

export function isDraftSubjectType(v: unknown): v is DraftSubjectType {
  return typeof v === "string" && (DRAFT_SUBJECT_TYPES as readonly string[]).includes(v);
}

export function isValidKindSubject(kind: DraftKind, subject: DraftSubjectType): boolean {
  return KIND_SUBJECTS[kind].includes(subject);
}

/** Validates the raw JSON body. Unknown values are rejected, never defaulted. */
export function validateDraftRequest(body: unknown): DraftRequestResult {
  if (typeof body !== "object" || body === null) return { ok: false, error: "Body must be an object" };
  const b = body as Record<string, unknown>;
  if (typeof b.campaign_id !== "string" || !b.campaign_id) return { ok: false, error: "campaign_id is required" };
  if (!isDraftKind(b.kind)) return { ok: false, error: "kind must be handout, faction_dossier or session_recap" };
  const subject = b.subject as { type?: unknown; id?: unknown } | null | undefined;
  if (typeof subject !== "object" || subject === null) return { ok: false, error: "subject is required" };
  if (!isDraftSubjectType(subject.type)) return { ok: false, error: "subject.type must be npc, location, faction or session" };
  if (typeof subject.id !== "string" || !subject.id) return { ok: false, error: "subject.id is required" };
  if (!isValidKindSubject(b.kind, subject.type)) {
    return { ok: false, error: `A ${b.kind} cannot be written about a ${subject.type}` };
  }
  if (b.audience !== "players" && b.audience !== "dm") return { ok: false, error: "audience must be players or dm" };
  const prompt = typeof b.prompt === "string" ? b.prompt.trim() : "";
  return {
    ok: true,
    value: {
      campaignId: b.campaign_id,
      kind: b.kind,
      subjectType: subject.type,
      subjectId: subject.id,
      audience: b.audience,
      prompt,
    },
  };
}

// ── Context blocks ───────────────────────────────────────────────────────────

export const BLOCK_CHAR_LIMIT = 2000;
export const CONTEXT_CHAR_LIMIT = 12000;

/** Tiptap JSON or plain text → one trimmed, capped plain-text string. */
export function clip(value: string | null | undefined, limit = BLOCK_CHAR_LIMIT): string {
  const text = toPlainText(value).replace(/\s+/g, " ").trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, limit).trimEnd()}…`;
}

function line(label: string, value: string | null | undefined, limit = BLOCK_CHAR_LIMIT): string | null {
  const text = clip(value, limit);
  return text ? `${label}: ${text}` : null;
}

function present(lines: (string | null)[]): string[] {
  return lines.filter((l): l is string => l !== null);
}

const sharedWithPlayers = (ids: string[] | null | undefined): boolean => (ids?.length ?? 0) > 0;

export interface DraftNpc {
  id: string;
  name: string;
  race: string | null;
  occupation: string | null;
  appearance: string | null;
  personality: string | null;
  backstory: string | null;
  player_visible_to: string[] | null;
  /** Which fields a player may see (name, race, occupation, ...). */
  player_visible_fields: string[] | null;
  disguise_name: string | null;
  disguise_portrait_url: string | null;
  is_revealed: boolean | null;
  location_id: string | null;
}

export interface DraftFaction {
  id: string;
  name: string;
  faction_type: string | null;
  alignment: string | null;
  description: string | null;
  player_visible_to: string[] | null;
}

export interface DraftLocation {
  id: string;
  name: string;
  location_type: string | null;
  description: string | null;
  is_description_shared: boolean | null;
  player_visible_to: string[] | null;
}

export interface DraftNote {
  id: string;
  title: string;
  content: string | null;
  session_id: string | null;
  /** The linked session (notes.session_id), embedded; its number is a DM label and may be null. */
  session: { number: number | null } | null;
  session_real_date: string | null;
  player_visible_to: string[] | null;
}

export interface FactionMember {
  npc: DraftNpc;
  role: string | null;
  status: string | null;
  /** The NPC's own location is shared with players AND has "share linked NPCs" on. */
  locationSharesNpcs: boolean;
}
export interface FactionHolding { location: DraftLocation; notes: string | null }
export interface FactionRelationRow { target: DraftFaction; relation_type: string; notes: string | null }

/**
 * The player projection (`get_player_visible_npcs`, latest definition in
 * 20260927164240): an NPC is visible when it is shared with at least one player
 * itself, or when its own location is shared with players with "share linked
 * NPCs" on. The caller works out the second part (`locationSharesNpcs`).
 */
export function npcVisibleToPlayers(npc: DraftNpc, locationSharesNpcs: boolean): boolean {
  return sharedWithPlayers(npc.player_visible_to) || locationSharesNpcs;
}

/** An NPC wearing a disguise that has not been revealed (the projection's `concealed`). */
function npcConcealed(npc: DraftNpc): boolean {
  return (!!npc.disguise_name || !!npc.disguise_portrait_url) && npc.is_revealed !== true;
}

export interface NpcPlayerView {
  name: string | null;
  race: string | null;
  occupation: string | null;
}

/**
 * What a player's projection of this NPC exposes, and nothing else: name only
 * when the `name` field is shared (the disguise name while concealed, never the
 * true one), race and occupation only when their fields are shared. Appearance,
 * personality, backstory and notes are DM-only in the projection.
 */
export function npcPlayerView(npc: DraftNpc): NpcPlayerView {
  const fields = npc.player_visible_fields ?? [];
  const name = !fields.includes("name")
    ? null
    : npcConcealed(npc) && npc.disguise_name ? npc.disguise_name : npc.name;
  return {
    name,
    race: fields.includes("race") ? npc.race : null,
    occupation: fields.includes("occupation") ? npc.occupation : null,
  };
}

const UNNAMED_NPC = "An unnamed figure";

/** Name and role of an NPC, never more: used where an NPC is only mentioned. */
function npcLabel(m: FactionMember, audience: DraftAudience): string {
  if (audience === "dm") {
    const bits = [m.npc.occupation, m.role].filter((b): b is string => !!b && b.trim().length > 0);
    return bits.length ? `${m.npc.name} (${bits.join(", ")})` : m.npc.name;
  }
  const view = npcPlayerView(m.npc);
  const bits = [view.occupation, m.role].filter((b): b is string => !!b && b.trim().length > 0);
  const name = view.name ?? UNNAMED_NPC;
  return bits.length ? `${name} (${bits.join(", ")})` : name;
}

export function buildNpcBlock(npc: DraftNpc, factions: DraftFaction[], audience: DraftAudience): string {
  const visibleFactions = audience === "dm" ? factions : factions.filter((f) => sharedWithPlayers(f.player_visible_to));
  const belongs = visibleFactions.length ? `Belongs to: ${visibleFactions.map((f) => f.name).join(", ")}` : null;
  if (audience === "dm") {
    return present([
      `NPC: ${npc.name}`,
      line("Race", npc.race, 200),
      line("Occupation", npc.occupation, 200),
      line("Appearance", npc.appearance),
      line("Personality", npc.personality),
      line("Backstory", npc.backstory),
      belongs,
    ]).join("\n");
  }
  const view = npcPlayerView(npc);
  return present([
    `NPC: ${view.name ?? UNNAMED_NPC}`,
    line("Race", view.race, 200),
    line("Occupation", view.occupation, 200),
    belongs,
  ]).join("\n");
}

/**
 * Whether a players draft may be written about this subject at all. Returns the
 * refusal message, or `null` when allowed. Always `null` for a DM draft. A
 * location or faction is visible when shared with at least one player (the
 * projections' `player_visible_to` rule); an NPC per `npcVisibleToPlayers`.
 */
export function subjectRefusal(
  audience: DraftAudience,
  subjectType: "npc" | "location" | "faction",
  row: { player_visible_to: string[] | null },
  locationSharesNpcs = false,
): string | null {
  if (audience === "dm") return null;
  const shared = subjectType === "npc"
    ? npcVisibleToPlayers(row as DraftNpc, locationSharesNpcs)
    : sharedWithPlayers(row.player_visible_to);
  if (shared) return null;
  const noun = subjectType === "npc" ? "NPC" : subjectType === "location" ? "location" : "faction";
  return `This ${noun} isn't shared with your players yet; draft it for the DM or share it first.`;
}

export function buildLocationBlock(
  loc: DraftLocation,
  parentName: string | null,
  audience: DraftAudience,
): string {
  // The parent is named to players only when the caller found it shared; the
  // caller passes null for an unshared parent.
  const describe = audience === "dm" || loc.is_description_shared === true;
  return present([
    `Location: ${loc.name}`,
    line("Kind", loc.location_type, 100),
    parentName ? `Found in: ${parentName}` : null,
    describe ? line("Description", loc.description) : null,
  ]).join("\n");
}

export function buildFactionBlock(
  faction: DraftFaction,
  members: FactionMember[],
  holdings: FactionHolding[],
  relations: FactionRelationRow[],
  audience: DraftAudience,
): string {
  const dm = audience === "dm";
  const shownMembers = dm ? members : members.filter((m) => npcVisibleToPlayers(m.npc, m.locationSharesNpcs));
  const shownHoldings = dm ? holdings : holdings.filter((h) => sharedWithPlayers(h.location.player_visible_to));
  const shownRelations = dm ? relations : relations.filter((r) => sharedWithPlayers(r.target.player_visible_to));

  return present([
    `Faction: ${faction.name}`,
    line("Type", faction.faction_type, 100),
    dm ? line("Alignment", faction.alignment, 100) : null,
    line("Description", faction.description),
    shownMembers.length ? `Members:\n${shownMembers.map((m) => `- ${npcLabel(m, audience)}`).join("\n")}` : null,
    shownHoldings.length
      ? `Holdings:\n${shownHoldings
        .map((h) => `- ${h.location.name}${dm && h.notes ? `: ${clip(h.notes, 200)}` : ""}`)
        .join("\n")}`
      : null,
    shownRelations.length
      ? `Relations with other factions:\n${shownRelations
        .map((r) => `- ${r.relation_type} ${r.target.name}${dm && r.notes ? `: ${clip(r.notes, 200)}` : ""}`)
        .join("\n")}`
      : null,
  ]).join("\n");
}

/**
 * Session notes. For a player-facing recap only notes shared with at least one
 * player are included; the caller checks `sessionNoteAllowed` on the subject
 * itself first, so an unshared session note is refused rather than silently
 * dropped to an empty packet.
 */
export function sessionNoteAllowed(note: DraftNote, audience: DraftAudience): boolean {
  return audience === "dm" || sharedWithPlayers(note.player_visible_to);
}

export function buildSessionBlock(subject: DraftNote, siblings: DraftNote[], audience: DraftAudience): string {
  const notes = [subject, ...siblings.filter((n) => n.id !== subject.id)].filter((n) =>
    sessionNoteAllowed(n, audience)
  );
  const heading = present([
    `Session: ${subject.title}`,
    subject.session?.number != null ? `Session number: ${subject.session.number}` : null,
    subject.session_real_date ? `Played on: ${subject.session_real_date}` : null,
  ]).join("\n");
  const body = notes
    .map((n) => `Note "${n.title}": ${clip(n.content) || "(empty)"}`)
    .join("\n\n");
  return `${heading}\n\n${body}`;
}

/** Joins blocks and enforces the whole-context cap. */
export function assembleContext(blocks: string[]): string {
  const joined = blocks.filter((b) => b.trim().length > 0).join("\n\n");
  if (joined.length <= CONTEXT_CHAR_LIMIT) return joined;
  return `${joined.slice(0, CONTEXT_CHAR_LIMIT).trimEnd()}…`;
}

const KIND_LABEL: Record<DraftKind, string> = {
  handout: "a player handout (an in-world document)",
  faction_dossier: "a faction dossier",
  session_recap: "a session recap packet",
};

/** The user turn: what to write, for whom, then the campaign block (delimited). */
export function buildDraftUserContent(
  kind: DraftKind,
  audience: DraftAudience,
  steer: string,
  contextBlock: string,
): string {
  return [
    `Write ${KIND_LABEL[kind]}.`,
    `Audience: ${audience === "players" ? "the players (they must not learn anything outside the campaign block's player-safe facts)" : "the DM (private prep, secrets are fine)"}.`,
    steer ? `The DM's steer:\n${steer}` : null,
    `---BEGIN CAMPAIGN BLOCK---\n${contextBlock}\n---END CAMPAIGN BLOCK---`,
  ].filter((p): p is string => p !== null).join("\n\n");
}

// ── Output: HTML whitelist ───────────────────────────────────────────────────

export const ALLOWED_TAGS = [
  "h1", "h2", "h3", "p", "ul", "ol", "li", "blockquote", "strong", "em", "br",
] as const;
const ALLOWED = new Set<string>(ALLOWED_TAGS);
// No `hr`: the Scriptorium turns a horizontal rule into a page break on import.
const VOID_TAGS = new Set(["br"]);
/** Elements dropped together with everything inside them. */
const DROP_WITH_CONTENT = ["script", "style", "iframe", "object", "embed", "noscript", "template", "svg", "math"];

const escapeText = (s: string) => s.replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Keeps only the allowed tags, with every attribute stripped. A whitelist: any
 * tag not named above (including unknown ones) is removed while its text is
 * kept, and script-like elements are removed with their content. Returns `null`
 * when nothing readable is left.
 */
export function sanitizeDraftHtml(html: string): string | null {
  let input = html.replace(/<!--[\s\S]*?-->/g, "");
  for (const tag of DROP_WITH_CONTENT) {
    input = input.replace(new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}\\s*>`, "gi"), "");
    input = input.replace(new RegExp(`<\\/?${tag}\\b[^>]*>`, "gi"), "");
  }

  let out = "";
  let last = 0;
  const tagRe = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(input)) !== null) {
    out += escapeText(input.slice(last, m.index));
    last = m.index + m[0].length;
    const closing = m[1] === "/";
    const name = m[2].toLowerCase();
    if (!ALLOWED.has(name)) continue;
    if (VOID_TAGS.has(name)) {
      if (!closing) out += `<${name}>`;
    } else {
      out += closing ? `</${name}>` : `<${name}>`;
    }
  }
  out += escapeText(input.slice(last));

  const readable = out.replace(/<[^>]*>/g, "").replace(/&nbsp;|&#160;/g, " ").trim();
  return readable.length > 0 ? out.trim() : null;
}

export interface DraftOutput { title: string; html: string }

export const MAX_TITLE_CHARS = 120;

/** Parses the model's `{ title, html }` and runs the HTML through the whitelist. */
export function parseDraftOutput(content: string): DraftOutput | null {
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.html !== "string" || typeof r.title !== "string") return null;
  const html = sanitizeDraftHtml(r.html);
  const title = r.title.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim().slice(0, MAX_TITLE_CHARS);
  if (!html || !title) return null;
  return { title, html };
}
