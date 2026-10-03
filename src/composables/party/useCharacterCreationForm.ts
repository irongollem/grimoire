import { ref, reactive, computed, watch, type InjectionKey } from "vue";
import { useRouter, useRoute } from "vue-router";
import { useQueryClient } from "@tanstack/vue-query";
import { useAuthStore } from "@/stores/auth";
import { useCampaignStore } from "@/stores/campaign";
import { useParty, useCreatePartyMember, useUpdatePartyMember } from "@/composables/party/useParty";
import { useCharacterPool } from "@/composables/party/useCharacterPool";
import { benchedMessage, useBenchedAfterAttach } from "@/composables/party/useBenchedAfterAttach";
import { useAddCharacterClass, useCharacterClasses } from "@/composables/party/useCharacterClasses";
import { useAddInventoryItem, useAddInventoryItems } from "@/composables/items/usePartyInventory";
import { useCampaignMembers } from "@/composables/campaign/useCampaignMembers";
import { useAttachCharacter } from "@/composables/party/useCharacterPool";
import { useCampaignSystemClasses, useCampaignCustomClasses } from "@/composables/rules/useCustomClasses";
import { useCampaignSpecies } from "@/composables/rules/useSpecies";
import { useBackgrounds } from "@/composables/rules/useBackgrounds";
import { useRuleset } from "@/composables/rules/useRuleset";
import { useCharacterCreationEdition } from "@/composables/party/useCharacterCreationEdition";
import { isRulesetAdmissible, parseRulesetBounce, rulesetRules } from "@/composables/party/useCharacterRuleset";
import { campaignToAttachAfterCreate } from "@/composables/party/characterCreationEdition";
import { deriveEffectiveSpellSlots } from "@/rules/spellSlots";
import { applySpeciesSpellGrants } from "@/composables/party/useCharacterSpells";
import type { SpeciesSpellGrant } from "@/types/species.types";
import { computeAc } from "@/types/party.types";
import type { PartyMember, SkillProfLevel, SaveKey, SpellSlotEntry } from "@/types/party.types";
import type { PartyInventoryInsert } from "@/types/inventory.types";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/composables/useToast";
import { CLASS_EQUIPMENT, type EquipmentEntry } from "@/data/classEquipment";
import { abilityBonusesForChoice } from "@/rules/backgroundAsi";
import {
  ABILITY_STATS, POINT_BUY_COSTS, POINT_BUY_TOTAL,
  type CharacterFormState, type AbilityKey, type AsiMode, type ScoreMode,
  parseEquipmentList,
} from "@/rules/characterCreation";
import { useCharacterEquipmentSeeding, type VaultEntry } from "@/composables/party/useCharacterEquipmentSeeding";
import { useCharacterBackgroundSelection } from "@/composables/party/useCharacterBackgroundSelection";
import { itemRefColumns } from "@/lib/itemRef";

// ── Equipment-seeding row builders (pure — no I/O) ──────────────────────────
// Extracted so the create-character hot path (save(), below) can batch these
// into a single addInventoryItems() call instead of one insert per starting
// item. seedEquipmentEntry (useCharacterEquipmentSeeding) still owns "pack"
// entries (e.g. "Explorer's Pack") one at a time — a pack needs its own
// generated id before its contents can reference it as container_id, so that
// part can't be folded into the batch.

/** party_inventory insert row for a single plain (non-container) equipment entry. */
function buildPlainEquipmentRow(
  name: string,
  quantity: number,
  itemId: string | null,
  carrierId: string,
): Omit<PartyInventoryInsert, "campaign_id"> {
  return {
    ...itemRefColumns(itemId), name, quantity,
    carried_by: carrierId, location: "backpack",
    slot: null, is_container: false, container_id: null,
    is_attuned: false, is_equipped: false, notes: null,
    current_charges: null, is_identified: true, is_ruined: false, sort_order: 0,
  };
}

/**
 * Where a newly-created character lands: as an unclaimed row on a campaign's
 * roster, or in its creator's personal pool.
 *
 * These are two decisions, not one. Deriving both from `isDmCreate` alone —
 * `campaign_id: isDmCreate ? activeCampaignId : null` beside
 * `owner_user_id: isDmCreate ? null : userId` — is correct on each line and
 * broken together: opening the DM create route with no campaign selected
 * (reachable since the #729 mode lens, and the default state for a fresh
 * signup) sets *both* to null, and no query in the app returns such a row.
 * useParty and useMyCharacters filter on campaign_id, useCharacterPool on
 * owner_user_id, so the character is fully created and invisible everywhere.
 * One user rebuilt a level-2 character from scratch because of it (#738).
 *
 * A DM roster row therefore requires an actual campaign to be a roster row;
 * without one the character belongs to whoever made it. Exported for testing.
 */
export function resolveCharacterPlacement(opts: {
  isDmCreate: boolean;
  activeCampaignId: string | null;
  creatorId: string;
}): { campaign_id: string | null; owner_user_id: string | null } {
  const dmRosterCreate = opts.isDmCreate && !!opts.activeCampaignId;
  return {
    campaign_id: dmRosterCreate ? opts.activeCampaignId : null,
    owner_user_id: dmRosterCreate ? null : opts.creatorId,
  };
}

/**
 * Splits a class-equipment bundle's entries into plain rows ready for one
 * batched insert, and "pack" entries whose contents need the pack's own
 * generated id first (so they stay one-at-a-time via seedEquipmentEntry).
 * Exported for testing.
 */
export function partitionBundleEntries(
  entries: EquipmentEntry[],
  vaultMap: Map<string, VaultEntry>,
  carrierId: string,
): { plainRows: Omit<PartyInventoryInsert, "campaign_id">[]; packEntries: EquipmentEntry[] } {
  const plainRows: Omit<PartyInventoryInsert, "campaign_id">[] = [];
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
export function buildBackgroundEquipmentRows(
  equipmentText: string,
  carrierId: string,
): Omit<PartyInventoryInsert, "campaign_id">[] {
  return parseEquipmentList(equipmentText).map((name) => buildPlainEquipmentRow(name, 1, null, carrierId));
}

// ── Composable ────────────────────────────────────────────────────────────────

export type CreateDestination =
  | { name: "play-home" }
  | { name: "play-champions" }
  | { path: string };

/** Where a finished create lands. A benched character goes where its notice is. */
export function createDestination(input: {
  landedCampaignId: string | null;
  isDmCreate: boolean;
  levelUp: boolean;
  benched: boolean;
  characterId: string;
}): CreateDestination {
  if (!input.landedCampaignId) return { name: "play-home" };
  if (input.isDmCreate) return { path: "/party" };
  if (input.benched) return { name: "play-champions" };
  if (input.levelUp) return { path: `/play/character/levelup?targetLevel=2&memberId=${input.characterId}` };
  return { name: "play-champions" };
}

export function useCharacterCreationForm() {
  const router = useRouter();
  const route  = useRoute();
  const auth   = useAuthStore();
  const campaign = useCampaignStore();
  const queryClient = useQueryClient();

  // Read straight after the attach, to learn whether the table benched the character.
  const { waitingAfterAttach } = useBenchedAfterAttach();

  const isEditMode = computed(() => route.name === "play-character-edit");
  const isDmCreate = computed(() => route.name === "party-member-new");
  const { data: partyMembers }    = useParty();
  const { data: myCharacters }    = useCharacterPool();
  const { data: campaignMembers } = useCampaignMembers();

  const editMemberId = computed(() =>
    (route.query.memberId as string | undefined) ?? auth.linkedPartyMemberId ?? null,
  );
  // partyMembers (useParty) is the active campaign's roster — a DM managing a
  // member via ?memberId= resolves there. A standalone character (#729/#730,
  // no campaign) never appears in that campaign-scoped list, so an owner
  // editing their own unattached character falls back to myCharacters
  // (useCharacterPool), which RLS already scopes to rows the caller owns.
  const existingMember = computed(() => {
    if (!editMemberId.value) return null;
    return partyMembers.value?.find((m) => m.id === editMemberId.value)
      ?? myCharacters.value?.find((m) => m.id === editMemberId.value)
      ?? null;
  });
  // ── Edition scope ─────────────────────────────────────────────────────────────
  // A character carries its own edition (#943) and every list below (species,
  // backgrounds, classes) is filtered by it, so the scope is provided BEFORE any
  // of them is called, and everything its getters read is declared above this
  // line (reading something declared later is a temporal-dead-zone error).
  // Creating: the edition the player picks on the first step, null until then
  // (the lists fall back to the campaign's). Editing: the character's own.
  const { landingCampaign, chosenRuleset, chooseRuleset, onEditionChange } = useCharacterCreationEdition({
    isEditMode,
    isDmCreate,
    existingMember,
    isMemberOfActiveCampaign: () => (campaignMembers.value ?? []).some((cm) => cm.user_id === auth.user?.id),
  });

  // Pickers offer only what the campaign permits (`campaignSpecies` /
  // `campaignSystemClasses`); resolution of what a character already has runs
  // against the ungated lists, so a species/class disabled after the fact still
  // renders on the sheet (#566).
  const { data: campaignSpecies, all: allSpecies } = useCampaignSpecies();
  const { data: allBackgrounds } = useBackgrounds();
  const { is2024 } = useRuleset();

  /** The species the wizard may offer — gated. Full rows, not {id,name}: the
   *  picker cards render art, size and traits. */
  const speciesChoices    = campaignSpecies;
  const backgroundOptions = computed(() => (allBackgrounds.value ?? []).map(b => ({ id: b.id, name: b.name })));
  const selectedSpecies   = computed(() => (allSpecies.value ?? []).find(s => s.id === f.species_id) ?? null);
  const subraceOptions    = computed(() => selectedSpecies.value?.subraces?.map(sr => sr.name) ?? []);

  // `all` resolves the classes a character already has (a class the campaign has
  // since disabled still defines its rows); the gated lists are for pickers.
  const { data: systemClasses, all: allSystemClasses } = useCampaignSystemClasses();
  const { data: customClasses, all: allCustomClasses } = useCampaignCustomClasses();
  const { data: memberClassRows } = useCharacterClasses(editMemberId);

  const mergedClasses = computed(() => [
    ...systemClasses.value.map(c => ({ ...c, definition_kind: "system" as const, choice_key: `system:${c.id}` })),
    ...customClasses.value.map(c => ({ ...c, definition_kind: "custom" as const, choice_key: `custom:${c.id}` })),
  ].sort((a, b) => a.class_name.localeCompare(b.class_name)
    || a.definition_kind.localeCompare(b.definition_kind)
    || a.id.localeCompare(b.id)));
  const selectedClassKey = ref("");

  // ── ASI mode (new chars only) ─────────────────────────────────────────────────
  const asiMode   = ref<AsiMode>("bonus");
  const customAsi = reactive<Record<AbilityKey, number>>({ str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 });
  const customAsiTotal = computed(() => (Object.values(customAsi) as number[]).reduce((s, v) => s + v, 0));

  function adjustCustomAsi(key: AbilityKey, delta: 1 | -1) {
    const next = (customAsi[key] ?? 0) + delta;
    if (next < 0 || next > 2) return;
    if (delta === 1 && customAsiTotal.value >= 3) return;
    customAsi[key] = next;
  }

  // ── Selected class / subrace (for HP / spell-slot / ASI derivation) ─────────
  const selectedClass   = computed(() => mergedClasses.value.find(c => c.choice_key === selectedClassKey.value)
    ?? mergedClasses.value.find(c => c.class_name === f.class) ?? null);
  const selectedBg      = computed(() => (allBackgrounds.value ?? []).find(b => b.id === f.background_id) ?? null);
  const selectedSubrace = computed(() =>
    (f.subrace && selectedSpecies.value?.subraces)
      ? (selectedSpecies.value.subraces.find(sr => sr.name === f.subrace) ?? null)
      : null,
  );

  // Derived stats (preview in Done step; applied on save for new chars)
  const derivedHp       = computed(() => {
    const cls = selectedClass.value;
    return cls ? Math.max(1, cls.hit_die + mod(f.con)) : null;
  });
  const derivedAc       = computed(() => 10 + mod(f.dex));
  const derivedSpeed    = computed(() => selectedSpecies.value?.speed?.walk ?? 30);
  const derivedInitiative = computed(() => mod(f.dex));

  const { mutateAsync: create }               = useCreatePartyMember();
  const { mutateAsync: update }               = useUpdatePartyMember();
  const { mutateAsync: addCharacterClass }    = useAddCharacterClass();
  const { mutateAsync: addInventoryItem }      = useAddInventoryItem();
  const { mutateAsync: addInventoryItems }     = useAddInventoryItems();
  const { mutateAsync: attachCharacter } = useAttachCharacter();

  // A memberId query param means either "DM managing a campaign member" (the
  // established affordance — /party is a DM route) or "owner editing their own
  // unattached character" (#729/#730); only the DM case belongs on /party.
  const backRoute = isDmCreate.value || (auth.isDM && !!(route.query.memberId as string | undefined)) ? "/party" : "/play";

  const tabParam = route.query.tab as string | undefined;
  const activeTab  = ref<"identity" | "stats" | "profs">(
    tabParam === "profs" || tabParam === "stats" ? tabParam : "identity",
  );
  const wizardStep = ref(0);
  const saving     = ref(false);
  const scoreMode  = ref<ScoreMode>("pointbuy");

  const portraitUrl = ref(existingMember.value?.portrait_url ?? "");
  const focalPoint  = ref<{ x: number; y: number } | null>(existingMember.value?.portrait_focal_point ?? null);

  const buildFormState = (
    m: PartyMember | null | undefined,
  ): CharacterFormState => ({
    campaign_id:   m?.campaign_id ?? null,
    name:          m?.name ?? "",
    player_name:   m?.player_name ?? auth.membership?.display_name ?? "",
    class:         m?.class ?? "",
    subclass:      m?.subclass ?? "",
    level:         m?.level ?? 1,
    subrace:       m?.subrace ?? "",
    species_id:         m?.species_id ?? null,
    disguise_species_id: null,
    disguise_race:       null,
    disguise_subrace:    null,
    background_id: m?.background_id ?? null,
    max_hp:        m?.max_hp ?? 10,
    current_hp:    m?.current_hp ?? 10,
    temp_hp:       m?.temp_hp ?? 0,
    ac:            m?.ac ?? 10,
    ac_formula:    (m?.ac_formula ?? null) as string | null,
    speed:         m?.speed ?? 30,
    initiative_bonus:   m?.initiative_bonus ?? 0,
    current_initiative: m?.current_initiative ?? null,
    str: m?.str ?? 8,
    dex: m?.dex ?? 8,
    con: m?.con ?? 8,
    int: m?.int ?? 8,
    wis: m?.wis ?? 8,
    cha: m?.cha ?? 8,
    proficiency_bonus:          m?.proficiency_bonus ?? 2,
    skill_proficiencies:        { ...m?.skill_proficiencies },
    saving_throw_proficiencies: [...(m?.saving_throw_proficiencies ?? [])],
    conditions:  [...(m?.conditions ?? [])],
    inspiration: m?.inspiration ?? false,
    death_save_successes: m?.death_save_successes ?? 0,
    death_save_failures:  m?.death_save_failures ?? 0,
    notes:       m?.notes ?? "",
    sort_order:  m?.sort_order ?? 0,
    curses:      [...(m?.curses ?? [])],
    pp: m?.pp ?? 0,
    gp: m?.gp ?? 0,
    ep: m?.ep ?? 0,
    sp: m?.sp ?? 0,
    cp: m?.cp ?? 0,
    tool_proficiencies:  [...(m?.tool_proficiencies ?? [])],
    languages:           [...(m?.languages ?? [])],
    weapon_masteries:    [...(m?.weapon_masteries ?? [])],
    // #786: an override, not the member's location — null means "with the
    // party". Carried through unmodified; nothing in this form edits it.
    current_location_id: m?.current_location_id ?? null,
    carry_capacity_override: m?.carry_capacity_override ?? null,
    class_resources:  m?.class_resources ?? {},
    class_choices:    m?.class_choices ?? {},
    active_infusions: m?.active_infusions ?? [],
    custom_attacks: m?.custom_attacks ?? [],
    rage_active:      m?.rage_active ?? false,
    alignment:          m?.alignment ?? "",
    personality_traits: m?.personality_traits ?? "",
    ideals:             m?.ideals ?? "",
    bonds:              m?.bonds ?? "",
    flaws:              m?.flaws ?? "",
    deity:              m?.deity ?? "",
    deity_id:           m?.deity_id ?? null,
    experience_points:  m?.experience_points ?? 0,
    age:                  m?.age ?? "",
    gender:               m?.gender ?? "",
    pronouns:             m?.pronouns ?? "",
    physical_description: m?.physical_description ?? "",
  });

  const f = reactive(buildFormState(existingMember.value));

  // On a cold load (PWA restart / hard refresh) the party query hasn't resolved
  // when the form is first built, so `existingMember` is null and `f` seeds to
  // level-1 defaults — saving would then overwrite the real character. Reseed
  // once, the first time the member resolves, but only if the form wasn't already
  // built from a loaded member (warm load) so we never clobber in-progress edits.
  let seededFromMember = !!existingMember.value;
  watch(existingMember, (member) => {
    if (!member || seededFromMember || !isEditMode.value) return;
    Object.assign(f, buildFormState(member));
    portraitUrl.value = member.portrait_url ?? "";
    focalPoint.value = member.portrait_focal_point ?? null;
    seededFromMember = true;
  });

  // When a formula is active, keep f.ac in sync whenever ability scores change.
  // Must be placed after f is defined (watch getter runs immediately on setup).
  watch(
    () => [f.dex, f.con, f.wis, f.ac_formula] as const,
    () => {
      if (!f.ac_formula) return;
      f.ac = computeAc(f.ac_formula, f);
    },
  );

  const {
    importBackgroundEquipment,
    classEquipmentChoice, importClassEquipment, classEquipmentPack,
    lookupVaultItems, seedEquipmentEntry,
  } = useCharacterEquipmentSeeding(f, { addInventoryItem, addInventoryItems });

  const {
    bgSkillChoices, bgChosenSkills, bgChoiceLimit, bgFreeSkills,
    onBackgroundSelect, toggleBgSkillChoice,
    backgroundAsiChoice, backgroundAsiIncomplete,
  } = useCharacterBackgroundSelection(f, { allBackgrounds, selectedBg, is2024 });

  // ── Point buy ────────────────────────────────────────────────────────────────

  const totalSpent      = computed(() => ABILITY_STATS.reduce((sum, stat) => sum + (POINT_BUY_COSTS[f[stat.key]] ?? 0), 0));
  const pointsRemaining = computed(() => POINT_BUY_TOTAL - totalSpent.value);

  // ── Spell slots ───────────────────────────────────────────────────────────────

  // Slot tables differ by edition (a level-1 2024 Paladin has two slots), so the
  // character's own edition is passed, never assumed. Before the player has
  // chosen one there is no class to give slots to either.
  //
  // Editing derives from the member's class rows, each resolved through the
  // definition it is pinned to (multiclass-aware); `party_members.class` is a
  // mirror label and never builds slots. Creating has no rows yet, so the one
  // class the player picked stands in as a single row, resolved through its
  // definition too.
  function defaultSlots(): SpellSlotEntry[] {
    const em = existingMember.value;
    const ruleset = em?.ruleset ?? chosenRuleset.value;
    if (!ruleset) return [];
    if (em) {
      const rows = memberClassRows.value;
      const system = allSystemClasses.value;
      const custom = allCustomClasses.value;
      if (!rows || !system || !custom) return []; // still loading: the watch below seeds once they land
      return deriveEffectiveSpellSlots({ spell_slots: null }, rows, ruleset, (row) =>
        (row.class_definition_kind === "custom" ? custom : system).find((c) => c.id === row.class_definition_id));
    }
    const cls = selectedClass.value;
    if (!cls) return [];
    return deriveEffectiveSpellSlots(
      { spell_slots: null },
      [{ class_name: cls.class_name, levels: f.level, class_definition_kind: cls.definition_kind }],
      ruleset,
      () => cls,
    );
  }

  function buildSlotMaxes(): number[] {
    const em = existingMember.value;
    if (em?.spell_slots?.length) {
      return Array.from({ length: 9 }, (_, i) => em.spell_slots!.find((s) => s.level === i + 1)?.max ?? 0);
    }
    const defaults = defaultSlots();
    return Array.from({ length: 9 }, (_, i) => defaults.find((s) => s.level === i + 1)?.max ?? 0);
  }
  const spellSlotMaxes = reactive<number[]>(buildSlotMaxes());

  function resetSlotsToDefault() {
    const defaults = defaultSlots();
    Array.from({ length: 9 }, (_, i) => { spellSlotMaxes[i] = defaults.find((s) => s.level === i + 1)?.max ?? 0; });
  }
  // The class rows and their definitions arrive after the form is built, so an
  // edit with no stored slots is seeded when they land, unless the player has
  // already typed maxima of their own.
  watch(
    () => [memberClassRows.value, allSystemClasses.value, allCustomClasses.value] as const,
    () => {
      if (existingMember.value && !spellSlotMaxes.some((v) => v !== 0)) {
        buildSlotMaxes().forEach((max, i) => { spellSlotMaxes[i] = max; });
      }
    },
  );
  watch(() => f.class, () => { if (spellSlotMaxes.every((v) => v === 0)) resetSlotsToDefault(); });

  // ── Species selection ─────────────────────────────────────────────────────────

  function onSpeciesSelect(id: string) {
    const sp = (allSpecies.value ?? []).find(s => s.id === id);
    f.species_id = id || null;
    f.subrace = "";
    if (sp?.languages?.length) {
      for (const lang of sp.languages) {
        if (!f.languages.includes(lang)) f.languages.push(lang);
      }
    }
    if (sp?.speed?.walk) f.speed = sp.speed.walk;
  }

  // ── Class selection ───────────────────────────────────────────────────────────

  function onClassSelect(choiceKey: string) {
    const cls = mergedClasses.value.find(c => c.choice_key === choiceKey);
    if (!cls) return;
    selectedClassKey.value = choiceKey;
    f.class   = cls.class_name;
    f.subclass = "";
    if (cls?.saving_throws?.length) {
      f.saving_throw_proficiencies = [...cls.saving_throws] as SaveKey[];
    }
    resetSlotsToDefault();
  }

  // ── Changing the edition ──────────────────────────────────────────────────────
  // The reset for a different edition (see `useCharacterCreationEdition`): it
  // needs the form fields and handlers declared above, hence registered here.
  onEditionChange(() => {
    const oldSpecies = selectedSpecies.value;
    for (const lang of oldSpecies?.languages ?? []) {
      const idx = f.languages.indexOf(lang);
      if (idx >= 0) f.languages.splice(idx, 1);
    }
    if (oldSpecies) f.speed = 30;
    onSpeciesSelect("");
    onBackgroundSelect("");
    selectedClassKey.value = "";
    f.class = "";
    f.subclass = "";
    f.saving_throw_proficiencies = [];
    resetSlotsToDefault();
  });

  // ── Helpers ───────────────────────────────────────────────────────────────────

  function mod(score: number) { return Math.floor((score - 10) / 2); }

  const profBonus = computed(() => {
    const l = f.level;
    if (l >= 17) return 6; if (l >= 13) return 5; if (l >= 9) return 4; if (l >= 5) return 3; return 2;
  });

  const suggestedHp = computed(() => {
    const cls = mergedClasses.value.find(c => c.class_name === f.class);
    if (!cls) return null;
    const conMod = mod(f.con);
    return cls.hit_die + conMod + Math.max(0, (f.level - 1) * (Math.ceil(cls.hit_die / 2) + 1 + conMod));
  });

  function setSkillProf(key: keyof typeof f.skill_proficiencies, val: SkillProfLevel) {
    f.skill_proficiencies[key] = val;
  }
  function skillBonus(key: keyof typeof f.skill_proficiencies, ability: SaveKey): string {
    const base  = mod(f[ability]);
    const prof  = f.skill_proficiencies[key] ?? "none";
    const bonus = prof === "proficient" ? base + profBonus.value : prof === "expertise" ? base + profBonus.value * 2 : base;
    return (bonus >= 0 ? "+" : "") + bonus;
  }
  function toggleSave(key: SaveKey) {
    const idx = f.saving_throw_proficiencies.indexOf(key);
    if (idx >= 0) f.saving_throw_proficiencies.splice(idx, 1); else f.saving_throw_proficiencies.push(key);
  }
  function saveBonus(key: SaveKey): string {
    const base  = mod(f[key]);
    const bonus = f.saving_throw_proficiencies.includes(key) ? base + profBonus.value : base;
    return (bonus >= 0 ? "+" : "") + bonus;
  }

  const passivePerception    = computed(() => { const b = mod(f.wis); const p = f.skill_proficiencies.perception    ?? "none"; return 10 + b + (p === "proficient" ? profBonus.value : p === "expertise" ? profBonus.value * 2 : 0); });
  const passiveInsight       = computed(() => { const b = mod(f.wis); const p = f.skill_proficiencies.insight       ?? "none"; return 10 + b + (p === "proficient" ? profBonus.value : p === "expertise" ? profBonus.value * 2 : 0); });
  const passiveInvestigation = computed(() => { const b = mod(f.int); const p = f.skill_proficiencies.investigation ?? "none"; return 10 + b + (p === "proficient" ? profBonus.value : p === "expertise" ? profBonus.value * 2 : 0); });

  // ── Save ──────────────────────────────────────────────────────────────────────

  async function save(levelUp = false) {
    if (!f.name.trim() || saving.value) return;
    saving.value = true;

    const isNew = !isEditMode.value;

    if (isNew) {
      // ── Apply species ASI (standard = auto-apply structured bonuses; custom = distribute freely) ─
      const abilityKeyMap: Record<string, AbilityKey> = {
        strength: "str", dexterity: "dex", constitution: "con",
        intelligence: "int", wisdom: "wis", charisma: "cha",
        str: "str", dex: "dex", con: "con", int: "int", wis: "wis", cha: "cha",
      };
      function applyStructuredAsi(asi: Record<string, number | string>) {
        if ("description" in asi) return; // free-text — player set scores manually
        for (const [key, val] of Object.entries(asi)) {
          const fKey = abilityKeyMap[key.toLowerCase()];
          if (fKey && typeof val === "number") f[fKey] = Math.min(20, f[fKey] + val);
        }
      }
      if (asiMode.value === "bonus") {
        if (selectedSpecies.value?.ability_score_increases)
          applyStructuredAsi(selectedSpecies.value.ability_score_increases);
        if (selectedSubrace.value?.ability_score_increases)
          applyStructuredAsi(selectedSubrace.value.ability_score_increases);
      } else if (asiMode.value === "custom") {
        // Custom replaces ALL racial ASIs — player distributes freely
        for (const [key, val] of Object.entries(customAsi) as [AbilityKey, number][]) {
          if (val > 0) f[key] = Math.min(20, f[key] + val);
        }
      }

      // ── 2024 PHB background ASI (new chars only) — additive on top of species ──
      // Applied once, here, from the choice recorded in class_choices.background_asi.
      // An incomplete/invalid choice grants nothing rather than guessing.
      if (selectedBg.value?.asi_ability_trio) {
        const bonuses = abilityBonusesForChoice(backgroundAsiChoice.value, selectedBg.value.asi_ability_trio);
        for (const [key, delta] of Object.entries(bonuses) as [AbilityKey, number][]) {
          f[key] = Math.min(20, f[key] + delta);
        }
      }

      // ── Derive all stats from class / species sources — no magic numbers ───
      f.level = 1;
      f.proficiency_bonus = 2;

      const cls = selectedClass.value;
      const hp  = cls ? Math.max(1, cls.hit_die + Math.floor((f.con - 10) / 2)) : 8;
      f.max_hp     = hp;
      f.current_hp = hp;
      f.ac         = 10 + Math.floor((f.dex - 10) / 2);       // unarmored default
      f.speed      = selectedSpecies.value?.speed?.walk ?? 30;
      // initiative_bonus is the EXTRA on top of the DEX mod (feat/special bonuses,
      // e.g. Alert), not the total — the DEX mod is added wherever initiative is
      // shown/rolled. A fresh character has no such extra.
      f.initiative_bonus  = 0;
      f.hit_dice_remaining = 1;
    }

    // ── Spell slots from the edited maxes (mirrors PartyMemberForm) ─────────
    // Persist the player's actual spellSlotMaxes rather than re-deriving the
    // single-class default table — that overwrite lost multiclass/pact slots and
    // wiped a custom-class caster's slots entirely (getDefaultSpellSlots returns
    // nothing for a custom class) on any unrelated save. spellSlotMaxes is seeded
    // from the existing row (buildSlotMaxes), so an untouched save round-trips.
    const spellSlots: SpellSlotEntry[] = spellSlotMaxes
      .map((max, i) => {
        const existing = existingMember.value?.spell_slots?.find((e) => e.level === i + 1);
        return { level: i + 1, max, used: max > 0 ? (existing?.used ?? 0) : 0 };
      })
      .filter((s) => s.max > 0);

    // `class` and `subclass` stay out of the payload: they are the database's
    // mirror of the primary class row, and a written value is overwritten.
    const { class: _class, subclass: _subclass, ...formFields } = f;
    const basePayload = {
      ...formFields,
      name:        f.name.trim(),
      player_name: f.player_name || auth.membership?.display_name || null,
      subrace:     f.subrace || null,
      notes:       f.notes || null,
      alignment:            f.alignment || null,
      personality_traits:   f.personality_traits || null,
      ideals:               f.ideals || null,
      bonds:                f.bonds || null,
      flaws:                f.flaws || null,
      deity:                f.deity || null,
      deity_id:             f.deity_id || null,
      age:                  f.age || null,
      gender:               f.gender || null,
      pronouns:             f.pronouns || null,
      physical_description: f.physical_description || null,
      portrait_url:         portraitUrl.value || null,
      portrait_focal_point: focalPoint.value,
      spell_slots:          spellSlots,
    };

    try {
      if (!isNew && existingMember.value) {
        // ── Edit flow ─────────────────────────────────────────────────────────
        const { campaign_id: _cid, owner_user_id: _owner, ...updatePayload } = basePayload;
        await update({ id: existingMember.value.id, update: updatePayload });
        // Apply any newly unlocked species grants (e.g. Tiefling Darkness at level 5)
        let freePicks: SpeciesSpellGrant[] = [];
        if (selectedSpecies.value) {
          freePicks = await applySpeciesSpellGrants(
            existingMember.value.id, selectedSpecies.value, f.level,
            f.subrace || existingMember.value.subrace || null,
          );
        }
        // If free-pick grants need manual selection, land on the innate tab
        router.push(freePicks.length > 0 ? "/play/spells?tab=innate" : "/play/champions");
      } else {
        // ── Create flow ───────────────────────────────────────────────────────
        const creatorId = auth.user?.id;
        // An unowned character is not a degraded success — no list view in the
        // app returns one (#738). Refuse to create it rather than orphan it.
        if (!creatorId) throw new Error("You must be signed in to create a character.");
        // The edition step cannot be left without a choice; this is the last
        // line against a character that has none (the database refuses it too).
        const ruleset = chosenRuleset.value;
        if (!ruleset) throw new Error("Choose an edition before creating the character.");
        // A class the player picked must resolve to a definition: every class row
        // is pinned to one, so a name that matches none is an error to show, not
        // a row without a pin.
        const pickedClass = f.class ? selectedClass.value : null;
        if (f.class && !pickedClass) {
          throw new Error(`${f.class} is not available in this edition. Pick a class again.`);
        }
        const created = await create({
          ...basePayload,
          ruleset,
          ...resolveCharacterPlacement({
            isDmCreate: isDmCreate.value,
            activeCampaignId: campaign.activeCampaignId,
            creatorId,
          }),
        });

        // The shell row now exists but the character isn't usable until its
        // class/spells/equipment are seeded. If any seeding step fails, roll the
        // whole thing back so we don't leave an orphaned, broken half-character
        // (which a retry would then duplicate). party_members delete cascades
        // character_classes/character_spells and SET-NULLs the campaign_member
        // link; seeded inventory only SET-NULLs carried_by, so delete it first.
        // The campaign the character ends up in: a DM roster row is created
        // there, a seated player's character is brought there, anything else
        // stays in the pool.
        let landedCampaignId = created.campaign_id;
        let attachedNow = false;
        try {
          // Every choice the character has is written BEFORE it is attached: the
          // table reviews them at attach time (#943), and a review that only saw
          // species and background would seat the character and then flag it.

          // Seed level 1 character_classes row
          if (pickedClass) {
            await addCharacterClass({
              party_member_id: created.id,
              class_name:      f.class,
              class_definition_id: pickedClass.id,
              class_definition_kind: pickedClass.definition_kind,
              subclass_name:   null,          // subclass comes from LevelUpWizard
              subclass_definition_id: null,
              levels:          1,
              is_primary:      true,
              hit_dice_used:   0,
              sort_order:      0,
            });
          }

          if (selectedSpecies.value) {
            await applySpeciesSpellGrants(created.id, selectedSpecies.value, 1, f.subrace || null);
          }

          const joinCampaignId = campaignToAttachAfterCreate(landingCampaign.value, isDmCreate.value);
          if (joinCampaignId) {
            // A table that does not take this edition leaves the character in
            // the pool, and so does a bounce on the attach itself (the DM may
            // have changed the setting since the step was shown). Anything else
            // failing is a real error and rolls back below.
            const table = campaign.activeCampaign;
            let restsInPool = !!table && !isRulesetAdmissible({ ruleset }, table);
            if (!restsInPool) {
              try {
                await attachCharacter({ partyMemberId: created.id, campaignId: joinCampaignId });
                landedCampaignId = joinCampaignId;
                attachedNow = true;
              } catch (attachErr) {
                if (!parseRulesetBounce(attachErr)) throw attachErr;
                restsInPool = true;
              }
            }
            if (restsInPool) {
              const tableName = table?.name ?? "That table";
              const tableRules = table ? `plays the ${rulesetRules(table.ruleset)}` : "does not take this edition";
              useToast().info(`${f.name.trim()} rests in your pool: ${tableName} ${tableRules}.`);
            }
          }

          // Seed class + background starting equipment as inventory rows — only
          // when the character actually landed in a campaign. party_inventory.campaign_id
          // is NOT NULL, and a standalone character (#729/#730) has none to seed
          // into; class_choices/character_classes/character_spells above are keyed
          // on the character alone, so those still run regardless.
          // Plain entries from both sources batch into a single insert; any
          // "pack" entries (e.g. a class's starting Pack) still need their
          // generated id before their contents can be inserted, so those go
          // through seedEquipmentEntry (which itself batches the pack's
          // sub-items) one at a time — see partitionBundleEntries above.
          if (landedCampaignId) {
            const plainRows: Omit<PartyInventoryInsert, "campaign_id">[] = [];
            let packEntries: EquipmentEntry[] = [];
            let packVaultMap: Map<string, VaultEntry> = new Map();

            if (importClassEquipment.value && f.class) {
              const classPack = CLASS_EQUIPMENT[f.class];
              if (classPack) {
                const bundle = classEquipmentChoice.value === "a" ? classPack.a : classPack.b;
                const uniqueNames = [...new Set(bundle.items.map(e => e.name))];
                packVaultMap = await lookupVaultItems(uniqueNames);
                const split = partitionBundleEntries(bundle.items, packVaultMap, created.id);
                plainRows.push(...split.plainRows);
                packEntries = split.packEntries;
              }
            }

            // Seed background starting equipment as inventory rows (text-based, no vault lookup)
            if (importBackgroundEquipment.value && f.background_id) {
              const bg = (allBackgrounds.value ?? []).find((b) => b.id === f.background_id);
              plainRows.push(...buildBackgroundEquipmentRows(bg?.equipment ?? "", created.id));
            }

            if (plainRows.length > 0) await addInventoryItems(plainRows);
            for (const entry of packEntries) {
              await seedEquipmentEntry(entry, packVaultMap, created.id);
            }
          }
        } catch (seedErr) {
          await supabase.from("party_inventory").delete().eq("carried_by", created.id);
          await supabase.from("party_members").delete().eq("id", created.id);
          throw seedErr;
        }

        // The review ran inside the attach: a character the table did not approve
        // is seated but benched. Reading how many choices wait happens outside the
        // rollback above, since a failed read is no reason to delete a made character.
        let benchedChoices = 0;
        if (attachedNow) {
          try {
            benchedChoices = await waitingAfterAttach(created.id);
          } catch (readErr) {
            const toast = useToast();
            toast.error(toast.fromError(readErr));
          }
        }

        await auth.refreshMembership();
        // Campaign-less first: a DM create with no campaign selected lands in
        // the pool, not on a roster, so /party would be an empty list view
        // (#738). Ordering this after the isDmCreate branch is what sent the
        // character somewhere it could never appear.
        if (!landedCampaignId) {
          // Standalone create (#729/#730): no campaign to land in — the character
          // pool is the list view / success feedback, same as any other create.
          void queryClient.invalidateQueries({ queryKey: ["character-pool"] });
        }
        if (benchedChoices > 0) {
          useToast().info(benchedMessage(f.name.trim(), campaign.activeCampaign?.name ?? null, benchedChoices));
        }
        void router.push(createDestination({
          landedCampaignId, isDmCreate: isDmCreate.value, levelUp, benched: benchedChoices > 0, characterId: created.id,
        }));
      }
    } catch (e) {
      // Surface the failure (incl. a rolled-back partial creation) to the user
      // instead of letting it become an unhandled rejection from the @click.
      const toast = useToast();
      toast.error(toast.fromError(e, "Couldn't save the character. Please try again."));
    } finally {
      saving.value = false;
    }
  }

  return {
    // router
    router,
    // auth
    auth,
    // form state
    f, activeTab, wizardStep, saving, scoreMode,
    // edition (new characters): chosen on the first step, never written after create
    chosenRuleset, chooseRuleset, landingCampaign,
    portraitUrl, focalPoint, spellSlotMaxes,
    importBackgroundEquipment,
    classEquipmentChoice, importClassEquipment, classEquipmentPack,
    // ASI (new chars)
    asiMode, customAsi, customAsiTotal, adjustCustomAsi,
    // computed
    isEditMode, isDmCreate, existingMember, backRoute,
    allBackgrounds,
    speciesChoices, backgroundOptions, selectedSpecies, subraceOptions,
    selectedClass, selectedBg, selectedSubrace,
    mergedClasses, selectedClassKey,
    pointsRemaining, suggestedHp, profBonus,
    derivedHp, derivedAc, derivedSpeed, derivedInitiative,
    passivePerception, passiveInsight, passiveInvestigation,
    // background skill grants/choices
    bgSkillChoices, bgChosenSkills, bgChoiceLimit, bgFreeSkills,
    // background 2024 ASI choice
    backgroundAsiChoice, backgroundAsiIncomplete,
    // methods
    mod, setSkillProf, skillBonus, toggleSave, saveBonus,
    resetSlotsToDefault, onSpeciesSelect, onClassSelect, onBackgroundSelect,
    toggleBgSkillChoice,
    save,
  };
}

export type CharacterCreationForm = ReturnType<typeof useCharacterCreationForm>;
export const CHARACTER_FORM_KEY: InjectionKey<CharacterCreationForm> = Symbol("characterCreationForm");
