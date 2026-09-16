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
 * add a suffix here -- that would be solving a problem this feature doesn't have.
 *
 * ## Copying a batch (#885)
 *
 * The eight tables above only point outward, at other tables, so a strictly
 * per-row planner was enough. NPCs and factions point at each other, mostly
 * through join tables (npc_relationships, faction_relations, faction_npcs,
 * faction_locations, faction_items, faction_deities) rather than columns, so
 * copying more than one at a time needs to see the whole batch, not one row.
 *
 * The nearest prior art is src/lib/locations/cloneLevel.ts, which expresses a
 * clone's internal relationships by *source* id and leaves resolving them to
 * its executor, because at planning time it has no ids for rows it hasn't
 * created yet. This module can do better, because it controls its own insert
 * payloads: buildCopySetPlan mints a uuid per copied row with
 * crypto.randomUUID() before anything is inserted, so a source-to-copy id map
 * exists at planning time. buildCopyPlan gained an optional idMap parameter so
 * a mint can be threaded in -- the eight original tables never pass one, so
 * their behaviour is exactly what it was.
 *
 * One rule covers every reference a batch touches, column or join row alike:
 *
 * 1. Points at a row in this batch -- rewrite to that row's minted id.
 * 2. Points at a row outside the batch -- the visibility rule above,
 *    unchanged: travels if the target campaign can see it, otherwise dropped
 *    and named.
 * 3. A join row travels only when both endpoints resolve by rule 1 or 2 -- a
 *    membership with one end missing is not a membership.
 *
 * npc_inventory is the one join table where an endpoint is a scalar reference
 * rather than the row's own identity: an inventory entry has its own name and
 * quantity, so a dangling item_id clears the field (rule 2, field-level, same
 * as clearScalarRef below) rather than dropping the whole entry. Every other
 * join table's two columns ARE the membership, so either one failing drops
 * the row (rule 3).
 *
 * Four tables never travel with a copy, because they record what happened at
 * a table rather than what the table is: npc_pc_notes, npc_player_notes,
 * player_npc_ratings, npc_favors -- the same "never state or loot" line
 * cloneLevel.ts draws for a cloned level's rooms. faction_party_members never
 * travels either: a party belongs to a campaign, not to a copy of one.
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
  /**
   * Singular/plural noun for one dropped entry — e.g. `{ singular: "granted
   * spell", plural: "granted spells" }`. Only rendered when `removedEntries`
   * is true (a whole-entry-count message needs its own noun to pluralise; a
   * field-cleared message reads off `label` and `names` instead), but set at
   * every producer below regardless, so the type never carries an
   * entry-shaped field that only half the producers remember to fill in.
   */
  entryNoun: { singular: string; plural: string };
  /**
   * Why the row could not travel, when the answer is not the ordinary one.
   *
   * Absent means the visibility rule (rule 2 in the module docstring): the row
   * points at something the target campaign cannot see. That is every producer
   * in this module but one, which is why it is absent rather than required --
   * unlike `entryNoun` above, absence here has a single, stated meaning rather
   * than being a field half the producers forgot.
   *
   * `"needs-campaign"` is the exception: a row in a join table whose own
   * `campaign_id` is NOT NULL (`JOIN_TABLES_REQUIRING_CAMPAIGN`) cannot exist
   * in the general scope at all, whatever it points at. Telling the DM their
   * inventory line "points at rows the target campaign cannot see" would be a
   * wrong explanation for a right outcome, and a wrong explanation is worse
   * than a terse one -- it sends them looking for a visibility problem that is
   * not there.
   */
  reason?: "needs-campaign";
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
  dropped.push({
    label,
    names: [referenceName(id, referenced)],
    removedEntries: false,
    entryNoun: { singular: label.toLowerCase(), plural: `${label.toLowerCase()}s` },
  });
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
 * `puzzle_rooms.player_visible_to`, `npcs.player_visible_to` and
 * `factions.player_visible_to` are all deliberately absent — each names the
 * *source* campaign's party members, a categorical clear rather than a
 * dangling-reference case (see `buildCopyPlan`), so none of them is ever
 * looked up.
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
    case "npcs": {
      const out: Record<string, string[]> = {};
      if (isNonEmptyString(row.location_id)) out.locations = [row.location_id];
      if (isNonEmptyString(row.linked_monster_id)) out.monsters = [row.linked_monster_id];
      if (isNonEmptyString(row.scriptorium_doc_id)) out.scriptorium_documents = [row.scriptorium_doc_id];
      return out;
    }
    case "factions":
      // Factions have no reference columns at all — every relationship a
      // faction holds lives in a join table (npc/faction membership, faction
      // relations), which `joinRowReferencedIds` covers instead.
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
  /**
   * source row id → minted copy id, from `buildCopySetPlan`. Only a batch copy
   * supplies this — the eight original tables never do, so `delete payload.id`
   * below still runs for them exactly as it always has and Postgres still
   * mints their id. When present, it means this row's copy id was already
   * decided before planning started, because something else in the same batch
   * (a join row, another row's own reference) needs to be able to name it.
   */
  idMap?: ReadonlyMap<string, string>,
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

  // A copy is a new row — never the source's identity or timestamps. Its id is
  // usually Postgres's to mint (delete and let the insert assign one); a batch
  // copy is the exception, because a same-batch reference has to be able to
  // name this row's copy before the insert has even run — see `idMap` above.
  const sourceId = row.id;
  const mintedId = idMap && isNonEmptyString(sourceId) ? idMap.get(sourceId) : undefined;
  if (mintedId) payload.id = mintedId;
  else delete payload.id;
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
        dropped.push({
          label: "Linked spells",
          names: droppedNames,
          removedEntries: false,
          entryNoun: { singular: "linked spell", plural: "linked spells" },
        });
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
        dropped.push({
          label: "Granted spells",
          names: droppedNames,
          removedEntries: true,
          entryNoun: { singular: "granted spell", plural: "granted spells" },
        });
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
        dropped.push({
          label: "Linked monsters",
          names: droppedNames,
          removedEntries: false,
          entryNoun: { singular: "linked monster", plural: "linked monsters" },
        });
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
        dropped.push({
          label: "Loot entries",
          names: removedItemNames,
          removedEntries: true,
          entryNoun: { singular: "loot entry", plural: "loot entries" },
        });
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
        dropped.push({
          label: "Linked encounters",
          names: droppedNames,
          removedEntries: false,
          entryNoun: { singular: "linked encounter", plural: "linked encounters" },
        });
      }
      break;
    }
    case "spells":
    case "traps":
      break; // no cross-entity references
    case "npcs": {
      clearScalarRef(payload, "location_id", targetCampaignId, referenced, "Location", dropped);
      clearScalarRef(payload, "linked_monster_id", targetCampaignId, referenced, "Linked monster", dropped);
      clearScalarRef(payload, "scriptorium_doc_id", targetCampaignId, referenced, "Linked document", dropped);
      // Categorical, not a dangling-reference case — same reasoning as
      // puzzle_rooms above: player_visible_to names the SOURCE campaign's
      // party members, who are not members of the target campaign at all, so
      // it is cleared silently and never appears in `dropped`. is_revealed
      // follows it in lockstep: it is the disguise-reveal flag that sits with
      // disguise_name/disguise_portrait_url (npc.types.ts:222-225), and no
      // player in the target campaign has ever met this NPC to have had the
      // disguise revealed to them. player_visible_fields is left alone — it
      // is the DM's authored choice of *which* fields a reveal would show,
      // not an audience, so it travels with the copy.
      payload.player_visible_to = [];
      payload.is_revealed = false;
      break;
    }
    case "factions":
      // No reference columns at all — an NPC/faction/location/item/deity
      // membership lives in a join table, not here. See `buildJoinRowPayload`.
      // player_visible_to is still cleared, though, for the same categorical
      // reason as npcs and puzzle_rooms above: it names the SOURCE campaign's
      // party members. Factions have no is_shared/is_revealed sibling to
      // follow it.
      payload.player_visible_to = [];
      break;
    default: {
      // Compile-time guard: if BulkScopeTable ever gains a member without a
      // matching case above, this line stops typechecking. The switch has no
      // runtime effect here — every branch above already `break`s into the
      // shared `return` — this default exists purely for the assignment below.
      const exhaustive: never = table;
      void exhaustive;
    }
  }

  return { payload, dropped };
}

// ── Batch copying (#885) ────────────────────────────────────────────────────
// See the module docstring's "Copying a batch" section for the three-rule
// summary this whole section implements.

/**
 * The seven join tables a batch of NPCs/factions may carry membership or
 * relationship rows from. Deliberately not a `BulkScopeTable` member — nothing
 * ever selects a join row directly to copy; it only ever rides along with the
 * entity rows its columns name.
 */
export type CopyJoinTable =
  | "npc_relationships"
  | "npc_inventory"
  | "faction_npcs"
  | "faction_locations"
  | "faction_items"
  | "faction_deities"
  | "faction_relations";

/**
 * Join tables whose own `campaign_id` is **NOT NULL** in the database, keyed to
 * the column naming the entity they hang off.
 *
 * This is not bookkeeping — it is a rule about what these rows can be. A row
 * here is scoped to one campaign by construction, so it cannot follow its owner
 * into the general scope ("available in all campaigns", `campaign_id null`):
 * there is no such thing as an inventory line belonging to every campaign at
 * once. Writing the null anyway is what the database refuses.
 *
 * Both paths that move an entity between scopes have to consult this:
 *
 *  - **copy** (`buildJoinRowPayload`) drops such a row when the target is
 *    general, and names it, rather than planning an insert Postgres will
 *    reject *after* the entity rows have already committed — which would
 *    leave a half-copied record behind a raw constraint error.
 *  - **move** (`bulkUpdateCampaignScope`) carries these rows along with their
 *    owner, and the general target is not offered for an entity that has any.
 *
 * The other four join tables (`faction_npcs`, `faction_locations`,
 * `faction_items`, `faction_relations`) carry no `campaign_id` at all — they
 * are scoped transitively through the faction — and `npc_relationships` has
 * one that is nullable, so it can legitimately go general. Verified against
 * production, not inferred from the migrations.
 */
export const JOIN_TABLES_REQUIRING_CAMPAIGN: Readonly<Partial<Record<CopyJoinTable, string>>> = {
  npc_inventory: "npc_id",
  faction_deities: "faction_id",
};

/**
 * Which join tables a batch containing this entity table might carry rows
 * from, and which column(s) to filter on: `.in(column, sourceIds)` for each
 * of `matchColumns`, where `sourceIds` are the batch's own rows for `entity`.
 * `faction_npcs` and `faction_relations` each list two match columns because a
 * source id on either side of the join still names a row this batch's copies
 * need to carry (a faction's own membership row, or its relation to another
 * faction in the same batch). The composable de-duplicates rows fetched twice
 * when a batch copies NPCs and factions together — `faction_npcs` is reachable
 * from both sides.
 */
export const JOIN_TABLES_FOR_ENTITY: Record<"npcs" | "factions", { table: CopyJoinTable; matchColumns: string[] }[]> =
  {
    npcs: [
      { table: "npc_relationships", matchColumns: ["npc_id", "related_npc_id"] },
      { table: "npc_inventory", matchColumns: ["npc_id"] },
      { table: "faction_npcs", matchColumns: ["npc_id"] },
    ],
    factions: [
      { table: "faction_npcs", matchColumns: ["faction_id"] },
      { table: "faction_locations", matchColumns: ["faction_id"] },
      { table: "faction_items", matchColumns: ["faction_id"] },
      { table: "faction_deities", matchColumns: ["faction_id"] },
      { table: "faction_relations", matchColumns: ["faction_id", "target_faction_id"] },
    ],
  };

/**
 * Which ids a join row points at, keyed by the table that holds them — the
 * same convention `referencedIds` follows, so the caller can batch one `.in()`
 * lookup per table across a whole batch's join rows. Unlike `referencedIds`,
 * a key here can itself be `"npcs"`/`"factions"`: a join row's entity columns
 * may name a row *outside* this batch (a faction membership for an NPC the DM
 * didn't select to copy), and that row still needs a `ReferencedRow` behind it
 * for the visibility rule (rule 2) to resolve.
 *
 * `library_item_id` (`npc_inventory`, `faction_items`) is deliberately absent
 * — shared content, never dangles, never looked up, same as
 * `libraryReferencedIds` above.
 */
export function joinRowReferencedIds(table: CopyJoinTable, row: Record<string, unknown>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const add = (key: string, id: unknown): void => {
    if (!isNonEmptyString(id)) return;
    out[key] = out[key] ? [...out[key], id] : [id];
  };
  switch (table) {
    case "npc_relationships":
      add("npcs", row.npc_id);
      add("npcs", row.related_npc_id);
      return out;
    case "npc_inventory":
      add("npcs", row.npc_id);
      add("items", row.item_id);
      return out;
    case "faction_npcs":
      add("factions", row.faction_id);
      add("npcs", row.npc_id);
      return out;
    case "faction_locations":
      add("factions", row.faction_id);
      add("locations", row.location_id);
      return out;
    case "faction_items":
      add("factions", row.faction_id);
      add("items", row.item_id);
      return out;
    case "faction_deities":
      add("factions", row.faction_id);
      add("deities", row.deity_id);
      return out;
    case "faction_relations":
      add("factions", row.faction_id);
      add("factions", row.target_faction_id);
      return out;
  }
}

/** Rule 1 then rule 2 for one id a join row's column names: the batch's own
 *  mint if the id is in this batch, otherwise the existing visibility rule.
 *  `null` means neither resolved it. */
function resolveEndpoint(
  id: unknown,
  idMap: ReadonlyMap<string, string>,
  targetCampaignId: string | null,
  referenced: ReadonlyMap<string, ReferencedRow>,
): string | null {
  if (!isNonEmptyString(id)) return null;
  const minted = idMap.get(id);
  if (minted) return minted;
  return isVisible(id, targetCampaignId, referenced) ? id : null;
}

/** One join row's copy, plus whatever it has to report. `dropped` can carry a
 *  report even when `payload` is non-null — `npc_inventory`'s `item_id` is a
 *  field-level drop (rule 2: the row survives, the link is cleared), not a
 *  row-level one (rule 3: `payload` is `null`). */
interface JoinRowResult {
  payload: Record<string, unknown> | null;
  dropped: {
    label: string;
    name: string;
    entryNoun: { singular: string; plural: string };
    removedEntries: boolean;
    reason?: DroppedReference["reason"];
  }[];
}

/**
 * The row-level drop `buildJoinRowPayload` returns for a `JOIN_TABLES_REQUIRING_CAMPAIGN`
 * table meeting a general-scope target ("All campaigns", `targetCampaignId`
 * null). This can never resolve no matter what either endpoint points at —
 * see the guard at the top of `buildJoinRowPayload` and this constant's own
 * docstring — so it is reported on its own terms rather than through
 * `dropRow`/`resolveRowIdentity`: the point for the DM to understand is "this
 * belongs to one campaign, and you're copying to all of them," never the
 * `23502` Postgres would have raised.
 */
function generalScopeDrop(
  table: "npc_inventory" | "faction_deities",
  row: Record<string, unknown>,
  referenced: ReadonlyMap<string, ReferencedRow>,
): JoinRowResult {
  if (table === "npc_inventory") {
    // An inventory entry carries its own free-text name (see the module
    // docstring's "npc_inventory is the one join table..." paragraph) —
    // that name identifies the dropped row far better than anything we'd
    // look up by id.
    const name = isNonEmptyString(row.name) ? row.name : "an inventory item";
    return {
      payload: null,
      dropped: [
        {
          label: "NPC inventory",
          name,
          entryNoun: { singular: "inventory item", plural: "inventory items" },
          removedEntries: true,
          reason: "needs-campaign",
        },
      ],
    };
  }
  // faction_deities carries no name of its own beyond the deity it links —
  // name it by that when we can resolve it, same as resolveRowIdentity would.
  const deityId = row.deity_id;
  const name = isNonEmptyString(deityId) ? referenceName(deityId, referenced) : "a linked deity";
  return {
    payload: null,
    dropped: [
      {
        label: "Faction deities",
        name,
        entryNoun: { singular: "deity", plural: "deities" },
        removedEntries: true,
        reason: "needs-campaign",
      },
    ],
  };
}

/**
 * Builds one join row's copy per the module docstring's "Copying a batch"
 * rules. `id`/`created_at`/`updated_at` are always Postgres's to mint —
 * nothing in a batch ever needs to name a join row's own id ahead of time
 * (only an *entity* row's id gets referenced by something else), so there is
 * no `idMap` entry for one and none is needed.
 */
function buildJoinRowPayload(
  table: CopyJoinTable,
  row: Record<string, unknown>,
  targetCampaignId: string | null,
  userId: string,
  idMap: ReadonlyMap<string, string>,
  referenced: ReadonlyMap<string, ReferencedRow>,
): JoinRowResult {
  // Rule 3, one level earlier than the endpoint checks below: a table in
  // JOIN_TABLES_REQUIRING_CAMPAIGN has its own campaign_id column NOT NULL
  // in the database, so a general-scope target has no campaign for it to
  // hold — the row cannot exist there, independent of whether npc_id/
  // faction_id/deity_id/item_id resolve. Caught here, before any payload is
  // built: the executor inserts entity rows before join rows, so letting
  // this reach Postgres would leave the already-committed entity copies
  // behind a raw not-null-violation on the join insert.
  if (targetCampaignId === null && JOIN_TABLES_REQUIRING_CAMPAIGN[table] !== undefined) {
    return generalScopeDrop(table as "npc_inventory" | "faction_deities", row, referenced);
  }

  const payload: Record<string, unknown> = { ...row };
  delete payload.id;
  delete payload.created_at;
  delete payload.updated_at;
  payload.user_id = userId;

  const dropped: JoinRowResult["dropped"] = [];

  /** Rule 3: resolve every column that is part of the row's identity before
   *  deciding anything, so a row broken on both ends still gets both named —
   *  never short-circuiting on the first failure. This used to resolve each
   *  column through its own call and push a `dropped` entry per failure, so
   *  a row failing on two columns pushed two entries under the same label,
   *  and `removedEntriesMessage` counted both — one broken *row* rendered as
   *  "2 relationships were left out." This pushes once per row instead,
   *  joining however many names failed into that one entry, so the count
   *  `buildCopySetPlan`'s collector produces matches the number of rows
   *  actually lost. */
  function resolveRowIdentity(
    columns: readonly string[],
  ): { ok: true; resolved: Record<string, string> } | { ok: false; failedNames: string[] } {
    const resolved: Record<string, string> = {};
    const failedNames: string[] = [];
    for (const column of columns) {
      const sourceId = row[column];
      const r = resolveEndpoint(sourceId, idMap, targetCampaignId, referenced);
      if (r === null) failedNames.push(isNonEmptyString(sourceId) ? referenceName(sourceId, referenced) : "an incomplete row");
      else resolved[column] = r;
    }
    return failedNames.length ? { ok: false, failedNames } : { ok: true, resolved };
  }

  /** Rule 3 for a whole row: resolve its identity columns, and on failure push
   *  exactly one `dropped` entry naming every column that failed. */
  function dropRow(
    columns: readonly string[],
    label: string,
    entryNoun: { singular: string; plural: string },
  ): Record<string, string> | null {
    const result = resolveRowIdentity(columns);
    if (result.ok) return result.resolved;
    dropped.push({ label, name: result.failedNames.join(" and "), entryNoun, removedEntries: true });
    return null;
  }

  switch (table) {
    case "npc_relationships": {
      const resolved = dropRow(
        ["npc_id", "related_npc_id"],
        "NPC relationships",
        { singular: "relationship", plural: "relationships" },
      );
      if (!resolved) return { payload: null, dropped };
      payload.campaign_id = targetCampaignId;
      payload.npc_id = resolved.npc_id;
      payload.related_npc_id = resolved.related_npc_id;
      return { payload, dropped };
    }
    case "npc_inventory": {
      const resolved = dropRow(["npc_id"], "NPC inventory", {
        singular: "inventory item",
        plural: "inventory items",
      });
      if (!resolved) return { payload: null, dropped };
      payload.campaign_id = targetCampaignId;
      payload.npc_id = resolved.npc_id;
      // item_id is a scalar reference, not the row's second endpoint — an
      // inventory entry has its own name/quantity (unlike faction_items
      // below, which has no identity beyond the item it names), so a
      // dangling link clears the field (rule 2) rather than dropping the
      // entry. library_item_id, shared content, always travels — the spread
      // above already carried it through untouched, and is never looked up.
      const itemId = row.item_id;
      if (isNonEmptyString(itemId)) {
        const resolvedItem = resolveEndpoint(itemId, idMap, targetCampaignId, referenced);
        if (resolvedItem === null) {
          payload.item_id = null;
          dropped.push({
            label: "Linked item",
            name: referenceName(itemId, referenced),
            entryNoun: { singular: "linked item", plural: "linked items" },
            removedEntries: false,
          });
        } else {
          payload.item_id = resolvedItem;
        }
      }
      return { payload, dropped };
    }
    case "faction_npcs": {
      const resolved = dropRow(["faction_id", "npc_id"], "Faction members", {
        singular: "member",
        plural: "members",
      });
      if (!resolved) return { payload: null, dropped };
      payload.faction_id = resolved.faction_id;
      payload.npc_id = resolved.npc_id;
      return { payload, dropped };
    }
    case "faction_locations": {
      const resolved = dropRow(["faction_id", "location_id"], "Faction locations", {
        singular: "location",
        plural: "locations",
      });
      if (!resolved) return { payload: null, dropped };
      payload.faction_id = resolved.faction_id;
      payload.location_id = resolved.location_id;
      return { payload, dropped };
    }
    case "faction_items": {
      // Mirrors ItemRefColumns (src/lib/itemRef.ts): at most one of item_id /
      // library_item_id is ever set. Unlike npc_inventory, a faction_items row
      // carries no name of its own beyond the item it names, so a dangling
      // item_id drops the whole row (rule 3) rather than clearing the field.
      // A library_item_id, if that is the one set instead, always travels —
      // the spread above already carried it through, and item_id being empty
      // here is not itself a failure, so it is not one of the columns checked.
      const columns = isNonEmptyString(row.item_id) ? ["faction_id", "item_id"] : ["faction_id"];
      const resolved = dropRow(columns, "Faction items", { singular: "item", plural: "items" });
      if (!resolved) return { payload: null, dropped };
      payload.faction_id = resolved.faction_id;
      if (columns.includes("item_id")) payload.item_id = resolved.item_id;
      return { payload, dropped };
    }
    case "faction_deities": {
      const resolved = dropRow(["faction_id", "deity_id"], "Faction deities", {
        singular: "deity",
        plural: "deities",
      });
      if (!resolved) return { payload: null, dropped };
      payload.campaign_id = targetCampaignId;
      payload.faction_id = resolved.faction_id;
      payload.deity_id = resolved.deity_id;
      return { payload, dropped };
    }
    case "faction_relations": {
      const resolved = dropRow(["faction_id", "target_faction_id"], "Faction relations", {
        singular: "relation",
        plural: "relations",
      });
      if (!resolved) return { payload: null, dropped };
      payload.faction_id = resolved.faction_id;
      payload.target_faction_id = resolved.target_faction_id;
      return { payload, dropped };
    }
  }
}

/**
 * Groups the report entries `buildCopyPlan`/`buildJoinRowPayload` produce
 * across a whole batch into one `DroppedReference` per label — the shape a
 * single row's `dropped` array already uses, so a batch's drop report renders
 * exactly like a single-row one.
 */
function makeDropCollector(): {
  add: (
    label: string,
    name: string,
    entryNoun: { singular: string; plural: string },
    removedEntries: boolean,
    reason?: DroppedReference["reason"],
  ) => void;
  finish: () => DroppedReference[];
} {
  // Keyed on label AND reason, not label alone: the same label can lose rows
  // for two different reasons in one batch (an inventory line dropped because
  // the general scope cannot hold it, another because its NPC was not copied),
  // and merging those would put one explanation on top of both.
  const byKey = new Map<string, DroppedReference>();
  return {
    add(label, name, entryNoun, removedEntries, reason) {
      const key = `${label}\u0000${reason ?? ""}`;
      const existing = byKey.get(key);
      if (existing) existing.names.push(name);
      else byKey.set(key, { label, names: [name], removedEntries, entryNoun, ...(reason ? { reason } : {}) });
    },
    finish: () => [...byKey.values()],
  };
}

/** One entity row to copy, alongside the table it belongs to — a batch can mix
 *  NPCs and factions in one call. */
export interface CopySetSourceRow {
  table: BulkScopeTable;
  row: Record<string, unknown>;
}

/** One join-table row riding along with the batch, per `JOIN_TABLES_FOR_ENTITY`. */
export interface CopySetJoinRow {
  table: CopyJoinTable;
  row: Record<string, unknown>;
}

export interface CopySetPlan {
  /** One entry per copied entity row, in `entities` order, tagged with the
   *  table it inserts into — a batch mixing NPCs and factions still needs to
   *  know which is which at insert time. */
  payloads: { table: BulkScopeTable; payload: Record<string, unknown> }[];
  /** Join-table rows, keyed by table, inserted after both endpoints exist.
   *  Only tables with at least one surviving row appear as keys. */
  linkPayloads: Partial<Record<CopyJoinTable, Record<string, unknown>[]>>;
  dropped: DroppedReference[];
  /** source row id → minted copy id. */
  idMap: ReadonlyMap<string, string>;
}

/**
 * The set-level entry point: plans a batch of entity copies plus the join
 * rows that connect them, per the module docstring's "Copying a batch"
 * section. Still pure — `entities` and `joinRows` are already-fetched rows,
 * `referenced` is an already-fetched lookup map built the same way a per-row
 * caller of `buildCopyPlan` already builds one, and nothing here talks to
 * Supabase.
 */
export function buildCopySetPlan(
  entities: readonly CopySetSourceRow[],
  joinRows: readonly CopySetJoinRow[],
  targetCampaignId: string | null,
  userId: string,
  referenced: ReadonlyMap<string, ReferencedRow>,
): CopySetPlan {
  // Mint every copy's id up front, before any payload is built — see the
  // `idMap` parameter comment on `buildCopyPlan` for why this has to happen
  // first: a join row (or another entity row's own reference, for a future
  // batch that has one) needs to be able to name a copy's id before that
  // copy has been inserted, which only minting ahead of time makes possible.
  const idMap = new Map<string, string>();
  for (const { row } of entities) {
    if (isNonEmptyString(row.id)) idMap.set(row.id, crypto.randomUUID());
  }

  const collector = makeDropCollector();

  const payloads = entities.map(({ table, row }) => {
    const { payload, dropped } = buildCopyPlan(table, row, targetCampaignId, userId, referenced, idMap);
    for (const d of dropped) for (const name of d.names) collector.add(d.label, name, d.entryNoun, d.removedEntries, d.reason);
    return { table, payload };
  });

  const linkPayloads: Partial<Record<CopyJoinTable, Record<string, unknown>[]>> = {};
  for (const { table, row } of joinRows) {
    const { payload, dropped } = buildJoinRowPayload(table, row, targetCampaignId, userId, idMap, referenced);
    if (payload) (linkPayloads[table] ??= []).push(payload);
    for (const d of dropped) collector.add(d.label, d.name, d.entryNoun, d.removedEntries, d.reason);
  }

  return { payloads, linkPayloads, dropped: collector.finish(), idMap };
}
