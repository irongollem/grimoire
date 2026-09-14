import type { BulkScopeTable } from "@/composables/campaign/useBulkCampaignScope";

/**
 * The copy-to-campaign planner (#598, wave 1) — pure and Supabase-free so it can
 * be unit tested without mocking a client. `useCopyToCampaign.ts` does the
 * fetching this needs (source rows, referenced rows) and the actual insert;
 * this module only decides what the copy's row should look like.
 *
 * ## The visibility rule
 *
 * A referenced row travels with the copy when the target campaign can see it —
 * that is, when its `campaign_id` is NULL (general, visible everywhere) or equal
 * to the target campaign. A row scoped to some other campaign is dropped and
 * named. A reference whose row the copying account cannot read at all (absent
 * from `referenced` — RLS hid it, not just campaign scope) is also dropped.
 *
 * Library slugs (`species.granted_spells[].spell_id` may hold one) are shared
 * content, not a user's row: they always travel and are never looked up.
 *
 * ## No suffix
 *
 * The three existing same-scope duplicate actions — `ItemDetail.vue`'s
 * `cloneItem()` (appends " - Clone"), `MonsterDetail.vue`'s `duplicate()`
 * (appends " (copy)"), `ClassList.vue`'s `duplicate()` — all spread a row
 * client-side and create it in the *same* scope, where the original and the
 * copy now sit side by side and need a name that tells them apart. A copy to
 * another campaign answers a different question: it lands somewhere the
 * original is not, so nothing needs telling apart, and the name is free. Do not
 * add a suffix here — that would be solving a problem this feature doesn't have.
 */

/** A row the copy points at, as seen from the copying account. */
export interface ReferencedRow {
  id: string;
  name: string;
  campaignId: string | null;
}

/** One reference that could not travel. */
export interface DroppedReference {
  /** Human label for the reference, e.g. "Linked spells". */
  label: string;
  /** Names of the rows left behind, in row order. */
  names: string[];
  /** True when whole list entries were removed rather than a field cleared. */
  removedEntries: boolean;
}

export interface CopyPlan {
  /** Insert payload for the target table. */
  payload: Record<string, unknown>;
  dropped: DroppedReference[];
}

// ── Small shape helpers ─────────────────────────────────────────────────────

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter(isNonEmptyString) : [];
}

function unknownArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/**
 * Mirrors the discriminator `supabase/checks/content_integrity.sql:158-165`
 * uses to tell a user row's uuid from a shared-content slug (`srd_owlbear`):
 * a user row's id starts with 8 hex chars and a dash. Anything else is a
 * library slug — never looked up in a user table, always travels.
 */
const USER_ROW_ID = /^[0-9a-f]{8}-/i;
function isUserRowId(value: string): boolean {
  return USER_ROW_ID.test(value);
}

function isVisible(
  refId: string,
  targetCampaignId: string | null,
  referenced: ReadonlyMap<string, ReferencedRow>,
): boolean {
  const row = referenced.get(refId);
  if (!row) return false;
  return row.campaignId === null || row.campaignId === targetCampaignId;
}

/** Display name for a dropped reference. `referenced` may not carry a name for
 *  an id the copying account cannot read at all — RLS hid the row, not just
 *  campaign scope — so that case gets a placeholder rather than an empty string
 *  standing in for "we don't know." */
function referenceName(id: string, referenced: ReadonlyMap<string, ReferencedRow>): string {
  const row = referenced.get(id);
  if (row) return row.name;
  return "a row you no longer have access to";
}

/** `species.granted_spells[].spell_id` on an object element, or the bare id on
 *  a legacy string element (`content_integrity.sql`'s "may be a bare string
 *  instead of an object" case). Null for a free player pick or malformed entry. */
function grantedSpellId(entry: unknown): string | null {
  if (typeof entry === "string") return entry || null;
  if (entry && typeof entry === "object" && "spell_id" in entry) {
    const id = (entry as { spell_id?: unknown }).spell_id;
    return isNonEmptyString(id) ? id : null;
  }
  return null;
}

function filterArrayRef(
  ids: readonly string[],
  targetCampaignId: string | null,
  referenced: ReadonlyMap<string, ReferencedRow>,
): { kept: string[]; droppedNames: string[] } {
  const kept: string[] = [];
  const droppedNames: string[] = [];
  for (const id of ids) {
    if (isVisible(id, targetCampaignId, referenced)) kept.push(id);
    else droppedNames.push(referenceName(id, referenced));
  }
  return { kept, droppedNames };
}

function clearScalarRef(
  payload: Record<string, unknown>,
  column: string,
  targetCampaignId: string | null,
  referenced: ReadonlyMap<string, ReferencedRow>,
  label: string,
  dropped: DroppedReference[],
): void {
  const id = payload[column];
  if (!isNonEmptyString(id)) return;
  if (isVisible(id, targetCampaignId, referenced)) return;
  payload[column] = null;
  dropped.push({ label, names: [referenceName(id, referenced)], removedEntries: false });
}

/** Tables whose rows carry `source_document_key`/`source_record_key`/
 *  `source_revision` and therefore a `<table>_source_identity_unique` index on
 *  `(user_id, source_document_key, source_record_key)` — not scoped by
 *  campaign_id, so carrying these onto a copy of an imported row raises 23505.
 *  The copy is a fork of the import, not the import itself. */
const SOURCE_IDENTITY_TABLES = new Set<BulkScopeTable>(["items", "spells", "monsters", "species"]);

// ── referencedIds ────────────────────────────────────────────────────────────

/**
 * Which ids to look up, and in which table, before planning a copy of this
 * row. Keyed by referenced table name so the caller can batch one `.in()`
 * lookup per target table across a whole selection.
 *
 * `puzzle_rooms.player_visible_to` is deliberately absent — it names the
 * *source* campaign's party members, a categorical clear rather than a
 * dangling-reference case (see `buildCopyPlan`), so it is never looked up.
 */
export function referencedIds(table: BulkScopeTable, row: Record<string, unknown>): Record<string, string[]> {
  switch (table) {
    case "items": {
      const ids = stringArray(row.spell_ids);
      return ids.length ? { spells: ids } : {};
    }
    case "monsters": {
      const id = row.lair_location_id;
      return isNonEmptyString(id) ? { locations: [id] } : {};
    }
    case "species": {
      const ids = unknownArray(row.granted_spells)
        .map(grantedSpellId)
        .filter((id): id is string => id !== null && isUserRowId(id));
      return ids.length ? { spells: ids } : {};
    }
    case "puzzle_rooms": {
      const out: Record<string, string[]> = {};
      if (isNonEmptyString(row.location_id)) out.locations = [row.location_id];
      if (isNonEmptyString(row.dungeon_feature_id)) out.dungeon_features = [row.dungeon_feature_id];
      return out;
    }
    case "loot_tables": {
      const out: Record<string, string[]> = {};
      const monsterIds = stringArray(row.monster_ids);
      if (monsterIds.length) out.monsters = monsterIds;
      const itemIds = unknownArray(row.entries)
        .map((e) => (e && typeof e === "object" ? (e as Record<string, unknown>) : null))
        .filter((e): e is Record<string, unknown> => e !== null && (e.type ?? "item") === "item")
        .map((e) => e.item_id)
        .filter(isNonEmptyString);
      if (itemIds.length) out.items = itemIds;
      return out;
    }
    case "roll_tables": {
      const ids = unknownArray(row.entries)
        .map((e) => (e && typeof e === "object" ? (e as Record<string, unknown>).encounter_id : undefined))
        .filter(isNonEmptyString);
      return ids.length ? { encounters: ids } : {};
    }
    case "spells":
    case "traps":
      return {};
  }
}

/**
 * Shared-library ids this row points at, keyed by the library table that holds
 * them. Deliberately separate from `referencedIds` above, because a library row
 * is a different kind of thing: it belongs to no campaign, so it can never
 * dangle and is never dropped.
 *
 * It can still fail to resolve, though. A campaign sees a library source only
 * once the DM has enabled it (`campaign_enabled_sources`), so a species copied
 * into a campaign that has not enabled, say, Kobold Press arrives granting a
 * spell that campaign cannot look up. #598's acceptance criteria call for that
 * to be *reported, not silently broken* — and reporting is the right verb
 * rather than dropping, because the fix is one toggle in the target campaign's
 * settings and silently losing the grant would be the worse outcome.
 *
 * Only `species.granted_spells[].spell_id` can hold a library slug among the
 * eight tables; `items.spell_ids` and `loot_tables.monster_ids` are `uuid[]`
 * and cannot hold one by construction.
 */
export function libraryReferencedIds(table: BulkScopeTable, row: Record<string, unknown>): Record<string, string[]> {
  if (table !== "species") return {};
  const slugs = unknownArray(row.granted_spells)
    .map(grantedSpellId)
    .filter((id): id is string => id !== null && !isUserRowId(id));
  return slugs.length ? { library_spells: slugs } : {};
}

// ── buildCopyPlan ────────────────────────────────────────────────────────────

export function buildCopyPlan(
  table: BulkScopeTable,
  row: Record<string, unknown>,
  targetCampaignId: string | null,
  userId: string,
  referenced: ReadonlyMap<string, ReferencedRow>,
): CopyPlan {
  const dropped: DroppedReference[] = [];
  // Image columns (image_url, mundane_image_url, focal points, …) are carried
  // through unchanged by this spread: both campaigns belong to the same
  // account, so the copy references the same storage object rather than
  // duplicating the file, and nothing is ever written under the `srd/` prefix.
  // This is only sound while both campaigns share an owner — if campaigns ever
  // become shareable across accounts, a copy would have to duplicate the
  // object, because the original owner deleting it would break the copy.
  const payload: Record<string, unknown> = { ...row };

  // A copy is a new row — never the source's identity or timestamps.
  delete payload.id;
  delete payload.created_at;
  delete payload.updated_at;

  if (SOURCE_IDENTITY_TABLES.has(table)) {
    delete payload.source_document_key;
    delete payload.source_record_key;
    delete payload.source_revision;
  }

  if (table === "items") {
    // Trigger-owned (items_touch_content_updated_at) — never write it from the client.
    delete payload.content_updated_at;
  }

  payload.campaign_id = targetCampaignId;
  // The copying account owns its copy, not the source row's owner — a co-DM
  // copying the campaign owner's row must end up owning the copy, and RLS
  // requires auth.uid() = user_id on insert.
  payload.user_id = userId;

  switch (table) {
    case "items": {
      const { kept, droppedNames } = filterArrayRef(stringArray(row.spell_ids), targetCampaignId, referenced);
      payload.spell_ids = kept;
      if (droppedNames.length) {
        dropped.push({ label: "Linked spells", names: droppedNames, removedEntries: false });
      }
      break;
    }
    case "monsters": {
      clearScalarRef(payload, "lair_location_id", targetCampaignId, referenced, "Lair location", dropped);
      break;
    }
    case "species": {
      // A grant that loses its spell is removed, never blanked. `spell_id:
      // null` is NOT absence on this type — `SpeciesSpellGrant` in
      // species.types.ts documents it as "free player pick (e.g. High Elf
      // cantrip)". Nulling the field would therefore turn "this species grants
      // Chill Touch at level 1" into "the player picks any spell at level 1",
      // a materially more generous rule that reads as intentional on the
      // copy's editor and would only surface at a table, mid-level-up. The
      // same reasoning as the loot entry below: when a field's absence already
      // means something else, the entry goes rather than the field.
      const grants = unknownArray(row.granted_spells);
      const droppedNames: string[] = [];
      const nextGrants = grants.filter((el) => {
        const id = grantedSpellId(el);
        // Slug, free pick (null), or malformed entry — always travels unchanged.
        if (id === null || !isUserRowId(id)) return true;
        if (isVisible(id, targetCampaignId, referenced)) return true;
        droppedNames.push(referenceName(id, referenced));
        return false;
      });
      payload.granted_spells = nextGrants;
      if (droppedNames.length) {
        dropped.push({ label: "Granted spells", names: droppedNames, removedEntries: true });
      }
      break;
    }
    case "puzzle_rooms": {
      clearScalarRef(payload, "location_id", targetCampaignId, referenced, "Location", dropped);
      clearScalarRef(payload, "dungeon_feature_id", targetCampaignId, referenced, "Dungeon feature", dropped);
      // Categorical, not a dangling-reference case: player_visible_to names the
      // SOURCE campaign's party members, who are not members of the target
      // campaign at all — there is nothing here for the DM to be told they
      // lost, so it is cleared silently and never appears in `dropped`.
      // is_shared follows it to stay in lockstep, per the column's own
      // docstring in src/types/puzzle.types.ts: "shared ⇔ the audience is
      // non-empty."
      payload.player_visible_to = [];
      payload.is_shared = false;
      break;
    }
    case "loot_tables": {
      const { kept, droppedNames } = filterArrayRef(stringArray(row.monster_ids), targetCampaignId, referenced);
      payload.monster_ids = kept;
      if (droppedNames.length) {
        dropped.push({ label: "Linked monsters", names: droppedNames, removedEntries: false });
      }

      const entries = unknownArray(row.entries).map((e) =>
        e && typeof e === "object" ? (e as Record<string, unknown>) : e,
      );
      const removedItemNames: string[] = [];
      const nextEntries = entries.filter((entry) => {
        if (!entry || typeof entry !== "object") return true;
        const rec = entry as Record<string, unknown>;
        if ((rec.type ?? "item") !== "item") return true;
        const itemId = rec.item_id;
        if (!isNonEmptyString(itemId)) return true; // already invalid — not this planner's problem
        if (isVisible(itemId, targetCampaignId, referenced)) return true;
        // validateEntries (src/types/lootTable.types.ts:139) rejects an item
        // entry with no item_id, so clearing the field the way a scalar FK does
        // would just move the save-time rejection here. The entry is removed
        // outright instead — the one bespoke case in this planner.
        removedItemNames.push(referenceName(itemId, referenced));
        return false;
      });
      payload.entries = nextEntries;
      if (removedItemNames.length) {
        dropped.push({ label: "Loot entries", names: removedItemNames, removedEntries: true });
      }
      break;
    }
    case "roll_tables": {
      const droppedNames: string[] = [];
      const nextEntries = unknownArray(row.entries).map((entry) => {
        if (!entry || typeof entry !== "object") return entry;
        const rec = entry as Record<string, unknown>;
        const encId = rec.encounter_id;
        if (!isNonEmptyString(encId)) return entry;
        if (isVisible(encId, targetCampaignId, referenced)) return entry;
        droppedNames.push(referenceName(encId, referenced));
        // A RollTableEntry's `label` reads on its own without its encounter
        // (rollTable.types.ts) — only the link is cleared, the entry stays.
        return { ...rec, encounter_id: null };
      });
      payload.entries = nextEntries;
      if (droppedNames.length) {
        dropped.push({ label: "Linked encounters", names: droppedNames, removedEntries: false });
      }
      break;
    }
    case "spells":
    case "traps":
      break; // no cross-entity references
  }

  return { payload, dropped };
}
