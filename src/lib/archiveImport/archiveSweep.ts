/**
 * The wiki-export import sweep (#932): turns the pages a DM settled in review
 * into content rows, with every side effect injected (`ArchiveSweepDeps`) so
 * the ordering and the two-pass link resolution are testable without a
 * database, the way `documentImport/importSweep.ts` is.
 *
 * Order is places parent-first, factions, NPCs, items, quests, notes. Only
 * *inserts* are ordered by it: a place's `parent_id` has to be on the insert
 * itself (`guard_location_room_parent` is a BEFORE INSERT trigger), and an
 * NPC's `location_id` comes from the place its page nests under.
 *
 * Mentions take two passes because a link can point at a record that does not
 * exist yet. Pass 1 inserts each row with every link as its plain label and
 * builds a `ref -> { id, entityType }` registry (created or linked). Pass 2
 * rewrites, only for pages that contain links, the body columns with the links
 * turned into `@mentions` where the target is a place, faction or NPC; a link
 * to a quest, item, note, an ignored page or something outside the export
 * stays a plain label and is reported. An `archiveLink` placeholder is never
 * written.
 *
 * One insert per row, so a refusal (`enforce_quota` is a BEFORE INSERT trigger)
 * is reported for that row. A kind that hits its plan limit stops there (every
 * later row of it would be refused the same way) and the other kinds go on.
 */
import type { EntityCandidate } from "@/lib/documentImport/entityMatching";
import type { InsertRowOutcome } from "@/lib/documentImport/runImportKind";
import type { LocationType } from "@/types/location.types";
import { fieldsForKind } from "./fields";
import { findPageForLink } from "./links";
import {
  TABLE_FOR_KIND,
  buildRecordRow,
  docColumnsOf,
  hasLinks,
  openingBeatRow,
  storedDoc,
  type ArchiveRecordKind,
  type ArchiveTable,
} from "./archiveRows";
import type { ArchiveMentionTarget, ArchivePage } from "./types";

export type { ArchiveRecordKind, ArchiveTable } from "./archiveRows";

/** What the DM decided for one page: no `generate`, nothing here is extracted. */
export type ArchiveDecision = { action: "create" } | { action: "link"; candidate: EntityCandidate } | { action: "ignore" };

export interface ArchiveSweepEntry {
  page: ArchivePage;
  /** The kind the DM settled, not the guess. */
  kind: ArchiveRecordKind;
  decision: ArchiveDecision;
}

export type WriteOutcome = { ok: true } | { ok: false; message: string };

export interface ArchiveSweepDeps {
  /** One row, one request. Adds the owner column itself. */
  insertRow: (table: ArchiveTable, row: Record<string, unknown>) => Promise<InsertRowOutcome>;
  updateRow: (table: ArchiveTable, id: string, patch: Record<string, unknown>) => Promise<WriteOutcome>;
  /** The type of each campaign place the DM linked a page to, which decides whether an interior page may sit under it. */
  locationTypes: (ids: readonly string[]) => Promise<ReadonlyMap<string, LocationType>>;
}

export interface ArchiveSweepInput {
  campaignId: string;
  entries: readonly ArchiveSweepEntry[];
  /** Every page of the export, including skipped and ignored ones: a link is resolved against all of them. */
  allPages: readonly ArchivePage[];
}

export type ArchiveSweepPhase = "creating" | "linking";
export interface ArchiveSweepProgress {
  phase: ArchiveSweepPhase;
  done: number;
  total: number;
}

export interface ArchiveKindOutcome {
  created: number;
  linked: number;
  ignored: number;
  failed: number;
  /** The plan's limit stopped this kind; the rows after the refusal were not tried. */
  stoppedAtQuota: boolean;
}

export interface ArchiveRowFailure {
  ref: string;
  title: string;
  kind: ArchiveRecordKind;
  message: string;
}

export interface UnresolvedArchiveLink {
  /** Title of the page whose body holds the link. */
  page: string;
  target: string;
  reason: string;
}

export interface ArchiveCreatedRecord {
  ref: string;
  kind: ArchiveRecordKind;
  id: string;
}

export interface ArchiveSweepReport {
  perKind: Record<ArchiveRecordKind, ArchiveKindOutcome>;
  failures: ArchiveRowFailure[];
  unresolvedLinks: UnresolvedArchiveLink[];
  /** Adjustments made on the way ("imported as Other"). */
  notes: string[];
  /** Rows this sweep created, so the result screen can offer them to the AI pass. */
  created: ArchiveCreatedRecord[];
}

type MentionType = ArchiveMentionTarget["entityType"];
interface RegistryEntry {
  id: string;
  kind: ArchiveRecordKind;
  entityType: MentionType | null;
  locationType: LocationType | null;
}

const MENTION_TYPE: Partial<Record<ArchiveRecordKind, MentionType>> = { npc: "npc", location: "location", faction: "faction" };

/** The order rows are created in. Places go parent-first within their own turn. */
export const ARCHIVE_CREATE_ORDER: readonly ArchiveRecordKind[] = ["location", "faction", "npc", "item", "quest", "note"];

const KIND_NOUN: Record<ArchiveRecordKind, string> = {
  npc: "an NPC",
  location: "a place",
  faction: "a faction",
  item: "an item",
  quest: "a quest",
  note: "a note",
};

function emptyOutcome(): ArchiveKindOutcome {
  return { created: 0, linked: 0, ignored: 0, failed: 0, stoppedAtQuota: false };
}

/** Places first by their own parent chain: a page's parent, when it is also a place being created, goes before it. Cycles are broken at the point they close. */
function orderPlacesParentsFirst(places: readonly ArchiveSweepEntry[]): ArchiveSweepEntry[] {
  const byRef = new Map(places.map((entry) => [entry.page.ref, entry] as const));
  const done = new Set<string>();
  const visiting = new Set<string>();
  const ordered: ArchiveSweepEntry[] = [];
  const visit = (entry: ArchiveSweepEntry): void => {
    const ref = entry.page.ref;
    if (done.has(ref) || visiting.has(ref)) return;
    visiting.add(ref);
    const parent = entry.page.parentRef ? byRef.get(entry.page.parentRef) : undefined;
    if (parent) visit(parent);
    visiting.delete(ref);
    done.add(ref);
    ordered.push(entry);
  };
  for (const entry of places) visit(entry);
  return ordered;
}

export async function runArchiveSweep(
  input: ArchiveSweepInput,
  deps: ArchiveSweepDeps,
  onProgress?: (progress: ArchiveSweepProgress) => void,
): Promise<ArchiveSweepReport> {
  const { campaignId, entries, allPages } = input;
  const report: ArchiveSweepReport = {
    perKind: { npc: emptyOutcome(), location: emptyOutcome(), faction: emptyOutcome(), item: emptyOutcome(), quest: emptyOutcome(), note: emptyOutcome() },
    failures: [],
    unresolvedLinks: [],
    notes: [],
    created: [],
  };
  const registry = new Map<string, RegistryEntry>();

  // ── linked and ignored pages are settled before anything is written ─────
  const toCreate: ArchiveSweepEntry[] = [];
  const linkedPlaceIds: string[] = [];
  for (const entry of entries) {
    const outcome = report.perKind[entry.kind];
    if (entry.decision.action === "ignore") {
      outcome.ignored++;
    } else if (entry.decision.action === "link") {
      outcome.linked++;
      const { targetId, source } = entry.decision.candidate;
      // A library row is a reference and is never the target of a mention or a parent.
      const entityType = source === "campaign" ? (MENTION_TYPE[entry.kind] ?? null) : null;
      registry.set(entry.page.ref, { id: targetId, kind: entry.kind, entityType, locationType: null });
      if (entry.kind === "location" && source === "campaign") linkedPlaceIds.push(targetId);
    } else {
      toCreate.push(entry);
    }
  }
  if (linkedPlaceIds.length > 0) {
    const types = await deps.locationTypes(linkedPlaceIds);
    for (const reg of registry.values()) {
      if (reg.kind === "location") reg.locationType = types.get(reg.id) ?? null;
    }
  }

  // ── pass 1: create ───────────────────────────────────────────────────────
  const total = toCreate.length;
  let done = 0;
  const tick = (): void => onProgress?.({ phase: "creating", done, total });
  tick();

  const created = new Map<string, { entry: ArchiveSweepEntry; id: string; beatId: string | null }>();

  for (const kind of ARCHIVE_CREATE_ORDER) {
    const ofKind = toCreate.filter((entry) => entry.kind === kind);
    const ordered = kind === "location" ? orderPlacesParentsFirst(ofKind) : ofKind;
    const outcome = report.perKind[kind];

    for (const entry of ordered) {
      done++;
      if (outcome.stoppedAtQuota) {
        // Not tried: the limit that refused the row before it applies to this one too.
        outcome.failed++;
        report.failures.push({ ref: entry.page.ref, title: entry.page.title, kind, message: "Your plan's limit was reached before this one." });
        tick();
        continue;
      }
      const parent = entry.page.parentRef ? registry.get(entry.page.parentRef) : undefined;
      const parentPlace = parent && parent.kind === "location" ? parent : undefined;
      const built = buildRecordRow(entry.page, kind, {
        campaignId,
        parentLocationId: kind === "location" || kind === "npc" ? (parentPlace?.id ?? null) : null,
        parentLocationType: parentPlace?.locationType ?? null,
      });
      report.notes.push(...built.notes);

      const result = await deps.insertRow(TABLE_FOR_KIND[kind], built.row);
      if (result.status === "quota_exceeded") {
        outcome.stoppedAtQuota = true;
        outcome.failed++;
        report.failures.push({ ref: entry.page.ref, title: entry.page.title, kind, message: "Your plan's limit was reached." });
        tick();
        continue;
      }
      if (result.status === "failed") {
        outcome.failed++;
        report.failures.push({ ref: entry.page.ref, title: entry.page.title, kind, message: result.message });
        tick();
        continue;
      }

      outcome.created++;
      const placeType = kind === "location" ? ((built.row.location_type as LocationType | undefined) ?? "other") : null;
      registry.set(entry.page.ref, { id: result.id, kind, entityType: MENTION_TYPE[kind] ?? null, locationType: placeType });
      report.created.push({ ref: entry.page.ref, kind, id: result.id });

      let beatId: string | null = null;
      if (kind === "quest") {
        const fields = fieldsForKind(entry.page, "quest");
        if (fields.kind === "quest" && fields.beatContent) {
          const beat = await deps.insertRow("quest_beats", openingBeatRow(result.id, campaignId, entry.page.title, fields.beatContent));
          if (beat.status === "inserted") beatId = beat.id;
          else {
            report.failures.push({
              ref: entry.page.ref,
              title: entry.page.title,
              kind,
              message: `The quest was created but its prose was not saved${beat.status === "failed" ? `: ${beat.message}` : ": your plan's limit was reached"}.`,
            });
          }
        }
      }
      created.set(entry.page.ref, { entry, id: result.id, beatId });
      tick();
    }
  }

  // ── pass 2: links become mentions ───────────────────────────────────────
  const withLinks = [...created.values()].filter(({ entry }) =>
    docColumnsOf(fieldsForKind(entry.page, entry.kind)).some((c) => hasLinks(c.doc)),
  );
  const seenUnresolved = new Set<string>();
  const noteUnresolved = (page: ArchivePage, target: string, reason: string): void => {
    const key = `${page.ref}\u0000${target}`;
    if (seenUnresolved.has(key)) return;
    seenUnresolved.add(key);
    report.unresolvedLinks.push({ page: page.title, target, reason });
  };

  let linkDone = 0;
  onProgress?.({ phase: "linking", done: linkDone, total: withLinks.length });
  for (const { entry, id, beatId } of withLinks) {
    const resolve = (target: string): ArchiveMentionTarget | null => {
      const hit = findPageForLink(target, allPages);
      if (!hit) {
        noteUnresolved(entry.page, target, "not found in this export");
        return null;
      }
      const reg = registry.get(hit.ref);
      if (!reg) {
        noteUnresolved(entry.page, target, "that page was not imported");
        return null;
      }
      if (!reg.entityType) {
        noteUnresolved(entry.page, target, `${KIND_NOUN[reg.kind]} cannot be mentioned`);
        return null;
      }
      return { id: reg.id, entityType: reg.entityType };
    };

    const patches = new Map<string, { id: string; table: ArchiveTable; patch: Record<string, unknown> }>();
    for (const column of docColumnsOf(fieldsForKind(entry.page, entry.kind))) {
      if (!hasLinks(column.doc)) continue;
      const targetId = column.table === "quest_beats" ? beatId : id;
      if (!targetId) continue;
      const key = `${column.table}:${targetId}`;
      const resolved = storedDoc(column.doc, resolve);
      // Nothing resolved to a mention: the first pass already wrote exactly this text.
      if (resolved === storedDoc(column.doc, () => null)) continue;
      const slot = patches.get(key) ?? { id: targetId, table: column.table, patch: {} };
      slot.patch[column.column] = resolved;
      patches.set(key, slot);
    }
    for (const { id: rowId, table, patch } of patches.values()) {
      const result = await deps.updateRow(table, rowId, patch);
      if (!result.ok) {
        report.failures.push({
          ref: entry.page.ref,
          title: entry.page.title,
          kind: entry.kind,
          message: `Its links to other pages could not be saved: ${result.message}`,
        });
      }
    }
    linkDone++;
    onProgress?.({ phase: "linking", done: linkDone, total: withLinks.length });
  }

  return report;
}
