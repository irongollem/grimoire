import { ref, reactive, computed, watch, type InjectionKey } from "vue";
import { useRouter, useRoute } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { useParty, useCreatePartyMember, useUpdatePartyMember } from "@/composables/useParty";
import { useCampaignMembers, useUpdateCampaignMember } from "@/composables/useCampaignMembers";
import { SKILLS } from "@/types/party.types";
import { useAllSystemClasses, useAllCustomClasses } from "@/composables/useCustomClasses";
import { useAllCustomSubclasses } from "@/composables/useCustomSubclasses";
import { useAllSpecies } from "@/composables/useSpecies";
import { useBackgrounds } from "@/composables/useBackgrounds";
import { getDefaultSpellSlots } from "@/types/spell.types";
import type { PartyMemberInsert, SkillProfLevel, SaveKey, SpellSlotEntry } from "@/types/party.types";

// ── Constants (exported for use in template components) ───────────────────────

export const SLOT_LEVEL_LABELS = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"] as const;

export const EDIT_TABS = [
  { id: "identity", label: "Identity" },
  { id: "stats",    label: "Stats" },
  { id: "profs",    label: "Proficiencies" },
] as const;

export const WIZARD_STEPS = [
  { id: "identity",   label: "Identity" },
  { id: "species",    label: "Species" },
  { id: "class",      label: "Class" },
  { id: "background", label: "Background" },
  { id: "abilities",  label: "Abilities" },
  { id: "combat",     label: "Combat" },
  { id: "profs",      label: "Profs" },
  { id: "review",     label: "Review" },
] as const;

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
  { id: "manual"   as const, label: "Manual" },
];

export const POINT_BUY_COSTS: Record<number, number> = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
export const POINT_BUY_TOTAL = 27;

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

  const isEditMode = computed(() => route.name === "play-character-edit");
  const { data: partyMembers }    = useParty();
  const { data: campaignMembers } = useCampaignMembers();
  const { mutateAsync: create }               = useCreatePartyMember();
  const { mutateAsync: update }               = useUpdatePartyMember();
  const { mutateAsync: updateCampaignMember } = useUpdateCampaignMember();

  const editMemberId = computed(() =>
    (route.query.memberId as string | undefined) ?? auth.linkedPartyMemberId ?? null,
  );
  const existingMember = computed(() =>
    editMemberId.value && partyMembers.value
      ? (partyMembers.value.find((m) => m.id === editMemberId.value) ?? null)
      : null,
  );
  const backRoute = (route.query.memberId as string | undefined) ? "/party" : "/play";

  const activeTab  = ref<"identity" | "stats" | "profs">("identity");
  const wizardStep = ref(0);
  const saving     = ref(false);
  const scoreMode  = ref<"pointbuy" | "manual">("pointbuy");

  const portraitUrl = ref(existingMember.value?.portrait_url ?? "");
  const focalPoint  = ref<{ x: number; y: number } | null>(existingMember.value?.portrait_focal_point ?? null);
  const cardArtUrl  = ref(existingMember.value?.card_art_url ?? "");

  const m = existingMember.value;
  const f = reactive<Omit<PartyMemberInsert, "sort_order" | "portrait_url" | "card_art_url" | "spell_slots"> & { sort_order: number }>({
    campaign_id:   m?.campaign_id ?? null,
    name:          m?.name ?? "",
    player_name:   m?.player_name ?? auth.membership?.display_name ?? "",
    class:         m?.class ?? "",
    subclass:      m?.subclass ?? "",
    level:         m?.level ?? 1,
    race:          m?.race ?? "",
    subrace:       m?.subrace ?? "",
    species_id:    m?.species_id ?? null,
    background:    m?.background ?? "",
    background_id: m?.background_id ?? null,
    max_hp:        m?.max_hp ?? 10,
    current_hp:    m?.current_hp ?? 10,
    temp_hp:       m?.temp_hp ?? 0,
    ac:            m?.ac ?? 10,
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
    class_resources: m?.class_resources ?? {},
    class_choices:   m?.class_choices ?? {},
  });

  // ── Point buy ────────────────────────────────────────────────────────────────

  const totalSpent      = computed(() => ABILITY_STATS.reduce((sum, stat) => sum + (POINT_BUY_COSTS[f[stat.key]] ?? 0), 0));
  const pointsRemaining = computed(() => POINT_BUY_TOTAL - totalSpent.value);

  // ── Spell slots ───────────────────────────────────────────────────────────────

  function buildSlotMaxes(): number[] {
    if (m?.spell_slots?.length) {
      return Array.from({ length: 9 }, (_, i) => m.spell_slots!.find((s) => s.level === i + 1)?.max ?? 0);
    }
    const defaults = getDefaultSpellSlots(m?.class ?? null, m?.level ?? 1);
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
    f.race    = sp?.name ?? "";
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
    f.background_id = id || null;
    f.background    = bg?.name ?? "";
    if (!bg) return;
    for (const skill of bg.skill_proficiencies ?? []) {
      const key = SKILLS.find(s => s.label.toLowerCase() === skill.toLowerCase())?.key;
      if (key && (f.skill_proficiencies[key] ?? "none") === "none") {
        f.skill_proficiencies[key] = "proficient";
      }
    }
    for (const tool of bg.tool_proficiencies ?? []) {
      if (!f.tool_proficiencies.includes(tool)) f.tool_proficiencies.push(tool);
    }
    for (const lang of bg.languages ?? []) {
      if (!f.languages.includes(lang)) f.languages.push(lang);
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

  async function save() {
    if (!f.name.trim() || saving.value) return;
    saving.value = true;

    if (!isEditMode.value && selectedSpecies.value?.ability_score_increases) {
      const abilityKeyMap: Record<string, keyof typeof f> = {
        strength: "str", dexterity: "dex", constitution: "con",
        intelligence: "int", wisdom: "wis", charisma: "cha",
        str: "str", dex: "dex", con: "con", int: "int", wis: "wis", cha: "cha",
      };
      for (const [key, val] of Object.entries(selectedSpecies.value.ability_score_increases)) {
        const fKey = abilityKeyMap[key.toLowerCase()];
        if (fKey) (f as unknown as Record<string, number>)[fKey as string] = Math.min(20, (f[fKey] as number) + (val as number));
      }
    }

    const spellSlots: SpellSlotEntry[] = spellSlotMaxes
      .map((max, i) => {
        const existing = existingMember.value?.spell_slots?.find((s) => s.level === i + 1);
        return { level: i + 1, max, used: max > 0 ? (existing?.used ?? 0) : 0 };
      })
      .filter((s) => s.max > 0);

    const payload = {
      ...f,
      name:        f.name.trim(),
      player_name: f.player_name || auth.membership?.display_name || null,
      class:       f.class || null,
      subclass:    f.subclass || null,
      race:        f.race || null,
      subrace:     f.subrace || null,
      background:  f.background || null,
      notes:       f.notes || null,
      portrait_url:         portraitUrl.value || null,
      portrait_focal_point: focalPoint.value,
      card_art_url:         cardArtUrl.value || null,
      proficiency_bonus:    profBonus.value,
      spell_slots:          spellSlots,
      current_hp:           f.max_hp,
    };

    if (isEditMode.value && existingMember.value) {
      const { campaign_id: _cid, ...updatePayload } = payload;
      await update({ id: existingMember.value.id, update: updatePayload });
      saving.value = false;
      router.push(backRoute);
    } else {
      const created = await create(payload);
      const myMembership = (campaignMembers.value ?? []).find((cm) => cm.user_id === auth.user?.id);
      if (myMembership) {
        await updateCampaignMember({ id: myMembership.id, update: { party_member_id: created.id } });
      }
      await auth.refreshMembership();
      saving.value = false;
      if (f.level > 1) {
        router.push("/play/character/levelup");
      } else {
        router.push(backRoute);
      }
    }
  }

  return {
    // router
    router,
    // auth
    auth,
    // form state
    f, activeTab, wizardStep, saving, scoreMode,
    portraitUrl, focalPoint, cardArtUrl, spellSlotMaxes,
    // computed
    isEditMode, existingMember, backRoute,
    allSpecies, allBackgrounds,
    speciesOptions, backgroundOptions, selectedSpecies, subraceOptions,
    mergedClasses, allClassNames, subclassOptions,
    pointsRemaining, suggestedHp, profBonus,
    passivePerception, passiveInsight, passiveInvestigation,
    // methods
    mod, setSkillProf, skillBonus, toggleSave, saveBonus,
    resetSlotsToDefault, onSpeciesSelect, onClassSelect, onBackgroundSelect,
    save,
  };
}

export type CharacterCreationForm = ReturnType<typeof useCharacterCreationForm>;
export const CHARACTER_FORM_KEY: InjectionKey<CharacterCreationForm> = Symbol("characterCreationForm");
