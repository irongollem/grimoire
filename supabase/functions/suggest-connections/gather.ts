import type { SupabaseClient } from "@supabase/supabase-js";
import { toPlainText } from "../_shared/ai-prompt.ts";
import { truncateAtWordBoundary } from "../_shared/embedTextUtil.ts";
import type { CandidateEntity } from "../_shared/campaignEntityRetrieval.ts";
import { HEAD_ROLES, connectableKinds, type ExistingLink, type SuggestionContext } from "../_shared/connectionSuggestions.ts";
import { LINK_KINDS, PERSON_KINDS, wordFor, type LinkKind } from "../_shared/worldLinkCatalogue.ts";
import { promptAge, type DatePoint } from "../_shared/npcAge.ts";

/**
 * What the suggester reads before it asks the model (#1084): the subject, every
 * kind of candidate it could be tied to (a bounded direct read each, beside the
 * semantic retrieval the caller passes in), what each candidate's tie would be
 * grounded in, and the ties the subject already has, read from its own side so
 * the model does not repeat them.
 */

type Row = Record<string, unknown>;

const FIELD_CHAR_LIMIT = 1500;
/** The most candidates of each kind the model is shown. PCs are name and birth year only. */
const CAP: Record<LinkKind, number> = { npc: 40, party_member: 30, faction: 30, location: 30, deity: 20, item: 30 };

const TABLE: Record<LinkKind, string> = {
  npc: "npcs",
  party_member: "party_members",
  faction: "factions",
  location: "locations",
  deity: "deities",
  item: "items",
};

/** The columns that name a candidate and describe it in one phrase. */
const LIST_COLUMNS: Record<LinkKind, string> = {
  npc: "id, name, occupation",
  party_member: "id, name",
  faction: "id, name, faction_type",
  location: "id, name, location_type",
  deity: "id, name, portfolio, domains",
  item: "id, name, item_type, rarity",
};

/** What the model needs to ground a tie to a candidate, beyond its name. */
const DETAIL_COLUMNS: Record<LinkKind, string> = {
  npc: "id, name, occupation, status, born_year, died_year, location_id",
  party_member: "id, name, born_year",
  faction: "id, name, faction_type, seat_location_id",
  location: "id, name, location_type",
  deity: "id, name, portfolio, domains",
  item: "id, name, item_type, rarity",
};

const SUBJECT_COLUMNS: Record<LinkKind, string> = {
  npc: "id, name, occupation, race, personality, backstory, appearance, age, born_year, born_month, born_day, status, died_year, location_id",
  party_member: "id, name, born_year, current_location_id, deity_id",
  faction: "id, name, faction_type, description, alignment, seat_location_id",
  location: "id, name, location_type, description, npc_owner_id",
  deity: "id, name, titles, alignment, domains, portfolio, description",
  item: "id, name, item_type, subtype, rarity, description, campaign_id, user_id",
};

const END_COLUMN: Record<LinkKind, string> = {
  npc: "npc_id",
  party_member: "party_member_id",
  faction: "faction_id",
  location: "location_id",
  deity: "deity_id",
  item: "item_id",
};

/** The faction-to-place types that say a faction holds the place: what grounds a place's candidate line. */
const HOLDING_TYPES = ["controls", "based_in", "operates_in"];

function str(row: Row, key: string): string {
  const v = row[key];
  return typeof v === "string" ? v : "";
}

function num(row: Row, key: string): number | null {
  const v = row[key];
  return typeof v === "number" ? v : null;
}

function plain(value: string | null | undefined): string {
  if (!value) return "";
  return truncateAtWordBoundary(toPlainText(value).replace(/\s+/g, " ").trim(), FIELD_CHAR_LIMIT);
}

/** Run a read and return its rows, throwing the database's error rather than reading it as "no rows". */
async function read(q: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<Row[]> {
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as Row[];
}

function lower(name: string): string {
  return name.trim().toLowerCase();
}

export interface Subject {
  kind: LinkKind;
  id: string;
  name: string;
  row: Row;
}

/** The subject, scoped to the campaign the caller was just authorised for; null when it is not in it. */
export async function loadSubject(
  admin: SupabaseClient,
  campaign: { id: string; user_id: string },
  kind: LinkKind,
  id: string,
): Promise<Subject | null> {
  const query = admin.from(TABLE[kind]).select(SUBJECT_COLUMNS[kind]).eq("id", id);
  // A general item (no campaign) is the owner's, usable in any of their campaigns.
  const rows = await read(kind === "item"
    ? query.or(`campaign_id.eq.${campaign.id},campaign_id.is.null`)
    : query.eq("campaign_id", campaign.id));
  const row = rows[0];
  if (!row) return null;
  if (kind === "item" && row.campaign_id === null && row.user_id !== campaign.user_id) return null;
  return { kind, id, name: str(row, "name"), row };
}

/** The retrieval query: the subject's name and the few lines that say what it is, plus the steer. */
export function retrievalQueryFor(subject: Subject, steer: string): string {
  const r = subject.row;
  const parts = [
    subject.name,
    str(r, "occupation") || str(r, "faction_type") || str(r, "location_type") || str(r, "portfolio") || str(r, "item_type"),
    plain(str(r, "personality")).slice(0, 300),
    plain(str(r, "backstory")).slice(0, 300),
    plain(str(r, "description")).slice(0, 300),
    steer.trim(),
  ];
  return parts.filter(Boolean).join(". ");
}

export interface GatherArgs {
  campaignId: string;
  subject: Subject;
  today: DatePoint | null;
  /** Semantic retrieval's picks, ranked first; empty when it is down. */
  retrieved: { npcs: CandidateEntity[]; factions: CandidateEntity[]; locations: CandidateEntity[] };
}

export interface Gathered {
  /** The subject, one fact per line. */
  subjectLines: string[];
  /** Ties the subject already has, read from its side. */
  existingLines: string[];
  /** One line per candidate, in prompt order. */
  candidateLines: string[];
  /** How many candidates of any kind the model is shown. */
  candidateCount: number;
  /** The id of each candidate shown, by kind and lower-case name. */
  ids: Partial<Record<LinkKind, Record<string, string>>>;
  context: SuggestionContext;
}

interface Candidate {
  kind: LinkKind;
  name: string;
  descriptor: string | null;
}

function describe(kind: LinkKind, r: Row): string | null {
  switch (kind) {
    case "npc": return str(r, "occupation") || null;
    case "faction": return str(r, "faction_type") || null;
    case "location": return str(r, "location_type") || null;
    case "item": return [str(r, "item_type"), str(r, "rarity") && str(r, "rarity") !== "mundane" ? str(r, "rarity") : ""].filter(Boolean).join(", ") || null;
    case "deity": {
      const domains = Array.isArray(r.domains) ? (r.domains as unknown[]).filter((d): d is string => typeof d === "string") : [];
      return str(r, "portfolio") || domains.join(", ") || null;
    }
    case "party_member": return null;
  }
}

/** Retrieval's picks first, then the direct read, one list per kind, without the subject or anyone excluded. */
function merge(retrieved: CandidateEntity[], direct: Candidate[], kind: LinkKind, skip: Set<string>, cap: number): Candidate[] {
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const c of [...retrieved.map((r) => ({ kind, name: r.name, descriptor: r.descriptor })), ...direct]) {
    const k = lower(c.name);
    if (!k || skip.has(k) || seen.has(k)) continue;
    seen.add(k);
    out.push(c);
    if (out.length >= cap) break;
  }
  return out;
}

interface KinRow {
  from_npc_id: string | null;
  from_party_member_id: string | null;
  to_npc_id: string | null;
  to_party_member_id: string | null;
  kind: string;
  parent_role: string | null;
  adoptive: boolean;
}

/** What `other` is to the subject, read from the subject's end of a stored kin link. */
function kinWord(link: KinRow, subjectIsFrom: boolean): string {
  if (link.kind === "parent") {
    if (subjectIsFrom) return link.adoptive ? "adoptive child" : "child";
    const role = link.parent_role ?? "parent";
    return link.adoptive ? `adoptive ${role}` : role;
  }
  return link.kind === "former_spouse" ? "former spouse" : link.kind;
}

export async function gatherConnections(admin: SupabaseClient, args: GatherArgs): Promise<Gathered> {
  const { campaignId, subject, today } = args;
  const sRow = subject.row;
  const kinds = connectableKinds(subject.kind);
  const subjectIsPerson = PERSON_KINDS.includes(subject.kind);

  // ── Names by id: filled as rows are read, topped up on demand ─────────────
  const names: Record<LinkKind, Map<string, string>> = {
    npc: new Map(), party_member: new Map(), faction: new Map(), location: new Map(), deity: new Map(), item: new Map(),
  };
  names[subject.kind].set(subject.id, subject.name);
  async function nameThese(kind: LinkKind, ids: Iterable<string | null | undefined>): Promise<void> {
    const missing = [...new Set([...ids].filter((i): i is string => !!i && !names[kind].has(i)))];
    if (missing.length === 0) return;
    for (const r of await read(admin.from(TABLE[kind]).select("id, name").in("id", missing))) names[kind].set(str(r, "id"), str(r, "name"));
  }
  const nameOf = (kind: LinkKind, id: string | null | undefined): string | null => (id ? (names[kind].get(id) ?? null) : null);

  // ── What the subject already has ─────────────────────────────────────────
  const col = END_COLUMN[subject.kind];
  const linkColumns = "from_kind, to_kind, type, from_id, to_id";
  const [outLinks, inLinks, npcMembers, pcMembers, kinRows] = await Promise.all([
    read(admin.from("world_links").select(linkColumns).eq("campaign_id", campaignId).eq(`from_${col}`, subject.id)),
    read(admin.from("world_links").select(linkColumns).eq("campaign_id", campaignId).eq(`to_${col}`, subject.id)),
    subject.kind === "npc" || subject.kind === "faction"
      ? read(admin.from("faction_npcs").select("npc_id, faction_id, role, status").eq(subject.kind === "npc" ? "npc_id" : "faction_id", subject.id))
      : Promise.resolve([] as Row[]),
    subject.kind === "party_member" || subject.kind === "faction"
      ? read(admin.from("faction_party_members").select("party_member_id, faction_id, role, status").eq(subject.kind === "party_member" ? "party_member_id" : "faction_id", subject.id))
      : Promise.resolve([] as Row[]),
    subjectIsPerson
      ? read(admin.from("kin_links").select("from_npc_id, from_party_member_id, to_npc_id, to_party_member_id, kind, parent_role, adoptive").eq("campaign_id", campaignId))
      : Promise.resolve([] as Row[]),
  ]);

  interface RawLink { kind: LinkKind; id: string; type: string; outward: boolean }
  const rawLinks: RawLink[] = [
    ...outLinks.map((r) => ({ kind: str(r, "to_kind") as LinkKind, id: str(r, "to_id"), type: str(r, "type"), outward: true })),
    ...inLinks.map((r) => ({ kind: str(r, "from_kind") as LinkKind, id: str(r, "from_id"), type: str(r, "type"), outward: false })),
  ];
  for (const k of LINK_KINDS) await nameThese(k, rawLinks.filter((l) => l.kind === k).map((l) => l.id));

  // A membership is a person and a faction; the far end is whichever the subject is not.
  interface Membership { otherKind: LinkKind; otherId: string; role: string; status: string }
  const memberships: Membership[] = [
    ...npcMembers.map((r) => ({
      otherKind: (subject.kind === "faction" ? "npc" : "faction") as LinkKind,
      otherId: subject.kind === "faction" ? str(r, "npc_id") : str(r, "faction_id"),
      role: str(r, "role") || "Member",
      status: str(r, "status"),
    })),
    ...pcMembers.map((r) => ({
      otherKind: (subject.kind === "faction" ? "party_member" : "faction") as LinkKind,
      otherId: subject.kind === "faction" ? str(r, "party_member_id") : str(r, "faction_id"),
      role: str(r, "role") || "Member",
      status: str(r, "status"),
    })),
  ];
  for (const k of LINK_KINDS) await nameThese(k, memberships.filter((m) => m.otherKind === k).map((m) => m.otherId));

  // ── Kin the subject already has, and what the shared parents imply ──────
  const subjectKey = subject.kind === "party_member" ? `pc:${subject.id}` : `npc:${subject.id}`;
  const endKey = (npcId: string | null, pcId: string | null) => (npcId ? `npc:${npcId}` : `pc:${pcId}`);
  const kin = kinRows.map((r) => r as unknown as KinRow);
  const ownKin: { other: string; word: string }[] = [];
  const subjectParents = new Set<string>();
  for (const l of kin) {
    const from = endKey(l.from_npc_id, l.from_party_member_id);
    const to = endKey(l.to_npc_id, l.to_party_member_id);
    if (from !== subjectKey && to !== subjectKey) continue;
    const subjectIsFrom = from === subjectKey;
    ownKin.push({ other: subjectIsFrom ? to : from, word: kinWord(l, subjectIsFrom) });
    if (l.kind === "parent" && !subjectIsFrom) subjectParents.add(from);
  }
  const siblingThrough = new Map<string, string>();
  for (const l of kin) {
    const parent = endKey(l.from_npc_id, l.from_party_member_id);
    if (l.kind !== "parent" || !subjectParents.has(parent)) continue;
    const child = endKey(l.to_npc_id, l.to_party_member_id);
    if (child !== subjectKey) siblingThrough.set(child, parent);
  }
  const kinKeys = [...ownKin.map((o) => o.other), ...siblingThrough.keys(), ...siblingThrough.values()];
  await nameThese("npc", kinKeys.filter((k) => k.startsWith("npc:")).map((k) => k.slice(4)));
  await nameThese("party_member", kinKeys.filter((k) => k.startsWith("pc:")).map((k) => k.slice(3)));
  const personName = (k: string): string | null => (k.startsWith("npc:") ? nameOf("npc", k.slice(4)) : nameOf("party_member", k.slice(3)));
  const existingKinNpcNames: string[] = [];
  const existingKinPcNames: string[] = [];
  for (const o of ownKin) {
    const n = personName(o.other);
    if (n) (o.other.startsWith("npc:") ? existingKinNpcNames : existingKinPcNames).push(n);
  }
  const impliedSiblings: Record<string, string> = {};
  for (const [child, parent] of siblingThrough) {
    const childName = personName(child);
    const parentName = personName(parent);
    if (childName && parentName) impliedSiblings[`${child.startsWith("npc:") ? "npc" : "pc"}:${lower(childName)}`] = parentName;
  }

  // ── Records that live in the subject's own columns ───────────────────────
  const recordIds: { kind: LinkKind; id: string | null; word: string }[] = [];
  if (subject.kind === "npc") recordIds.push({ kind: "location", id: str(sRow, "location_id") || null, word: "lives in" });
  if (subject.kind === "party_member") {
    recordIds.push({ kind: "location", id: str(sRow, "current_location_id") || null, word: "is at" });
    recordIds.push({ kind: "deity", id: str(sRow, "deity_id") || null, word: "patron deity" });
  }
  if (subject.kind === "faction") recordIds.push({ kind: "location", id: str(sRow, "seat_location_id") || null, word: "seated at" });
  if (subject.kind === "location") recordIds.push({ kind: "npc", id: str(sRow, "npc_owner_id") || null, word: "kept by" });
  for (const k of LINK_KINDS) await nameThese(k, recordIds.filter((r) => r.kind === k).map((r) => r.id));

  // ── Candidates: retrieval first, then a direct read as the floor ─────────
  const skip: Record<LinkKind, Set<string>> = {
    npc: new Set(), party_member: new Set(), faction: new Set(), location: new Set(), deity: new Set(), item: new Set(),
  };
  skip[subject.kind].add(lower(subject.name));
  // A faction a person already belongs to is not offered for a membership again. People stay candidates for a
  // faction subject: the same person can also be tied to it another way, and sanitising drops a repeated membership.
  if (subjectIsPerson) {
    for (const m of memberships) {
      const n = nameOf("faction", m.otherId);
      if (n) skip.faction.add(lower(n));
    }
  }

  const direct = await Promise.all(kinds.map(async (kind): Promise<[LinkKind, Candidate[]]> => {
    let q = admin.from(TABLE[kind]).select(LIST_COLUMNS[kind]).eq("campaign_id", campaignId);
    if (kind === subject.kind) q = q.neq("id", subject.id);
    if (kind !== "party_member") q = q.order("updated_at", { ascending: false });
    const rows = await read(q.limit(CAP[kind] * 2));
    return [kind, rows.map((r) => ({ kind, name: str(r, "name"), descriptor: describe(kind, r) }))];
  }));
  const picked = new Map<LinkKind, Candidate[]>();
  for (const [kind, list] of direct) {
    const retrieved = kind === "npc" ? args.retrieved.npcs : kind === "faction" ? args.retrieved.factions : kind === "location" ? args.retrieved.locations : [];
    picked.set(kind, merge(retrieved, list, kind, skip[kind], CAP[kind] + retrieved.length));
  }

  // Details for exactly the candidates shown.
  const details: Record<LinkKind, Map<string, Row>> = {
    npc: new Map(), party_member: new Map(), faction: new Map(), location: new Map(), deity: new Map(), item: new Map(),
  };
  await Promise.all(kinds.map(async (kind) => {
    const list = picked.get(kind) ?? [];
    if (list.length === 0) return;
    const rows = await read(admin.from(TABLE[kind]).select(DETAIL_COLUMNS[kind]).eq("campaign_id", campaignId).in("name", list.map((c) => c.name)));
    for (const r of rows) {
      details[kind].set(lower(str(r, "name")), r);
      names[kind].set(str(r, "id"), str(r, "name"));
    }
  }));
  const idsOf = (kind: LinkKind) => [...details[kind].values()].map((r) => str(r, "id"));

  // ── What grounds a tie to each candidate ─────────────────────────────────
  const personIds = [...idsOf("npc"), ...(subject.kind === "npc" ? [subject.id] : [])];
  const factionIds = idsOf("faction");
  const locationIds = idsOf("location");
  const itemIds = [...idsOf("item"), ...(subject.kind === "item" ? [subject.id] : [])];
  const [npcOffices, factionHeads, holdings, npcCarry, pcCarry] = await Promise.all([
    personIds.length > 0 ? read(admin.from("faction_npcs").select("npc_id, faction_id, role, status").in("npc_id", personIds)) : Promise.resolve([] as Row[]),
    factionIds.length > 0 || subject.kind === "faction"
      ? read(admin.from("faction_npcs").select("npc_id, faction_id, role, status").in("faction_id", [...factionIds, ...(subject.kind === "faction" ? [subject.id] : [])]).in("role", [...HEAD_ROLES]).eq("status", "Active"))
      : Promise.resolve([] as Row[]),
    locationIds.length > 0 || subject.kind === "location"
      ? read(admin.from("world_links").select("from_id, to_id, type").eq("campaign_id", campaignId).eq("from_kind", "faction").eq("to_kind", "location")
        .in("to_id", [...locationIds, ...(subject.kind === "location" ? [subject.id] : [])]).in("type", HOLDING_TYPES))
      : Promise.resolve([] as Row[]),
    itemIds.length > 0 ? read(admin.from("npc_inventory").select("item_id, npc_id").in("item_id", itemIds)) : Promise.resolve([] as Row[]),
    itemIds.length > 0 ? read(admin.from("party_inventory").select("item_id, carried_by").in("item_id", itemIds).not("carried_by", "is", null)) : Promise.resolve([] as Row[]),
  ]);
  await nameThese("faction", [...npcOffices.map((r) => str(r, "faction_id")), ...holdings.map((r) => str(r, "from_id"))]);
  await nameThese("npc", [...factionHeads.map((r) => str(r, "npc_id")), ...npcCarry.map((r) => str(r, "npc_id"))]);
  await nameThese("party_member", pcCarry.map((r) => str(r, "carried_by")));
  await nameThese("location", [
    ...[...details.npc.values()].map((r) => str(r, "location_id")),
    ...[...details.faction.values()].map((r) => str(r, "seat_location_id")),
  ]);

  const officePhrase = (r: Row): string | null => {
    const faction = nameOf("faction", str(r, "faction_id"));
    if (!faction) return null;
    const role = str(r, "role").trim() || "Member";
    const status = str(r, "status");
    return status && status !== "Active" ? `${faction} (${role}, ${status.toLowerCase()})` : `${faction} (${role})`;
  };
  const headsOf = (factionId: string): string[] =>
    factionHeads.filter((h) => str(h, "faction_id") === factionId).flatMap((h) => {
      const n = nameOf("npc", str(h, "npc_id"));
      return n ? [`${str(h, "role")} ${n}`] : [];
    });
  const carriersOf = (itemId: string): string[] => [
    ...npcCarry.filter((r) => str(r, "item_id") === itemId).flatMap((r) => nameOf("npc", str(r, "npc_id")) ?? []),
    ...pcCarry.filter((r) => str(r, "item_id") === itemId).flatMap((r) => nameOf("party_member", str(r, "carried_by")) ?? []),
  ];
  const holdersOf = (locationId: string): string[] =>
    holdings.filter((h) => str(h, "to_id") === locationId).flatMap((h) => nameOf("faction", str(h, "from_id")) ?? []);

  const bornYears: Record<string, number> = {};
  const diedYears: Record<string, number> = {};
  const headedFactionNames: string[] = [];
  const itemCarriers: Record<string, string> = {};

  const candidateLines: string[] = [];
  const candidateNames: Partial<Record<LinkKind, string[]>> = {};
  for (const kind of kinds) {
    for (const c of picked.get(kind) ?? []) {
      const d = details[kind].get(lower(c.name));
      candidateNames[kind] = [...(candidateNames[kind] ?? []), c.name];
      const key = lower(c.name);
      let tail = "";
      if (kind === "npc" || kind === "party_member") {
        const born = d ? num(d, "born_year") : null;
        const died = d && str(d, "status") === "dead" ? num(d, "died_year") : null;
        const type = kind === "npc" ? "npc" : "pc";
        if (born !== null) bornYears[`${type}:${key}`] = born;
        if (died !== null) diedYears[`${type}:${key}`] = died;
        const years = [born === null ? "" : `born ${born}`, died === null ? "" : `died ${died}`].filter(Boolean).join(", ");
        if (kind === "party_member") {
          candidateLines.push(`pc|${c.name}${years ? `|${years}` : ""}`);
          continue;
        }
        const place = d ? nameOf("location", str(d, "location_id")) : null;
        const offices = d ? npcOffices.filter((o) => str(o, "npc_id") === str(d, "id")).flatMap((o) => officePhrase(o) ?? []) : [];
        const where = [place ? `in ${place}` : "", ...offices].filter(Boolean).join("; ");
        tail = `|${years}${where ? `|${where}` : ""}`;
      } else if (kind === "faction") {
        const heads = d ? headsOf(str(d, "id")) : [];
        if (heads.length > 0) headedFactionNames.push(c.name);
        const seat = d ? nameOf("location", str(d, "seat_location_id")) : null;
        tail = `${heads.length > 0 ? `|headed by ${heads.join(", ")}` : ""}${seat ? `|seat ${seat}` : ""}`;
      } else if (kind === "location") {
        const holders = d ? holdersOf(str(d, "id")) : [];
        tail = holders.length > 0 ? `|held by ${[...new Set(holders)].join(", ")}` : "";
      } else if (kind === "item") {
        const carriers = d ? carriersOf(str(d, "id")) : [];
        if (carriers.length > 0) itemCarriers[key] = carriers[0];
        tail = carriers.length > 0 ? `|carried by ${carriers.join(", ")}` : "";
      }
      candidateLines.push(`${kind}|${c.name}|${c.descriptor ?? ""}${tail}`.replace(/\|+$/, ""));
    }
  }

  // ── The subject itself ───────────────────────────────────────────────────
  const subjectHeads = subject.kind === "faction" ? headsOf(subject.id) : [];
  if (subject.kind === "item") {
    const carriers = carriersOf(subject.id);
    if (carriers.length > 0) itemCarriers[lower(subject.name)] = carriers[0];
  }
  const sourceBorn = num(sRow, "born_year");
  if (subject.kind === "party_member" && sourceBorn !== null) bornYears[`pc:${lower(subject.name)}`] = sourceBorn;
  const age = subject.kind === "npc"
    ? promptAge({ age: str(sRow, "age") || null, born_year: sourceBorn, born_month: num(sRow, "born_month"), born_day: num(sRow, "born_day") }, today)
    : null;
  const subjectMemberships = memberships.flatMap((m) => {
    const n = nameOf(m.otherKind, m.otherId);
    return n ? [`${n} (${m.role}${m.status && m.status !== "Active" ? `, ${m.status.toLowerCase()}` : ""})`] : [];
  });
  const place = (id: string) => nameOf("location", id || null);
  const subjectLines = [
    `Kind: ${subject.kind === "party_member" ? "player character" : subject.kind}`,
    `Name: ${subject.name}`,
    str(sRow, "race") ? `Race: ${str(sRow, "race")}` : "",
    str(sRow, "occupation") ? `Occupation: ${str(sRow, "occupation")}` : "",
    str(sRow, "faction_type") ? `Type: ${str(sRow, "faction_type")}` : "",
    str(sRow, "location_type") ? `Type: ${str(sRow, "location_type")}` : "",
    str(sRow, "item_type") ? `Type: ${[str(sRow, "item_type"), str(sRow, "subtype"), str(sRow, "rarity")].filter(Boolean).join(", ")}` : "",
    str(sRow, "alignment") ? `Alignment: ${str(sRow, "alignment")}` : "",
    str(sRow, "portfolio") ? `Portfolio: ${str(sRow, "portfolio")}` : "",
    subject.kind === "npc" && place(str(sRow, "location_id")) ? `Lives in: ${place(str(sRow, "location_id"))}` : "",
    subject.kind === "faction" && place(str(sRow, "seat_location_id")) ? `Seat: ${place(str(sRow, "seat_location_id"))}` : "",
    subjectHeads.length > 0 ? `Headed by: ${subjectHeads.join(", ")}` : "",
    subjectIsPerson && subjectMemberships.length > 0 ? `Factions: ${subjectMemberships.join("; ")}` : "",
    sourceBorn !== null ? `Born: ${sourceBorn}` : "",
    subject.kind === "npc" && str(sRow, "status") === "dead" && num(sRow, "died_year") !== null ? `Died: ${num(sRow, "died_year")}` : "",
    age ? `Age now: ${age}` : "",
    today && subjectIsPerson ? `Current year: ${today.year}` : "",
    plain(str(sRow, "personality")) ? `Personality: ${plain(str(sRow, "personality"))}` : "",
    plain(str(sRow, "backstory")) ? `Backstory: ${plain(str(sRow, "backstory"))}` : "",
    plain(str(sRow, "appearance")) ? `Appearance: ${plain(str(sRow, "appearance"))}` : "",
    plain(str(sRow, "description")) ? `Description: ${plain(str(sRow, "description"))}` : "",
  ].filter(Boolean);

  // ── Existing ties, read from the subject's side ──────────────────────────
  const existingLinks: ExistingLink[] = [];
  const existingLines: string[] = [];
  for (const l of rawLinks) {
    const n = nameOf(l.kind, l.id);
    if (!n) continue;
    existingLinks.push({ kind: l.kind, name: n, type: l.type, outward: l.outward });
    const word = wordFor(subject.kind, l.kind, l.type, l.outward);
    existingLines.push(`${word}: ${n} (${l.kind === "party_member" ? "player character" : l.kind})`);
  }
  for (const m of memberships) {
    const n = nameOf(m.otherKind, m.otherId);
    if (n) existingLines.push(`${subject.kind === "faction" ? "member" : "member of"}: ${n} (${m.otherKind === "party_member" ? "player character" : m.otherKind}, ${m.role})`);
  }
  for (const o of ownKin) {
    const n = personName(o.other);
    if (n) existingLines.push(`family, their ${o.word}: ${n}`);
  }
  for (const r of recordIds) {
    const n = nameOf(r.kind, r.id);
    if (n) existingLines.push(`${r.word}: ${n} (${r.kind})`);
  }

  return {
    subjectLines,
    existingLines,
    candidateLines,
    candidateCount: candidateLines.length,
    ids: Object.fromEntries(kinds.map((k) => [k, Object.fromEntries([...details[k]].map(([name, r]) => [name, str(r, "id")]))])),
    context: {
      subjectKind: subject.kind,
      sourceName: subject.name,
      candidates: candidateNames,
      existingLinks,
      existingMemberNames: memberships.flatMap((m) => nameOf(m.otherKind, m.otherId) ?? []),
      headedFactionNames,
      subjectHeaded: subjectHeads.length > 0,
      existingKinNpcNames,
      existingKinPcNames,
      sourceBornYear: sourceBorn,
      bornYears,
      impliedSiblings,
      itemCarriers,
    },
  };
}
