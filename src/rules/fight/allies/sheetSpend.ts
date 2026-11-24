// What a fight took from an ally's sheet in one batch, as a change rather than as the sheet's new values (#1264).
// Pure and edge-importable (relative `.ts` imports only).
//
// A batch reads the sheet once, spends from it in memory (`settleSlotSpend`, `settleInnateSpend`, `settleFeatureSpend`), and is
// written after the fight is saved. Writing the lists as they then stood would put back the sheet as the fight read it: a slot
// the player marked on their own sheet in between would be undone. So the server is sent what was spent, and applies it to the
// sheet as it is at that moment (`public.spend_from_sheet`), once per batch and member, so a retried write lands once.

import type { PlayerSheets } from "../playerSheet.ts";

/** The parts of the sheets a fight spends from, as they were read: kept before anything is spent from them. */
export interface SheetsRead {
  members: Array<Pick<PlayerSheets["members"][number], "id" | "spell_slots" | "class_resources">>;
  spells: Array<Pick<PlayerSheets["casting"]["spells"][number], "id" | "party_member_id" | "uses_remaining">>;
}

/** One kind of slot spent: `count` of the slots at `level` in `pool` (the entry's own pool, null for a row that names none). */
export interface SlotSpend {
  level: number;
  pool: string | null;
  count: number;
}

/**
 * Uses spent from one `class_resources` pool. `fresh` is the entry with every use left, for a sheet that has never stored the pool
 * (a feature's pool is written the first time it is spent).
 */
export interface ResourceSpend {
  key: string;
  count: number;
  fresh: Record<string, unknown> & { current: number; max: number };
}

/** Uses spent from one daily-limited innate grant (`character_spells.uses_remaining`). */
export interface InnateUseSpend {
  spellRowId: string;
  count: number;
}

/** Everything a batch spent from one ally's sheet. */
export interface SheetSpend {
  memberId: string;
  slots: SlotSpend[];
  resources: ResourceSpend[];
  innate: InnateUseSpend[];
}

/** A copy of what `sheetSpends` compares against, taken when the sheets are read and before anything is spent from them. */
export function sheetsRead(sheets: PlayerSheets): SheetsRead {
  return structuredClone({
    members: sheets.members.map((m) => ({ id: m.id, spell_slots: m.spell_slots, class_resources: m.class_resources })),
    spells: sheets.casting.spells.map((r) => ({ id: r.id, party_member_id: r.party_member_id, uses_remaining: r.uses_remaining })),
  });
}

/** What was spent from each member's sheet between `read` and `now`; a member nothing was spent from is left out. */
export function sheetSpends(read: SheetsRead, now: PlayerSheets): SheetSpend[] {
  const out: SheetSpend[] = [];
  for (const before of read.members) {
    const after = now.members.find((m) => m.id === before.id);
    if (after === undefined) continue;
    const slots = slotSpends(before.spell_slots, after.spell_slots);
    const resources = resourceSpends(storedPools(before.class_resources), storedPools(after.class_resources));
    const innate = read.spells.flatMap((was): InnateUseSpend[] => {
      if (was.party_member_id !== before.id || was.uses_remaining === null) return [];
      const left = now.casting.spells.find((r) => r.id === was.id)?.uses_remaining;
      return left === undefined || left === null || left >= was.uses_remaining ? [] : [{ spellRowId: was.id, count: was.uses_remaining - left }];
    });
    if (slots.length + resources.length + innate.length > 0) out.push({ memberId: before.id, slots, resources, innate });
  }
  return out;
}

type Slots = SheetsRead["members"][number]["spell_slots"];

/** The slots marked used since the read, by level and pool (a spend replaces the list entry for entry, so the indexes line up). */
function slotSpends(before: Slots, after: Slots): SlotSpend[] {
  const out: SlotSpend[] = [];
  after.forEach((slot, i) => {
    const was = before[i];
    if (was === undefined || slot.used <= was.used) return;
    const pool = slot.pool === undefined ? null : slot.pool;
    const same = out.find((s) => s.level === slot.level && s.pool === pool);
    if (same) same.count += slot.used - was.used;
    else out.push({ level: slot.level, pool, count: slot.used - was.used });
  });
  return out;
}

type Resources = NonNullable<SheetsRead["members"][number]["class_resources"]>;

/** A sheet row read without `class_resources` has no pool stored, which the sheet reads as every pool full (`PlayerSheetRow`). */
const storedPools = (resources: Resources | undefined): Resources => (resources === undefined ? {} : resources);

/** The uses taken from each pool since the read; a pool first written by the spend counts from full. */
function resourceSpends(before: Resources, after: Resources): ResourceSpend[] {
  return Object.entries(after).flatMap(([key, entry]): ResourceSpend[] => {
    const was = Object.hasOwn(before, key) ? before[key].current : entry.max;
    if (entry.current >= was) return [];
    return [{ key, count: was - entry.current, fresh: { ...entry, current: entry.max } }];
  });
}
