import { ref, computed } from "vue";
import type { QueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { CLASS_EQUIPMENT, type EquipmentEntry } from "@/data/classEquipment";
import { parseEquipmentList, type CharacterFormState } from "@/rules/characterCreation";
import type { BundleItemEntry } from "@/types/item.types";
import type { PartyInventoryInsert } from "@/types/inventory.types";
import { itemRefColumns } from "@/lib/itemRef";
import { itemCatalogueNames } from "@/lib/items/itemCatalogueNames";
import { likeLiteral, orFilterValue } from "@/lib/postgrestFilter";
import type { RulesetKey } from "@/types/ruleset.types";
import { reportHandledError } from "@/lib/observability/sentry";

interface LibraryGear {
  id: string;
  name: string;
  bundle_items: BundleItemEntry[] | null;
  ruleset: RulesetKey | null;
}

type InventoryRow = Omit<PartyInventoryInsert, "campaign_id">;

function equipmentRow(item: LibraryGear, quantity: number, carrierId: string): InventoryRow {
  return {
    ...itemRefColumns(item.id), name: item.name, quantity,
    carried_by: carrierId, location: "backpack",
    slot: null, is_container: false, container_id: null,
    is_attuned: false, is_equipped: false, notes: null,
    current_charges: null, is_identified: true, sort_order: 0,
  };
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
}

export function buildStartingEquipmentPlan(input: {
  className: string;
  classChoice: "a" | "b";
  importClass: boolean;
  backgroundText: string | null;
  importBackground: boolean;
}): StartingEquipmentPlan | null {
  const classPart = input.importClass && CLASS_EQUIPMENT[input.className] ? input.className : null;
  const backgroundItems = input.importBackground && input.backgroundText
    ? parseEquipmentList(input.backgroundText)
    : [];
  if (!classPart && backgroundItems.length === 0) return null;
  return {
    class_name: classPart,
    class_choice: classPart ? input.classChoice : null,
    background_items: backgroundItems,
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
  if (!className && items.length === 0) return null;
  return {
    class_name: className, class_choice: className ? choice : null,
    background_items: items,
  };
}

// ── Writing the rows ─────────────────────────────────────────────────────────

function equipmentName(name: string): string {
  return itemCatalogueNames(name.trim().replace(/[‘’]/g, "'").replace(/^(?:a set of |an? )/i, "").replace(/\.$/, ""))[0];
}

async function lookupLibraryGear(names: string[], ruleset: RulesetKey): Promise<Map<string, LibraryGear>> {
  const keys = [...new Set(names.map(equipmentName).filter(Boolean).flatMap(itemCatalogueNames))];
  if (keys.length === 0) return new Map();
  const filter = keys.map((key) => `name.ilike.${orFilterValue(likeLiteral(key))}`).join(",");
  const { data, error } = await supabase.from("library_items")
    .select("id, name, bundle_items, ruleset")
    .in("source_document_key", [`srd-${ruleset}`, "grimoire-bundled"])
    .or(`ruleset.is.null,ruleset.eq.${ruleset}`)
    .or(filter)
    .order("id");
  if (error) throw error;

  const matches = new Map<string, LibraryGear>();
  for (const row of (data ?? []) as LibraryGear[]) {
    const key = equipmentName(row.name);
    const previous = matches.get(key);
    // Keep a pack's expandable contents. For ordinary gear use the edition's record.
    if (!previous || (!previous.bundle_items?.length && row.bundle_items?.length)
      || (!previous.bundle_items?.length && !row.bundle_items?.length && previous.ruleset === null && row.ruleset === ruleset)) {
      matches.set(key, row);
    }
  }
  return matches;
}

/** The ids of rows written so far, so a failed replay removes exactly its own. */
type Written = string[];

async function insertRows(rows: InventoryRow[], campaignId: string, written: Written): Promise<string[]> {
  if (rows.length === 0) return [];
  const user = getCurrentUser();
  if (!user) throw new Error("You must be signed in to add equipment.");
  const { data, error } = await supabase
    .from("party_inventory")
    .insert(rows.map((r) => ({ ...r, campaign_id: campaignId, user_id: user.id })))
    .select("id");
  if (error) throw error;
  const ids = (data ?? []).map((r) => r.id as string);
  written.push(...ids);
  if (ids.length !== rows.length) throw new Error("Could not confirm the starting equipment was added.");
  return ids;
}

async function writePlan(
  plan: StartingEquipmentPlan,
  characterId: string,
  campaignId: string,
  ruleset: RulesetKey,
  written: Written,
): Promise<void> {
  const classPack = plan.class_name ? CLASS_EQUIPMENT[plan.class_name] : undefined;
  const entries: EquipmentEntry[] = [
    ...(classPack && plan.class_choice ? classPack[plan.class_choice].items : []),
    ...plan.background_items.map((name) => ({ name })),
  ];
  const library = await lookupLibraryGear(entries.map((entry) => entry.name), ruleset);
  const childLibrary = await lookupLibraryGear(
    [...library.values()].flatMap((item) => (item.bundle_items ?? []).map((entry) => entry.name)),
    ruleset,
  );
  const rows: InventoryRow[] = [];
  const packs: { item: LibraryGear; quantity: number }[] = [];
  let missingCount = 0;
  for (const entry of entries) {
    const item = library.get(equipmentName(entry.name));
    if (!item) missingCount++;
    else if (item.bundle_items?.length) packs.push({ item, quantity: entry.quantity ?? 1 });
    else rows.push(equipmentRow(item, entry.quantity ?? 1, characterId));
  }

  await insertRows(rows, campaignId, written);
  for (const { item, quantity } of packs) {
    // Each pack needs its own container id before its contents can be written.
    for (let i = 0; i < quantity; i++) {
      const [containerId] = await insertRows(
        [{ ...equipmentRow(item, 1, characterId), is_container: true }],
        campaignId,
        written,
      );
      const contents: InventoryRow[] = [];
      for (const entry of item.bundle_items ?? []) {
        const child = childLibrary.get(equipmentName(entry.name));
        if (!child) missingCount++;
        else contents.push({
          ...equipmentRow(child, entry.quantity ?? 1, characterId),
          location: "container", container_id: containerId,
        });
      }
      await insertRows(contents, campaignId, written);
    }
  }
  if (missingCount > 0) {
    reportHandledError(new Error("Starting equipment missing from the library"), "replayStartingGrants", { ruleset, missingCount });
  }
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
    .select("class_choices, ruleset")
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
    await writePlan(plan, characterId, campaignId, row.ruleset, written);
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
