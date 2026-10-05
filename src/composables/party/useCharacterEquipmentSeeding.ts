import { ref, computed } from "vue";
import type { QueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { CLASS_EQUIPMENT, type EquipmentEntry } from "@/data/classEquipment";
import { parseEquipmentList, type CharacterFormState } from "@/rules/characterCreation";
import type { BundleItemEntry } from "@/types/item.types";
import type { PartyInventoryInsert, PartyInventoryItem } from "@/types/inventory.types";
import { itemRefColumns } from "@/lib/itemRef";
import { likeLiteral, orFilterValue } from "@/lib/postgrestFilter";
import { reportHandledError } from "@/lib/observability/sentry";
import { subclassGrantedSpellRows } from "@/levelup/subclassGrantedSpells";

/** Vault item data needed for equipment seeding. */
export interface VaultEntry { id: string; bundle_items: BundleItemEntry[] | null }

type InventoryRow = Omit<PartyInventoryInsert, "campaign_id">;

// ── Row builders (pure) ──────────────────────────────────────────────────────

/** party_inventory insert row for a single plain (non-container) equipment entry. */
function buildPlainEquipmentRow(
  name: string,
  quantity: number,
  itemId: string | null,
  carrierId: string,
): InventoryRow {
  return {
    ...itemRefColumns(itemId), name, quantity,
    carried_by: carrierId, location: "backpack",
    slot: null, is_container: false, container_id: null,
    is_attuned: false, is_equipped: false, notes: null,
    current_charges: null, is_identified: true, is_ruined: false, sort_order: 0,
  };
}

/**
 * Splits a class-equipment bundle's entries into plain rows ready for one
 * batched insert, and "pack" entries whose contents need the pack's own
 * generated id first (so they stay one-at-a-time). Exported for testing.
 */
export function partitionBundleEntries(
  entries: EquipmentEntry[],
  vaultMap: Map<string, VaultEntry>,
  carrierId: string,
): { plainRows: InventoryRow[]; packEntries: EquipmentEntry[] } {
  const plainRows: InventoryRow[] = [];
  const packEntries: EquipmentEntry[] = [];
  for (const entry of entries) {
    const vault = vaultMap.get(entry.name.toLowerCase()) ?? null;
    if (vault?.bundle_items?.length) {
      packEntries.push(entry);
    } else {
      plainRows.push(buildPlainEquipmentRow(entry.name, entry.quantity ?? 1, vault?.id ?? null, carrierId));
    }
  }
  return { plainRows, packEntries };
}

/** party_inventory insert rows for a background's free-text equipment list. */
export function buildBackgroundEquipmentRows(equipmentText: string, carrierId: string): InventoryRow[] {
  return parseEquipmentList(equipmentText).map((name) => buildPlainEquipmentRow(name, 1, null, carrierId));
}

// ── The loadout a character is made with, kept until it can be granted ───────

/**
 * What the wizard's equipment choices amount to, in the shape the seeding needs
 * to replay them. It rides on `party_members.class_choices.starting_grants`
 * from creation until the character joins a campaign, because inventory rows
 * need a campaign (`party_inventory.campaign_id` is NOT NULL) and a character
 * resting in the pool has none. Replaying removes it, so it is granted once.
 */
export interface StartingEquipmentPlan {
  /** The class whose bundle is granted; null when the player left it out. */
  class_name: string | null;
  /** Which of the class's two bundles. */
  class_choice: "a" | "b" | null;
  /** The background's items, already split into names. */
  background_items: string[];
  /**
   * Spells the chosen subclass grants at level 1 (always prepared). They wait
   * with the equipment because character_spells rows are only writable once the
   * character is linked to a campaign (its RLS keys on campaign_members).
   */
  granted_spell_ids: string[];
}

export function buildStartingEquipmentPlan(input: {
  className: string;
  classChoice: "a" | "b";
  importClass: boolean;
  backgroundText: string | null;
  importBackground: boolean;
  grantedSpellIds: string[];
}): StartingEquipmentPlan | null {
  const classPart = input.importClass && CLASS_EQUIPMENT[input.className] ? input.className : null;
  const backgroundItems = input.importBackground && input.backgroundText
    ? parseEquipmentList(input.backgroundText)
    : [];
  if (!classPart && backgroundItems.length === 0 && input.grantedSpellIds.length === 0) return null;
  return {
    class_name: classPart,
    class_choice: classPart ? input.classChoice : null,
    background_items: backgroundItems,
    granted_spell_ids: input.grantedSpellIds,
  };
}

/** Reads the stored plan back, refusing anything that is not the shape written. */
export function parseStartingEquipmentPlan(value: unknown): StartingEquipmentPlan | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  const className = typeof v.class_name === "string" ? v.class_name : null;
  const choice = v.class_choice === "a" || v.class_choice === "b" ? v.class_choice : null;
  const items = Array.isArray(v.background_items)
    ? v.background_items.filter((i): i is string => typeof i === "string")
    : [];
  const spells = Array.isArray(v.granted_spell_ids)
    ? v.granted_spell_ids.filter((i): i is string => typeof i === "string")
    : [];
  if (!className && items.length === 0 && spells.length === 0) return null;
  return {
    class_name: className, class_choice: className ? choice : null,
    background_items: items, granted_spell_ids: spells,
  };
}

// ── Writing the rows ─────────────────────────────────────────────────────────

/** Look up vault items by name (case-insensitive). Returns Map<lowercaseName, VaultEntry>. */
async function lookupVaultItems(names: string[]): Promise<Map<string, VaultEntry>> {
  if (names.length === 0) return new Map();
  const filter = names.map((n) => `name.ilike.${orFilterValue(likeLiteral(n))}`).join(",");
  const { data, error } = await supabase.from("items").select("id, name, bundle_items").or(filter);
  if (error) throw error;
  const map = new Map<string, VaultEntry>();
  for (const row of data ?? []) {
    map.set((row.name as string).toLowerCase(), {
      id: row.id as string,
      bundle_items: row.bundle_items as BundleItemEntry[] | null,
    });
  }
  return map;
}

/** The ids of rows written so far, so a failed replay removes exactly its own. */
type Written = string[];

async function insertRows(rows: InventoryRow[], campaignId: string, written: Written): Promise<void> {
  if (rows.length === 0) return;
  const user = getCurrentUser();
  if (!user) throw new Error("You must be signed in to add equipment.");
  const { data, error } = await supabase
    .from("party_inventory")
    .insert(rows.map((r) => ({ ...r, campaign_id: campaignId, user_id: user.id })))
    .select("id");
  if (error) throw error;
  written.push(...(data ?? []).map((r) => r.id as string));
}

/**
 * Seed one pack entry. The pack itself becomes an is_container=true row and
 * each sub-item is inserted with container_id pointing to it.
 */
async function insertPack(
  entry: EquipmentEntry,
  vault: VaultEntry,
  carrierId: string,
  campaignId: string,
  written: Written,
): Promise<void> {
  const user = getCurrentUser();
  if (!user) throw new Error("You must be signed in to add equipment.");
  const packRow: InventoryRow = {
    ...itemRefColumns(vault.id), name: entry.name, quantity: entry.quantity ?? 1,
    carried_by: carrierId, location: "backpack",
    slot: null, is_container: true, container_id: null,
    is_attuned: false, is_equipped: false, notes: null,
    current_charges: null, is_identified: true, is_ruined: false, sort_order: 0,
  };
  const { data, error } = await supabase
    .from("party_inventory")
    .insert({ ...packRow, campaign_id: campaignId, user_id: user.id })
    .select()
    .single();
  if (error) throw error;
  const packId = (data as PartyInventoryItem).id;
  written.push(packId);
  const bundleItems = vault.bundle_items ?? [];
  const subMap = await lookupVaultItems([...new Set(bundleItems.map(b => b.name))]);
  await insertRows(
    bundleItems.map((sub) => ({
      ...itemRefColumns(subMap.get(sub.name.toLowerCase())?.id ?? null), name: sub.name, quantity: sub.quantity ?? 1,
      carried_by: carrierId, location: "container" as const,
      slot: null, is_container: false, container_id: packId,
      is_attuned: false, is_equipped: false, notes: null,
      current_charges: null, is_identified: true, is_ruined: false, sort_order: 0,
    })),
    campaignId,
    written,
  );
}

async function writePlan(
  plan: StartingEquipmentPlan,
  characterId: string,
  campaignId: string,
  written: Written,
): Promise<void> {
  const plainRows: InventoryRow[] = [];
  let packEntries: EquipmentEntry[] = [];
  let vaultMap = new Map<string, VaultEntry>();

  const classPack = plan.class_name ? CLASS_EQUIPMENT[plan.class_name] : undefined;
  if (classPack && plan.class_choice) {
    const bundle = plan.class_choice === "a" ? classPack.a : classPack.b;
    vaultMap = await lookupVaultItems([...new Set(bundle.items.map(e => e.name))]);
    const split = partitionBundleEntries(bundle.items, vaultMap, characterId);
    plainRows.push(...split.plainRows);
    packEntries = split.packEntries;
  }
  plainRows.push(...plan.background_items.map((name) => buildPlainEquipmentRow(name, 1, null, characterId)));

  await insertRows(plainRows, campaignId, written);
  for (const entry of packEntries) {
    const vault = vaultMap.get(entry.name.toLowerCase());
    if (vault) await insertPack(entry, vault, characterId, campaignId, written);
  }
  await writeGrantedSpells(plan.granted_spell_ids, characterId);
}

/** The subclass's level-1 spells, as the always-prepared class rows apply_level_up writes. */
async function writeGrantedSpells(spellIds: string[], characterId: string): Promise<void> {
  if (spellIds.length === 0) return;
  const { data: primary, error: classError } = await supabase
    .from("character_classes").select("id").eq("party_member_id", characterId).eq("is_primary", true).single();
  if (classError) throw classError;
  const { data: owned, error: ownedError } = await supabase
    .from("character_spells").select("spell_id").eq("party_member_id", characterId);
  if (ownedError) throw ownedError;
  const rows = subclassGrantedSpellRows(spellIds, new Set((owned ?? []).map((r) => r.spell_id as string)));
  if (rows.length === 0) return;
  const { error } = await supabase.from("character_spells").insert(
    rows.map((r) => ({ ...r, party_member_id: characterId, source_class_id: primary.id, source_type: "class" as const })),
  );
  if (error) throw error;
}

/**
 * The character reached its table and only its starting equipment did not. A
 * caller must not treat this as a failed attach: the character is seated, and
 * the marker is back on it for the next replay.
 */
export class StartingEquipmentError extends Error {
  constructor(cause: unknown) {
    super("The character joined the table, but its starting equipment couldn't be added.", { cause });
    this.name = "StartingEquipmentError";
  }
}

/**
 * Grants a character the starting equipment it was made with, into a campaign's
 * inventory, exactly once. The one function behind every way a character comes
 * to sit at a table: creating it on a roster, attaching it from the pool and
 * joining by invite with it.
 *
 * The marker is claimed (removed) BEFORE anything is written, with a filter that
 * only matches while the marker is still there, so two callers racing over the
 * same character cannot both seed it. A failed write puts the marker back and
 * throws, so the next attach tries again rather than losing the loadout.
 *
 * @returns whether anything was granted
 */
export async function replayStartingGrants(
  characterId: string,
  campaignId: string,
  queryClient: QueryClient,
): Promise<boolean> {
  const { data: row, error: readError } = await supabase
    .from("party_members")
    .select("class_choices")
    .eq("id", characterId)
    .single();
  if (readError) throw readError;
  const choices = (row.class_choices ?? {}) as Record<string, unknown>;
  const plan = parseStartingEquipmentPlan(choices.starting_grants);
  if (!plan) return false;

  const { starting_grants: marker, ...rest } = choices;
  const { data: claimed, error: claimError } = await supabase
    .from("party_members")
    .update({ class_choices: rest })
    .eq("id", characterId)
    .not("class_choices->starting_grants", "is", null)
    .select("id");
  if (claimError) throw claimError;
  if (!claimed || claimed.length === 0) return false; // another caller took it

  const written: Written = [];
  try {
    await writePlan(plan, characterId, campaignId, written);
  } catch (writeError) {
    // Put the marker back on top of the choices as they are NOW. A failed read
    // must not become an empty object here: writing `{ starting_grants }` alone
    // would wipe every other choice the character holds.
    const { data: current, error: rereadError } = await supabase
      .from("party_members").select("class_choices").eq("id", characterId).single();
    if (rereadError) {
      reportHandledError(rereadError, "replayStartingGrants.restoreMarker", { characterId });
    } else {
      const restored = { ...((current.class_choices ?? {}) as Record<string, unknown>), starting_grants: marker };
      const { error: restoreError } = await supabase
        .from("party_members").update({ class_choices: restored }).eq("id", characterId);
      if (restoreError) reportHandledError(restoreError, "replayStartingGrants.restoreMarker", { characterId });
    }
    // Rows that did land before the failure would be granted twice on the
    // retry, so exactly those go (sub-items first: they point at their pack).
    if (written.length > 0) await supabase.from("party_inventory").delete().in("id", written);
    throw writeError;
  }
  void queryClient.invalidateQueries({ queryKey: ["party-inventory"] });
  void queryClient.invalidateQueries({ queryKey: ["character-pool"] });
  return true;
}

// ── The wizard's equipment state ─────────────────────────────────────────────

/**
 * Class starting-equipment state for the character creation wizard: which of
 * the class's two starting bundles to grant, and whether to import it (and the
 * background's) on creation. The loadout itself is written by
 * `replayStartingGrants` once the character sits in a campaign.
 */
export function useCharacterEquipmentSeeding(f: CharacterFormState) {
  // Whether to import the chosen background's equipment text into inventory
  // on creation. Defaults to true so new characters don't end up empty-handed;
  // the player can untick it on the Background step.
  const importBackgroundEquipment = ref(true);

  // Class starting equipment: choice A or B, and whether to seed inventory.
  const classEquipmentChoice = ref<"a" | "b">("a");
  const importClassEquipment = ref(true);

  /** The two equipment bundles for the currently chosen class (null if class has no data). */
  const classEquipmentPack = computed(() => f.class ? (CLASS_EQUIPMENT[f.class] ?? null) : null);

  return {
    importBackgroundEquipment,
    classEquipmentChoice, importClassEquipment, classEquipmentPack,
  };
}
