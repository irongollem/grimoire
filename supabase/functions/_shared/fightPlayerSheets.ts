// What the server reads of a fight's player characters (#1201, #1021): their sheets, the campaign's inventory rows they
// carry, the items those name and the Wild Shape forms they are in. Shared by `encounter-command` (which adjudicates
// against them and plays an ally from one) and `encounter-options` (which lists an ally's turn the same way).

import type { SupabaseClient } from "@supabase/supabase-js";
import { inventoryItemRef } from "../../../src/lib/itemRef.ts";
import { isUuid } from "../../../src/lib/library/contentIdentity.ts";
import { libraryMonsterRow } from "../../../src/lib/library/libraryMonsterRow.ts";
import { normalizeLibraryItem } from "../../../src/lib/items/normalizeLibraryItem.ts";
import type { PartyInventoryItem } from "../../../src/types/inventory.types.ts";
import type { Item } from "../../../src/types/item.types.ts";
import type { AllyCasting, AllySpellRow, BeastScores, PlayerSheetRow, PlayerSheets } from "../../../src/rules/fight/playerSheet.ts";
import type { SpellcastingClassDefinitionLike, SpellcastingSubclassDefinitionLike } from "../../../src/rules/spellcastingByClass.ts";
import type { CharacterClass } from "../../../src/types/multiclass.types.ts";
import type { CharacterSpell } from "../../../src/types/spell.types.ts";
import { loadCustomItems } from "./fightItems.ts";
import { customContentScope } from "./fightStatBlocks.ts";

/**
 * The campaign's inventory rows the members carry and the items those name: what worn gear (and so armour class) is worked out
 * from. Scoped to this campaign in the query, as the rest of this file is. Also read by the roster a fight opens with.
 */
export async function loadInventoryAndItems(
  admin: SupabaseClient,
  campaignId: string,
  memberIds: string[],
): Promise<{ rows: PartyInventoryItem[]; items: Item[] }> {
  const { data: inventory, error: inventoryError } = await admin
    .from("party_inventory").select("*").eq("campaign_id", campaignId).in("carried_by", memberIds);
  if (inventoryError) throw new Error(`party_inventory: ${inventoryError.message}`);
  const rows = inventory as PartyInventoryItem[];
  const refs = [...new Set(rows.flatMap((r) => inventoryItemRef(r) ?? []))];
  const items: Item[] = [];
  const customIds = refs.filter(isUuid);
  const libraryIds = refs.filter((id) => !isUuid(id));
  if (customIds.length > 0) {
    items.push(...(await loadCustomItems(admin, campaignId, customIds)));
  }
  if (libraryIds.length > 0) {
    const { data, error } = await admin.from("library_items").select("*").in("id", libraryIds);
    if (error) throw new Error(`library_items: ${error.message}`);
    items.push(...data.map(normalizeLibraryItem));
  }
  return { rows, items };
}

export async function loadPlayerSheets(admin: SupabaseClient, campaignId: string, memberIds: string[]): Promise<PlayerSheets> {
  // Every read is scoped to this campaign. The inventory ids come from this campaign's own rows (a database
  // trigger keeps an inventory row's item in the same campaign or a global row its owner may use), and an
  // item is read only when it is this campaign's or its Dungeon Masters' own, so a forged id names nothing of another account's.
  const { data: members, error: memberError } = await admin
    .from("party_members")
    .select("id, ruleset, class, subclass, ac_formula, class_choices, str, dex, con, int, wis, cha, proficiency_bonus, saving_throw_proficiencies, wildshape_state, speed, level, custom_attacks, spell_slots, class_resources, skill_proficiencies")
    .eq("campaign_id", campaignId)
    .in("id", memberIds);
  if (memberError) throw new Error(`party_members: ${memberError.message}`);
  const { rows, items } = await loadInventoryAndItems(admin, campaignId, memberIds);
  // A Wild Shape form's STR, DEX and CON replace the character's own on a save.
  const formIds = [...new Set((members as PlayerSheetRow[]).flatMap((m) => m.wildshape_state?.monster_id ?? []))];
  const beasts: BeastScores[] = [];
  const libraryForms = formIds.filter((id) => !isUuid(id));
  const customForms = formIds.filter(isUuid);
  if (libraryForms.length > 0) {
    const { data, error } = await admin.from("library_monsters").select("*").in("id", libraryForms);
    if (error) throw new Error(`library_monsters: ${error.message}`);
    beasts.push(...data.map(libraryMonsterRow).map((m) => ({ id: m.id, stat_block: m.stat_block })));
  }
  if (customForms.length > 0) {
    const { data, error } = await admin
      .from("monsters").select("id, stat_block").in("id", customForms).or(await customContentScope(admin, campaignId));
    if (error) throw new Error(`monsters: ${error.message}`);
    beasts.push(...(data as BeastScores[]));
  }
  const sheetRows = members as PlayerSheetRow[];
  const casting = await loadAllyCasting(admin, campaignId, sheetRows.map((m) => m.id));
  return { members: sheetRows, inventory: rows, items, beasts, casting };
}

const CLASS_DEFINITION_COLUMNS = "id, caster_type, spell_slots, spells_known, cantrips_known, slot_recovery, prepared_ability, primary_ability";

/**
 * What an ally casts from (#1021): their spell rows (named by id), their class rows and the definitions those rows are
 * pinned to. Every read is keyed by members this campaign's own read returned. A custom class, subclass or spell is read only
 * when it is the campaign's or its Dungeon Masters' own (`customContentScope`), plus the shared book rows with no owner.
 */
async function loadAllyCasting(admin: SupabaseClient, campaignId: string, memberIds: string[]): Promise<AllyCasting> {
  if (memberIds.length === 0) return { spells: [], classes: [], definitions: { system: [], custom: [], subclasses: [] } };
  const { data: classData, error: classError } = await admin.from("character_classes").select("*").in("party_member_id", memberIds);
  if (classError) throw new Error(`character_classes: ${classError.message}`);
  const classes = classData as CharacterClass[];
  const { data: spellData, error: spellError } = await admin.from("character_spells").select("*").in("party_member_id", memberIds);
  if (spellError) throw new Error(`character_spells: ${spellError.message}`);
  const grants = spellData as CharacterSpell[];

  const scope = await customContentScope(admin, campaignId);
  const shared = `${scope},and(user_id.is.null,campaign_id.is.null)`;
  const systemIds = [...new Set(classes.filter((c) => c.class_definition_kind === "system").map((c) => c.class_definition_id))];
  const customIds = [...new Set(classes.filter((c) => c.class_definition_kind === "custom").map((c) => c.class_definition_id))];
  const subclassIds = [...new Set(classes.flatMap((c) => c.subclass_definition_id ?? []))];
  const system: SpellcastingClassDefinitionLike[] = [];
  const custom: SpellcastingClassDefinitionLike[] = [];
  const subclasses: SpellcastingSubclassDefinitionLike[] = [];
  if (systemIds.length > 0) {
    const { data, error } = await admin.from("system_classes").select(CLASS_DEFINITION_COLUMNS).in("id", systemIds);
    if (error) throw new Error(`system_classes: ${error.message}`);
    system.push(...(data as unknown as SpellcastingClassDefinitionLike[]));
  }
  if (customIds.length > 0) {
    const { data, error } = await admin.from("custom_classes").select(CLASS_DEFINITION_COLUMNS).in("id", customIds).or(shared);
    if (error) throw new Error(`custom_classes: ${error.message}`);
    custom.push(...(data as unknown as SpellcastingClassDefinitionLike[]));
  }
  if (subclassIds.length > 0) {
    const { data, error } = await admin.from("custom_subclasses").select("id, spellcasting").in("id", subclassIds).or(shared);
    if (error) throw new Error(`custom_subclasses: ${error.message}`);
    subclasses.push(...(data as unknown as SpellcastingSubclassDefinitionLike[]));
  }

  // A grant names its spell by id: the shared library's (text ids) or a custom spell's (uuid).
  const spellIds = [...new Set(grants.map((g) => g.spell_id))];
  const named = new Map<string, { name: string; level: number }>();
  const libraryIds = spellIds.filter((id) => !isUuid(id));
  const customSpellIds = spellIds.filter(isUuid);
  if (libraryIds.length > 0) {
    const { data, error } = await admin.from("library_spells").select("id, name, level").in("id", libraryIds);
    if (error) throw new Error(`library_spells: ${error.message}`);
    for (const row of data as { id: string; name: string; level: number }[]) named.set(row.id, row);
  }
  if (customSpellIds.length > 0) {
    const { data, error } = await admin.from("spells").select("id, name, level").in("id", customSpellIds).or(scope);
    if (error) throw new Error(`spells: ${error.message}`);
    for (const row of data as { id: string; name: string; level: number }[]) named.set(row.id, row);
  }
  const spells: AllySpellRow[] = grants.flatMap((g): AllySpellRow[] => {
    const spell = named.get(g.spell_id);
    if (spell === undefined) return [];
    return [{
      id: g.id, party_member_id: g.party_member_id, name: spell.name, level: spell.level, is_known: g.is_known, is_prepared: g.is_prepared, always_prepared: g.always_prepared,
      source_type: g.source_type, source_class_id: g.source_class_id ?? null, casting_ability: g.casting_ability ?? null, uses_per_day: g.uses_per_day, uses_remaining: g.uses_remaining,
    }];
  });
  return { spells, classes, definitions: { system, custom, subclasses } };
}

