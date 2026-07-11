import { ref, reactive, computed, watch, type InjectionKey } from "vue";
import { useRouter, useRoute } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { useParty, useCreatePartyMember, useUpdatePartyMember } from "@/composables/useParty";
import { useAddCharacterClass } from "@/composables/useCharacterClasses";
import { useAddInventoryItem, useAddInventoryItems } from "@/composables/usePartyInventory";
import { useCampaignMembers, useUpdateCampaignMember } from "@/composables/useCampaignMembers";
import { parseBackgroundSkills, type SkillKey } from "@/lib/backgroundSkills";
import { useAllSystemClasses, useAllCustomClasses } from "@/composables/useCustomClasses";
import { useAllCustomSubclasses } from "@/composables/useCustomSubclasses";
import { useAllSpecies } from "@/composables/useSpecies";
import { useBackgrounds } from "@/composables/useBackgrounds";
import { getDefaultSpellSlots } from "@/types/spell.types";
import { applySpeciesSpellGrants } from "@/composables/useCharacterSpells";
import type { SpeciesSpellGrant } from "@/types/species.types";
import { computeAc } from "@/types/party.types";
import type { PartyMember, PartyMemberInsert, SkillProfLevel, SaveKey, SpellSlotEntry } from "@/types/party.types";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/composables/useToast";
import { CLASS_EQUIPMENT } from "@/data/classEquipment";
import type { BundleItemEntry } from "@/types/item.types";

// ── Constants (exported for use in template components) ───────────────────────

export const SLOT_LEVEL_LABELS = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"] as const;

export const EDIT_TABS = [
  { id: "identity", label: "Identity" },
  { id: "stats",    label: "Stats" },
  { id: "profs",    label: "Proficiencies" },
] as const;

export const WIZARD_STEPS = [
  { id: "basics",     label: "Basics" },
  { id: "abilities",  label: "Abilities" },
  { id: "background", label: "Background" },
  { id: "class",      label: "Class" },
  { id: "equipment",  label: "Equipment" },
  { id: "done",       label: "Done" },
] as const;

/** Edit mode skips the equipment step — character already has gear. */
export const WIZARD_STEPS_EDIT = [
  { id: "basics",     label: "Basics" },
  { id: "abilities",  label: "Abilities" },
  { id: "background", label: "Background" },
  { id: "class",      label: "Class" },
  { id: "done",       label: "Done" },
] as const;

export type AsiMode = "bonus" | "custom" | "manual";
export type AbilityKey = "str" | "dex" | "con" | "int" | "wis" | "cha";

export const ABILITY_STATS = [
  { key: "str" as const, label: "STR" },
  { key: "dex" as const, label: "DEX" },
  { key: "con" as const, label: "CON" },
  { key: "int" as const, label: "INT" },
  { key: "wis" as const, label: "WIS" },
  { key: "cha" as const, label: "CHA" },
];

export const SAVE_STATS = [
  { key: "str" as SaveKey, label: "Strength" },
  { key: "dex" as SaveKey, label: "Dexterity" },
  { key: "con" as SaveKey, label: "Constitution" },
  { key: "int" as SaveKey, label: "Intelligence" },
  { key: "wis" as SaveKey, label: "Wisdom" },
  { key: "cha" as SaveKey, label: "Charisma" },
];

export const PROF_LEVELS: { value: SkillProfLevel; label: string }[] = [
  { value: "none",       label: "–" },
  { value: "proficient", label: "P" },
  { value: "expertise",  label: "E" },
];

export const SCORE_MODES = [
  { id: "pointbuy" as const, label: "Point Buy" },
  { id: "array"    as const, label: "Standard Array" },
  { id: "roll"     as const, label: "Roll 4d6" },
  { id: "manual"   as const, label: "Manual" },
];

export type ScoreMode = (typeof SCORE_MODES)[number]["id"];

export const POINT_BUY_COSTS: Record<number, number> = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
export const POINT_BUY_TOTAL = 27;

/** Standard array per 5e PHB, highest first. */
export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8] as const;

/** Roll 4d6 and drop the lowest die. Returns the sum of the three kept dice. */
export function roll4d6DropLowest(): number {
  const rolls = [
    Math.floor(Math.random() * 6) + 1,
    Math.floor(Math.random() * 6) + 1,
    Math.floor(Math.random() * 6) + 1,
    Math.floor(Math.random() * 6) + 1,
  ];
  rolls.sort((a, b) => b - a);
  return rolls[0] + rolls[1] + rolls[2];
}

// ── Composable ────────────────────────────────────────────────────────────────

export function useCharacterCreationForm() {
  const router = useRouter();
  const route  = useRoute();
  const auth   = useAuthStore();

  const { data: allSpecies }    = useAllSpecies();
  const { data: allBackgrounds } = useBackgrounds();

  const speciesOptions    = computed(() => (allSpecies.value    ?? []).map(s => ({ id: s.id, name: s.name })));
  const backgroundOptions = computed(() => (allBackgrounds.value ?? []).map(b => ({ id: b.id, name: b.name })));
  const selectedSpecies   = computed(() => (allSpecies.value ?? []).find(s => s.id === f.species_id) ?? null);
  const subraceOptions    = computed(() => selectedSpecies.value?.subraces?.map(sr => sr.name) ?? []);

  const { data: systemClasses } = useAllSystemClasses();
  const { data: customClasses } = useAllCustomClasses();
  const { data: allSubclasses } = useAllCustomSubclasses();

  const mergedClasses = computed(() => {
    const byName = new Map<string, { class_name: string; hit_die: number; primary_ability: string | null; saving_throws: string[]; subclass_level: number; features: Record<string, string[]> }>();
    for (const c of systemClasses.value ?? []) byName.set(c.class_name, c);
    for (const c of customClasses.value  ?? []) { if (!byName.has(c.class_name)) byName.set(c.class_name, c); }
    return [...byName.values()].sort((a, b) => a.class_name.localeCompare(b.class_name));
  });

  const allClassNames   = computed(() => mergedClasses.value.map(c => c.class_name));
  const subclassOptions = computed(() => {
    if (!f.class) return [];
    return (allSubclasses.value ?? []).filter(sc => sc.class_name === f.class).map(sc => sc.subclass_name).sort();
  });

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
  const selectedClass   = computed(() => mergedClasses.value.find(c => c.class_name === f.class) ?? null);
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

  const isEditMode = computed(() => route.name === "play-character-edit");
  const isDmCreate = computed(() => route.name === "party-member-new");
  const { data: partyMembers }    = useParty();
  const { data: campaignMembers } = useCampaignMembers();
  const { mutateAsync: create }               = useCreatePartyMember();
  const { mutateAsync: update }               = useUpdatePartyMember();
  const { mutateAsync: addCharacterClass }    = useAddCharacterClass();
  const { mutateAsync: addInventoryItem }      = useAddInventoryItem();
  const { mutateAsync: addInventoryItems }     = useAddInventoryItems();
  const { mutateAsync: updateCampaignMember } = useUpdateCampaignMember();

  const editMemberId = computed(() =>
    (route.query.memberId as string | undefined) ?? auth.linkedPartyMemberId ?? null,
  );
  const existingMember = computed(() =>
    editMemberId.value && partyMembers.value
      ? (partyMembers.value.find((m) => m.id === editMemberId.value) ?? null)
      : null,
  );
  const backRoute = isDmCreate.value || (route.query.memberId as string | undefined) ? "/party" : "/play";

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
  ): Omit<PartyMemberInsert, "sort_order" | "portrait_url" | "spell_slots"> & { sort_order: number } => ({
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
    current_location_id: m?.current_location_id ?? null,
    carry_capacity_override: m?.carry_capacity_override ?? null,
    class_resources:  m?.class_resources ?? {},
    class_choices:    m?.class_choices ?? {},
    active_infusions: m?.active_infusions ?? [],
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

  // Whether to import the chosen background's equipment text into inventory
  // on creation. Defaults to true so new characters don't end up empty-handed;
  // the player can untick it on the Background step.
  const importBackgroundEquipment = ref(true);

  // Exact record of the proficiencies the *currently selected* background
  // granted. Used to undo them when the player switches background — otherwise
  // each newly-picked background's skills/tools/languages accumulate on top of
  // the previous one's, and the orphaned skills wrongly count against the class
  // skill budget (they're no longer recognised as background-granted).
  const bgGrantedSkills = ref<SkillKey[]>([]);
  const bgGrantedTools = ref<string[]>([]);
  const bgGrantedLanguages = ref<string[]>([]);
  // Subset of bgGrantedSkills the player actively chose for a background "choose
  // one of …" clause (vs. the unconditional fixed grants). Drives the picker's
  // selected state and enforces the choice's pick count.
  const bgChosenSkills = ref<SkillKey[]>([]);

  // Class starting equipment: choice A or B, and whether to seed inventory.
  const classEquipmentChoice = ref<"a" | "b">("a");
  const importClassEquipment  = ref(true);

  /** The two equipment bundles for the currently chosen class (null if class has no data). */
  const classEquipmentPack = computed(() => f.class ? (CLASS_EQUIPMENT[f.class] ?? null) : null);

  /** Vault item data needed for equipment seeding. */
  interface VaultEntry { id: string; bundle_items: BundleItemEntry[] | null }

  /** Look up vault items by name (case-insensitive). Returns Map<lowercaseName, VaultEntry>. */
  async function lookupVaultItems(names: string[]): Promise<Map<string, VaultEntry>> {
    if (names.length === 0) return new Map();
    const filter = names.map(n => `name.ilike.${n}`).join(",");
    const { data } = await supabase.from("items").select("id, name, bundle_items").or(filter);
    const map = new Map<string, VaultEntry>();
    for (const row of data ?? []) {
      map.set((row.name as string).toLowerCase(), {
        id: row.id as string,
        bundle_items: row.bundle_items as BundleItemEntry[] | null,
      });
    }
    return map;
  }

  /**
   * Seed one equipment entry into party_inventory.
   * If the vault item is a pack (has bundle_items), the pack itself becomes an
   * is_container=true row and each sub-item is inserted with container_id pointing to it.
   */
  async function seedEquipmentEntry(
    entry: { name: string; quantity?: number },
    vaultMap: Map<string, VaultEntry>,
    carrierId: string,
  ): Promise<void> {
    const vault = vaultMap.get(entry.name.toLowerCase()) ?? null;
    const bundleItems = vault?.bundle_items;

    if (bundleItems && bundleItems.length > 0) {
      // Pack: insert the pack itself as a container
      const packRow = await addInventoryItem({
        item_id: vault!.id, name: entry.name, quantity: entry.quantity ?? 1,
        carried_by: carrierId, location: "backpack",
        slot: null, is_container: true, container_id: null,
        is_attuned: false, is_equipped: false, notes: null,
        current_charges: null, is_identified: true, is_ruined: false, sort_order: 0,
      });
      // Look up the sub-items and batch-insert them inside the pack
      const subNames = [...new Set(bundleItems.map(b => b.name))];
      const subMap = await lookupVaultItems(subNames);
      await addInventoryItems(
        bundleItems.map((sub) => {
          const subVault = subMap.get(sub.name.toLowerCase()) ?? null;
          return {
            item_id: subVault?.id ?? null, name: sub.name, quantity: sub.quantity ?? 1,
            carried_by: carrierId, location: "container" as const,
            slot: null, is_container: false, container_id: packRow.id,
            is_attuned: false, is_equipped: false, notes: null,
            current_charges: null, is_identified: true, is_ruined: false, sort_order: 0,
          };
        }),
      );
    } else {
      // Plain item
      await addInventoryItem({
        item_id: vault?.id ?? null, name: entry.name, quantity: entry.quantity ?? 1,
        carried_by: carrierId, location: "backpack",
        slot: null, is_container: false, container_id: null,
        is_attuned: false, is_equipped: false, notes: null,
        current_charges: null, is_identified: true, is_ruined: false, sort_order: 0,
      });
    }
  }

  // ── Point buy ────────────────────────────────────────────────────────────────

  const totalSpent      = computed(() => ABILITY_STATS.reduce((sum, stat) => sum + (POINT_BUY_COSTS[f[stat.key]] ?? 0), 0));
  const pointsRemaining = computed(() => POINT_BUY_TOTAL - totalSpent.value);

  // ── Spell slots ───────────────────────────────────────────────────────────────

  function buildSlotMaxes(): number[] {
    const em = existingMember.value;
    if (em?.spell_slots?.length) {
      return Array.from({ length: 9 }, (_, i) => em.spell_slots!.find((s) => s.level === i + 1)?.max ?? 0);
    }
    const defaults = getDefaultSpellSlots(em?.class ?? null, em?.level ?? 1);
    return Array.from({ length: 9 }, (_, i) => defaults.find((s) => s.level === i + 1)?.max ?? 0);
  }
  const spellSlotMaxes = reactive<number[]>(buildSlotMaxes());

  function resetSlotsToDefault() {
    const defaults = getDefaultSpellSlots(f.class || null, f.level);
    Array.from({ length: 9 }, (_, i) => { spellSlotMaxes[i] = defaults.find((s) => s.level === i + 1)?.max ?? 0; });
  }
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

  function onClassSelect(className: string) {
    f.class   = className;
    f.subclass = "";
    const cls = mergedClasses.value.find(c => c.class_name === className);
    if (cls?.saving_throws?.length) {
      f.saving_throw_proficiencies = [...cls.saving_throws] as SaveKey[];
    }
    resetSlotsToDefault();
  }

  // ── Background selection ──────────────────────────────────────────────────────

  function onBackgroundSelect(id: string) {
    const bg = (allBackgrounds.value ?? []).find(b => b.id === id);

    // Undo the previously-selected background's grants first, so switching
    // backgrounds replaces rather than accumulates. Only remove skills still at
    // exactly "proficient" (expertise would have come from the class, not here).
    for (const key of bgGrantedSkills.value) {
      if ((f.skill_proficiencies[key] ?? "none") === "proficient") {
        f.skill_proficiencies[key] = "none";
      }
    }
    for (const tool of bgGrantedTools.value) {
      const idx = f.tool_proficiencies.indexOf(tool);
      if (idx >= 0) f.tool_proficiencies.splice(idx, 1);
    }
    for (const lang of bgGrantedLanguages.value) {
      const idx = f.languages.indexOf(lang);
      if (idx >= 0) f.languages.splice(idx, 1);
    }
    bgGrantedSkills.value = [];
    bgGrantedTools.value = [];
    bgGrantedLanguages.value = [];
    bgChosenSkills.value = [];

    f.background_id = id || null;
    if (!bg) return;

    // Only auto-grant the background's FIXED skills. Choice skills ("either A
    // or B") are picked separately, so a choice background no longer toggles
    // every option on at once. Each grant is recorded so it can be undone above
    // when the background changes.
    const { fixed } = parseBackgroundSkills(bg.skill_proficiencies);
    for (const key of fixed) {
      if ((f.skill_proficiencies[key] ?? "none") === "none") {
        f.skill_proficiencies[key] = "proficient";
        bgGrantedSkills.value.push(key);
      }
    }
    for (const tool of bg.tool_proficiencies ?? []) {
      if (!f.tool_proficiencies.includes(tool)) {
        f.tool_proficiencies.push(tool);
        bgGrantedTools.value.push(tool);
      }
    }
    for (const lang of bg.languages ?? []) {
      if (!f.languages.includes(lang)) {
        f.languages.push(lang);
        bgGrantedLanguages.value.push(lang);
      }
    }
    // 2024 PHB: record background feat grant in class_choices so it surfaces
    // in the character's features tab.
    if (bg.feat_grant_name) {
      f.class_choices = { ...f.class_choices, background_feat: bg.feat_grant_name };
    } else {
      const { background_feat: _removed, ...rest } = f.class_choices as Record<string, unknown>;
      void _removed;
      f.class_choices = rest;
    }
  }

  /** Parsed "choose N of …" skill clauses for the selected background, if any. */
  const bgSkillChoices = computed(() =>
    selectedBg.value ? parseBackgroundSkills(selectedBg.value.skill_proficiencies).choices : [],
  );

  /** Total picks the background's choice clauses allow (used to cap selection). */
  const bgChoiceLimit = computed(() =>
    bgSkillChoices.value.reduce((sum, c) => sum + c.count, 0),
  );

  /** All skills the current background grants for free: fixed + actively chosen. */
  const bgFreeSkills = computed<SkillKey[]>(() => {
    const fixed = selectedBg.value
      ? parseBackgroundSkills(selectedBg.value.skill_proficiencies).fixed
      : [];
    return [...new Set([...fixed, ...bgChosenSkills.value])];
  });

  /** Toggle a background choice-skill. Honors the choice's pick limit and keeps
   *  the grant tracked so it's freed on background switch and excluded from the
   *  class skill budget. */
  function toggleBgSkillChoice(key: SkillKey) {
    const chosen = bgChosenSkills.value.includes(key);
    if (chosen) {
      bgChosenSkills.value = bgChosenSkills.value.filter(k => k !== key);
      bgGrantedSkills.value = bgGrantedSkills.value.filter(k => k !== key);
      if ((f.skill_proficiencies[key] ?? "none") === "proficient") {
        f.skill_proficiencies[key] = "none";
      }
      return;
    }
    if (bgChosenSkills.value.length >= bgChoiceLimit.value) return; // at limit
    bgChosenSkills.value.push(key);
    if ((f.skill_proficiencies[key] ?? "none") === "none") {
      f.skill_proficiencies[key] = "proficient";
      bgGrantedSkills.value.push(key);
    }
  }

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

      // ── Derive all stats from class / species sources — no magic numbers ───
      f.level = 1;
      f.proficiency_bonus = 2;

      const cls = selectedClass.value;
      const hp  = cls ? Math.max(1, cls.hit_die + Math.floor((f.con - 10) / 2)) : 8;
      f.max_hp     = hp;
      f.current_hp = hp;
      f.ac         = 10 + Math.floor((f.dex - 10) / 2);       // unarmored default
      f.speed      = selectedSpecies.value?.speed?.walk ?? 30;
      f.initiative_bonus  = Math.floor((f.dex - 10) / 2);
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

    const basePayload = {
      ...f,
      name:        f.name.trim(),
      player_name: f.player_name || auth.membership?.display_name || null,
      class:       f.class || null,
      subclass:    f.subclass || null,
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
        const created = await create({ ...basePayload, owner_user_id: isDmCreate.value ? null : (auth.user?.id ?? null) });

        // The shell row now exists but the character isn't usable until its
        // class/spells/equipment are seeded. If any seeding step fails, roll the
        // whole thing back so we don't leave an orphaned, broken half-character
        // (which a retry would then duplicate). party_members delete cascades
        // character_classes/character_spells and SET-NULLs the campaign_member
        // link; seeded inventory only SET-NULLs carried_by, so delete it first.
        try {
          // Link as active character for this player (skip when DM creates an unclaimed character)
          if (!isDmCreate.value) {
            const myMembership = (campaignMembers.value ?? []).find((cm) => cm.user_id === auth.user?.id);
            if (myMembership) {
              await updateCampaignMember({ id: myMembership.id, update: { party_member_id: created.id } });
            }
          }

          // Seed level 1 character_classes row
          if (f.class) {
            await addCharacterClass({
              party_member_id: created.id,
              class_name:      f.class,
              subclass_name:   null,          // subclass comes from LevelUpWizard
              levels:          1,
              is_primary:      true,
              hit_dice_used:   0,
              sort_order:      0,
            });
          }

          if (selectedSpecies.value) {
            await applySpeciesSpellGrants(created.id, selectedSpecies.value, 1, f.subrace || null);
          }

          // Seed class starting equipment with vault lookup (packs expand into their contents)
          if (importClassEquipment.value && f.class) {
            const classPack = CLASS_EQUIPMENT[f.class];
            if (classPack) {
              const bundle = classEquipmentChoice.value === "a" ? classPack.a : classPack.b;
              const uniqueNames = [...new Set(bundle.items.map(e => e.name))];
              const vaultMap = await lookupVaultItems(uniqueNames);
              for (const entry of bundle.items) {
                await seedEquipmentEntry(entry, vaultMap, created.id);
              }
            }
          }

          // Seed background starting equipment as inventory rows (text-based, no vault lookup)
          if (importBackgroundEquipment.value && f.background_id) {
            const bg = (allBackgrounds.value ?? []).find((b) => b.id === f.background_id);
            for (const entry of parseEquipmentList(bg?.equipment ?? "")) {
              await addInventoryItem({
                item_id: null, name: entry, quantity: 1,
                carried_by: created.id, location: "backpack",
                slot: null, is_container: false, container_id: null,
                is_attuned: false, is_equipped: false, notes: null,
                current_charges: null, is_identified: true, is_ruined: false, sort_order: 0,
              });
            }
          }
        } catch (seedErr) {
          await supabase.from("party_inventory").delete().eq("carried_by", created.id);
          await supabase.from("party_members").delete().eq("id", created.id);
          throw seedErr;
        }

        await auth.refreshMembership();
        if (isDmCreate.value) {
          router.push("/party");
        } else if (levelUp) {
          router.push(`/play/character/levelup?targetLevel=2&memberId=${created.id}`);
        } else {
          router.push("/play/champions");
        }
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

  /**
   * Split a free-text equipment list into individual entries. Open5e ships
   * background equipment as prose: "a holy symbol, a prayer book, vestments,
   * a set of common clothes, and a belt pouch containing 15 gp".
   * We split on commas + " and " (case-insensitive), trim, and drop empties.
   */
  function parseEquipmentList(prose: string): string[] {
    if (!prose.trim()) return [];
    return prose
      .split(/,| and /i)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  return {
    // router
    router,
    // auth
    auth,
    // form state
    f, activeTab, wizardStep, saving, scoreMode,
    portraitUrl, focalPoint, spellSlotMaxes,
    importBackgroundEquipment,
    classEquipmentChoice, importClassEquipment, classEquipmentPack,
    // ASI (new chars)
    asiMode, customAsi, customAsiTotal, adjustCustomAsi,
    // computed
    isEditMode, isDmCreate, existingMember, backRoute,
    allSpecies, allBackgrounds,
    speciesOptions, backgroundOptions, selectedSpecies, subraceOptions,
    selectedClass, selectedBg, selectedSubrace,
    mergedClasses, allClassNames, subclassOptions,
    pointsRemaining, suggestedHp, profBonus,
    derivedHp, derivedAc, derivedSpeed, derivedInitiative,
    passivePerception, passiveInsight, passiveInvestigation,
    // background skill grants/choices
    bgSkillChoices, bgChosenSkills, bgChoiceLimit, bgFreeSkills,
    // methods
    mod, setSkillProf, skillBonus, toggleSave, saveBonus,
    resetSlotsToDefault, onSpeciesSelect, onClassSelect, onBackgroundSelect,
    toggleBgSkillChoice,
    save,
  };
}

export type CharacterCreationForm = ReturnType<typeof useCharacterCreationForm>;
export const CHARACTER_FORM_KEY: InjectionKey<CharacterCreationForm> = Symbol("characterCreationForm");
