import { ref, reactive, computed, watch, type InjectionKey } from "vue";
import { useAutosave } from "@/composables/useAutosave";
import { changedColumns, cloneDraftValue, draftValueEqual, mergeDraft } from "@/composables/useRecordDraft";
import { useRouter, useRoute } from "vue-router";
import { useQueryClient } from "@tanstack/vue-query";
import { useAuthStore } from "@/stores/auth";
import { useCampaignStore } from "@/stores/campaign";
import { useParty, useCreatePartyMember, useUpdatePartyMember } from "@/composables/party/useParty";
import { useCharacterPool } from "@/composables/party/useCharacterPool";
import { benchedMessage, useBenchedAfterAttach } from "@/composables/party/useBenchedAfterAttach";
import { useAddCharacterClass, useCharacterClasses } from "@/composables/party/useCharacterClasses";
import { useCampaignMembers } from "@/composables/campaign/useCampaignMembers";
import { useAttachCharacter } from "@/composables/party/useCharacterPool";
import { useCampaignSystemClasses, useCampaignCustomClasses } from "@/composables/rules/useCustomClasses";
import { useCampaignSpecies } from "@/composables/rules/useSpecies";
import { useCampaignCustomSubclasses } from "@/composables/rules/useCustomSubclasses";
import { subclassChoiceDue } from "@/levelup/subclassChoice";
import { subclassGrantedSpellIds } from "@/levelup/subclassGrantedSpells";
import { useBackgrounds } from "@/composables/rules/useBackgrounds";
import { useRuleset } from "@/composables/rules/useRuleset";
import { useCharacterCreationEdition } from "@/composables/party/useCharacterCreationEdition";
import { isRulesetAdmissible, parseRulesetBounce, rulesetRules } from "@/composables/party/useCharacterRuleset";
import { campaignToAttachAfterCreate } from "@/composables/party/characterCreationEdition";
import { deriveEffectiveSpellSlots } from "@/rules/spellSlots";
import { applySpeciesSpellGrants } from "@/composables/party/useCharacterSpells";
import type { PartyMember, SkillProfLevel, SaveKey, SpellSlotEntry } from "@/types/party.types";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/composables/useToast";
import { reportHandledError } from "@/lib/observability/sentry";
import { abilityBonusesForChoice, unresolvedOriginFeatMessage } from "@/rules/backgroundAsi";
import { useAllFeatures } from "@/composables/rules/useFeatures";
import { levelOneWrites, scoresAfterBonuses } from "@/composables/party/creationLevelOne";
import { useCreationLevelOne } from "@/composables/party/useCreationLevelOne";
import {
  ABILITY_STATS, POINT_BUY_COSTS, POINT_BUY_TOTAL,
  type CharacterFormState, type AbilityKey, type AsiMode, type ScoreMode,
  saveKeysFromNames,
} from "@/rules/characterCreation";
import {
  useCharacterEquipmentSeeding, buildStartingEquipmentPlan, replayStartingGrants, StartingEquipmentError,
} from "@/composables/party/useCharacterEquipmentSeeding";
import { useCharacterBackgroundSelection } from "@/composables/party/useCharacterBackgroundSelection";

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

// ── Editing a saved character ─────────────────────────────────────────────────

/** Everything the edit form binds to, as one value the autosave can compare. */
export interface CharacterEditDraft {
  form: CharacterFormState;
  portraitUrl: string;
  focalPoint: { x: number; y: number } | null;
  slots: number[];
}

/**
 * The columns a character form writes. One builder for both flows, so the edit
 * autosave compares exactly what a create would send. `class` and `subclass`
 * stay out: they are the database's mirror of the primary class row, and a
 * written value is overwritten.
 */
export function buildCharacterPayload(input: {
  draft: CharacterEditDraft;
  existingSlots: SpellSlotEntry[] | null | undefined;
  playerNameFallback: string | null;
}) {
  const { draft, existingSlots, playerNameFallback } = input;
  const f = draft.form;
  // Persist the player's actual slot maxima rather than re-deriving the default
  // table (that lost multiclass/pact slots). `used` comes from the stored row so
  // an untouched slot level round-trips.
  const spellSlots: SpellSlotEntry[] = draft.slots
    .map((max, i) => {
      const existing = existingSlots?.find((e) => e.level === i + 1);
      return { level: i + 1, max, used: max > 0 ? (existing?.used ?? 0) : 0 };
    })
    .filter((s) => s.max > 0);
  const { class: _class, subclass: _subclass, ...formFields } = f;
  return {
    ...formFields,
    name:        f.name.trim(),
    player_name: f.player_name || playerNameFallback || null,
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
    portrait_url:         draft.portraitUrl || null,
    portrait_focal_point: draft.focalPoint,
    spell_slots:          spellSlots,
  };
}

/**
 * What an edit autosave writes: only the columns the player changed against the
 * server copy. A character is edited by the DM and by combat at the same time
 * (current HP, used slots, conditions), so writing the whole form back would
 * revert whatever moved while the sheet was open (#946).
 */
export function changedEditColumns(
  draft: CharacterEditDraft,
  server: CharacterEditDraft,
  build: (d: CharacterEditDraft) => ReturnType<typeof buildCharacterPayload>,
) {
  const { campaign_id: _c, owner_user_id: _o, ...changed } = changedColumns(build(draft), build(server)) as
    Partial<ReturnType<typeof buildCharacterPayload>> & { campaign_id?: unknown; owner_user_id?: unknown };
  return changed;
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
  //
  // Only the edit route has an existing member. `editMemberId` falls back to the
  // account's linked party member, so without this guard a player who already has
  // a character would open "Create Your Character" seeded from it (its level,
  // scores and spell slots) instead of from a blank sheet.
  const existingMember = computed(() => {
    if (!isEditMode.value || !editMemberId.value) return null;
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
  const { is2024, ruleset } = useRuleset();

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

  // ── Subclass at creation (#973) ───────────────────────────────────────────────
  // A character starts at level 1, and some classes choose their subclass there
  // (2014 Cleric, Sorcerer, Warlock). The question is due by the same rule the
  // level-up wizard uses, and is answered from the same options.
  const STARTING_LEVEL = 1;
  const { data: campaignSubclasses } = useCampaignCustomSubclasses();
  const subclassId = ref("");
  const subclassLevel = computed(() => selectedClass.value?.subclass_level ?? null);
  // Creating only: an edit never writes a class row (a subclass is changed where
  // the character levels), so it neither asks nor blocks.
  const subclassDueAtStart = computed(() =>
    !isEditMode.value && !!selectedClass.value && subclassChoiceDue(null, STARTING_LEVEL, subclassLevel.value));
  // The class row is written before the character is seated anywhere, and the
  // database only accepts a subclass the character could read at that moment: a
  // universal one, or one of the roster campaign a DM is creating into. A
  // table's own homebrew subclass is chosen on the level-up that follows.
  const subclassOptions = computed(() => campaignSubclasses.value
    .filter((sc) => sc.class_name === f.class
      && (sc.campaign_id === null || (isDmCreate.value && sc.campaign_id === campaign.activeCampaignId)))
    .map((sc) => ({ id: sc.id, name: sc.subclass_name })));
  const blockedBySubclassChoice = computed(() =>
    subclassDueAtStart.value && subclassOptions.value.length > 0 && !subclassId.value);
  // Whether the loadout will wait: the character is not going to a table that
  // takes its edition. Mirrors the attach decision in save().
  const startingEquipmentDeferred = computed(() => {
    if (isEditMode.value) return false;
    if (isDmCreate.value && campaign.activeCampaignId) return false;
    if (!campaignToAttachAfterCreate(landingCampaign.value, isDmCreate.value)) return true;
    const table = campaign.activeCampaign;
    const ruleset = chosenRuleset.value;
    return !!table && !!ruleset && !isRulesetAdmissible({ ruleset }, table);
  });
  function clearSubclass() {
    subclassId.value = "";
    f.subclass = "";
  }

  const { mutateAsync: create }               = useCreatePartyMember();
  const { mutateAsync: update }               = useUpdatePartyMember();
  const { mutateAsync: addCharacterClass }    = useAddCharacterClass();
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
  // True once a new character is fully created, so leaving the wizard stops
  // asking whether to throw the progress away (there is none left to lose).
  const finished   = ref(false);
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

  const {
    importBackgroundEquipment,
    classEquipmentChoice, importClassEquipment, classEquipmentPack,
  } = useCharacterEquipmentSeeding(f);

  const { data: allFeatures } = useAllFeatures();
  const {
    bgSkillChoices, bgChosenSkills, bgChoiceLimit, bgFreeSkills,
    onBackgroundSelect, toggleBgSkillChoice, originFeat, originFeatUnresolved,
    backgroundAsiChoice, backgroundAsiIncomplete,
  } = useCharacterBackgroundSelection(f, { allBackgrounds, selectedBg, is2024, ruleset, features: allFeatures, isEditMode });
  /** Why a new character cannot go on: its background grants a feat this table's books lack. */
  const originFeatMessage = computed(() =>
    !isEditMode.value && originFeatUnresolved.value && originFeat.value
      ? unresolvedOriginFeatMessage(originFeat.value.originFeat.name)
      : null);

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

  function buildSlotMaxes(em: PartyMember | null | undefined = existingMember.value): number[] {
    if (em?.spell_slots?.length) {
      return Array.from({ length: 9 }, (_, i) => em.spell_slots!.find((s) => s.level === i + 1)?.max ?? 0);
    }
    const defaults = defaultSlots();
    return Array.from({ length: 9 }, (_, i) => defaults.find((s) => s.level === i + 1)?.max ?? 0);
  }
  const spellSlotMaxes = reactive<number[]>(buildSlotMaxes());

  // The scores a new character ends with, worked out once: the Done card, the
  // level-1 choices (a pool scaling with Charisma wants the final score) and the
  // save all read this.
  const finalScores = computed(() => scoresAfterBonuses({
    scores: { str: f.str, dex: f.dex, con: f.con, int: f.int, wis: f.wis, cha: f.cha },
    asiMode: asiMode.value,
    customAsi,
    structured: [selectedSpecies.value?.ability_score_increases, selectedSubrace.value?.ability_score_increases],
    background: selectedBg.value?.asi_ability_trio
      ? abilityBonusesForChoice(backgroundAsiChoice.value, selectedBg.value.asi_ability_trio)
      : {},
  }));

  // ── Level 1 choices (#976) ────────────────────────────────────────────────────
  // The book's level-1 questions (Expertise, Fighting Style, Weapon Mastery, an
  // order or an invocation) and the origin feat's own, asked by the machinery a
  // level-up uses. Creating only: an edit has no level 1 to take.
  const subclassPicked = computed(() => {
    if (!subclassDueAtStart.value || !subclassId.value) return null;
    const found = (campaignSubclasses.value ?? []).find((sc) => sc.id === subclassId.value);
    return found ? { name: found.subclass_name, features: found.features } : null;
  });
  const levelOne = useCreationLevelOne({
    f,
    selectedClass: computed(() => (isEditMode.value ? null : selectedClass.value)),
    pickedSubclass: subclassPicked,
    finalScores,
    canCastSpells: computed(() => spellSlotMaxes.some((max) => max > 0)),
  });
  /** A new character cannot be made until every level-1 choice is answered and the origin feat resolves. */
  // A background's origin feat resolves only once the feats have loaded; saving
  // before then would create the character without its origin feat.
  const originFeatPending = computed(() => originFeat.value !== null && allFeatures.value === undefined);
  const blockedByLevelOne = computed(() =>
    !isEditMode.value
      && (levelOne.isLoading.value || !levelOne.complete.value || originFeatMessage.value !== null || originFeatPending.value));
  let serverDraft: CharacterEditDraft | null = null;

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
        const seeded = buildSlotMaxes();
        seeded.forEach((max, i) => { spellSlotMaxes[i] = max; });
        // Seeded from the member's own class rows, so it is the server's value,
        // not an edit: the autosave must not write it back.
        if (serverDraft && !serverDraft.slots.some((v) => v !== 0)) serverDraft.slots = [...seeded];
      }
    },
  );
  watch(() => f.class, () => { if (spellSlotMaxes.every((v) => v === 0)) resetSlotsToDefault(); });

  // ── Editing: the form saves itself ────────────────────────────────────────────
  // `serverDraft` is the character as the server last reported it, in the shape
  // the form binds to. The autosave writes only what differs from it, and fresh
  // server data reaches each field the player has not touched (useRecordDraft's
  // rules, #946, over a form that is shared with the create wizard).
  function draftOf(member: PartyMember): CharacterEditDraft {
    return {
      form: buildFormState(member),
      portraitUrl: member.portrait_url ?? "",
      focalPoint: member.portrait_focal_point ?? null,
      slots: buildSlotMaxes(member),
    };
  }
  const liveDraft = reactive({ form: f, portraitUrl, focalPoint, slots: spellSlotMaxes }) as unknown as CharacterEditDraft;
  serverDraft = existingMember.value ? cloneDraftValue(draftOf(existingMember.value)) : null;

  // On a cold load (PWA restart / hard refresh) the party query hasn't resolved
  // when the form is first built, so `f` seeds to level-1 defaults: the first
  // time the member resolves the form takes it whole. After that a change to the
  // row (the DM, combat, our own echo) only reaches fields the player has not
  // edited, so in-progress edits are never clobbered.
  watch(existingMember, (member) => {
    if (!member || !isEditMode.value) return;
    const incoming = draftOf(member);
    if (!serverDraft) {
      Object.assign(f, incoming.form);
      portraitUrl.value = incoming.portraitUrl;
      focalPoint.value = incoming.focalPoint;
      incoming.slots.forEach((max, i) => { spellSlotMaxes[i] = max; });
    } else {
      mergeDraft(f, serverDraft.form, incoming.form);
      if (draftValueEqual(portraitUrl.value, serverDraft.portraitUrl)) portraitUrl.value = incoming.portraitUrl;
      if (draftValueEqual(focalPoint.value, serverDraft.focalPoint)) focalPoint.value = incoming.focalPoint;
      if (draftValueEqual(spellSlotMaxes, serverDraft.slots)) {
        incoming.slots.forEach((max, i) => { spellSlotMaxes[i] = max; });
      }
    }
    serverDraft = cloneDraftValue(incoming);
  });
  function editColumnsOf(d: CharacterEditDraft) {
    return buildCharacterPayload({
      draft: d,
      existingSlots: existingMember.value?.spell_slots,
      playerNameFallback: auth.membership?.display_name ?? null,
    });
  }

  async function saveEdit(snapshot: CharacterEditDraft) {
    const member = existingMember.value;
    if (!member || !serverDraft) return;
    const columns = changedEditColumns(snapshot, serverDraft, editColumnsOf);
    if (Object.keys(columns).length === 0) return;
    await update({ id: member.id, update: columns });
    // What was sent is now the server copy; edits made during the request stay
    // unsaved until the refetch confirms it.
    serverDraft = cloneDraftValue(snapshot);
    // Species spells that unlock with the character's level or subrace (an
    // idempotent upsert); the ones that need a pick are offered inline.
    if (selectedSpecies.value) {
      await applySpeciesSpellGrants(
        member.id, selectedSpecies.value, snapshot.form.level,
        snapshot.form.subrace || member.subrace || null,
      );
    }
  }

  const autosave = isEditMode.value
    ? useAutosave<CharacterEditDraft>({
      draft: liveDraft,
      initial: () => cloneDraftValue(liveDraft),
      equal: draftValueEqual,
      save: saveEdit,
      canSave: () => !!existingMember.value && !!serverDraft && !!f.name.trim(),
      errorMessage: "Couldn't save the character",
    })
    : null;

  /** Species spells the character may choose for itself and has not been offered a place for yet. */
  const freeSpeciesPicks = computed(() => (selectedSpecies.value?.granted_spells ?? []).filter(
    (g) => g.spell_id === null && g.min_level <= f.level && (g.subrace === null || g.subrace === (f.subrace || null)),
  ));

  /** Done: write what is pending, then go back to where the player came from. */
  async function finishEditing() {
    await autosave?.saveNow();
    if (autosave?.saveError.value) return; // the status line says what failed; stay so the edit is not lost
    const cameFrom = (router.options.history.state as { back?: string | null }).back;
    if (cameFrom) router.back(); else void router.push(backRoute);
  }

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
    clearSubclass();
    if (cls?.saving_throws?.length) {
      f.saving_throw_proficiencies = saveKeysFromNames(cls.saving_throws);
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
    clearSubclass();
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

  // Creating only: a saved character is edited through `autosave` above.
  async function save(levelUp = false) {
    if (isEditMode.value || !f.name.trim() || saving.value) return;
    saving.value = true;

    // Creating folds racial/background bonuses and derived stats into `f` before
    // the insert. The form is the Done card's source, so a failed save must put
    // those fields back, or the retry would add the bonuses a second time.
    const preSave = {
      str: f.str, dex: f.dex, con: f.con, int: f.int, wis: f.wis, cha: f.cha,
      level: f.level, proficiency_bonus: f.proficiency_bonus,
      max_hp: f.max_hp, current_hp: f.current_hp, speed: f.speed,
      initiative_bonus: f.initiative_bonus, hit_dice_remaining: f.hit_dice_remaining,
    };

    // ── Level 1 choices, captured before the form is changed below ────────────────
    // Their answers were computed against the scores the character will have, so
    // they are read now, while the form still holds the typed ones.
    const picks = levelOne.resolved.value;
    const classResources = levelOne.classResources.value;

    // ── Species ASI (standard = structured bonuses; custom = distributed freely)
    // and the 2024 background ASI, from the scores worked out once above (an
    // incomplete background choice grants nothing rather than guessing), then
    // whatever level 1's own picks raise.
    const scores = finalScores.value;
    for (const { key } of ABILITY_STATS) f[key] = scores[key] + (picks.record.abilityIncreases[key] ?? 0);

    // ── Derive all stats from class / species sources — no magic numbers ───
    f.level = 1;
    f.proficiency_bonus = 2;

    const cls = selectedClass.value;
    const hp  = cls ? Math.max(1, cls.hit_die + Math.floor((f.con - 10) / 2)) : 8;
    f.max_hp     = hp;
    f.current_hp = hp;
    f.speed      = selectedSpecies.value?.speed?.walk ?? 30;
    // initiative_bonus is the EXTRA on top of the DEX mod (feat/special bonuses,
    // e.g. Alert), not the total — the DEX mod is added wherever initiative is
    // shown/rolled. A fresh character has no such extra.
    f.initiative_bonus  = 0;
    f.hit_dice_remaining = 1;
  

    const basePayload = buildCharacterPayload({
      draft: { form: f, portraitUrl: portraitUrl.value, focalPoint: focalPoint.value, slots: spellSlotMaxes },
      existingSlots: existingMember.value?.spell_slots,
      playerNameFallback: auth.membership?.display_name ?? null,
    });

    try {
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
      const chosenSubclass = subclassDueAtStart.value
        ? subclassOptions.value.find((o) => o.id === subclassId.value) ?? null
        : null;
      // The loadout the player picked travels with the character until a table
      // can receive it: a character resting in the pool has no inventory.
      const startingEquipment = buildStartingEquipmentPlan({
        className: f.class,
        classChoice: classEquipmentChoice.value,
        importClass: importClassEquipment.value,
        backgroundText: (allBackgrounds.value ?? []).find((b) => b.id === f.background_id)?.equipment ?? null,
        importBackground: importBackgroundEquipment.value,
        // What a level-up to this level would grant for the chosen subclass
        // (a 2014 Life Domain cleric's Bless and Cure Wounds), written once the
        // character is linked to a table. A DM's roster character is never
        // linked by this wizard, so it gets none here.
        grantedSpellIds: chosenSubclass && !isDmCreate.value
          ? subclassGrantedSpellIds(
            (campaignSubclasses.value ?? []).find((sc) => sc.id === chosenSubclass.id)?.granted_spells,
            STARTING_LEVEL,
          )
          : [],
      });
      // Level 1's picks land the way a level-up's do: class_choices, skills,
      // masteries, the resource pools at full, and the history entry the feature
      // card reads its picks from.
      const levelOneColumns = levelOneWrites({
        classChoices: basePayload.class_choices,
        skills: basePayload.skill_proficiencies,
        masteries: basePayload.weapon_masteries,
        picks,
        classResources,
        className: f.class,
        classDefinitionId: pickedClass?.id ?? null,
        hpGained: hp,
      });
      const created = await create({
        ...basePayload,
        ...levelOneColumns,
        class_choices: startingEquipment
          ? { ...levelOneColumns.class_choices, starting_grants: startingEquipment }
          : levelOneColumns.class_choices,
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
      // The character is made and seated whatever happens to its equipment, so
      // an equipment failure is reported after the rollback window, never inside it.
      let equipmentError: unknown = null;
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
            // Chosen here when the class picks its subclass at level 1;
            // otherwise null and the level-up wizard asks at the due level.
            subclass_name:   chosenSubclass?.name ?? null,
            subclass_definition_id: chosenSubclass?.id ?? null,
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
              if (attachErr instanceof StartingEquipmentError) {
                landedCampaignId = joinCampaignId;
                attachedNow = true;
                equipmentError = attachErr;
              } else if (parseRulesetBounce(attachErr)) {
                restsInPool = true;
              } else {
                throw attachErr;
              }
            }
          }
          if (restsInPool) {
            const tableName = table?.name ?? "That table";
            const tableRules = table ? `plays the ${rulesetRules(table.ruleset)}` : "does not take this edition";
            useToast().info(`${f.name.trim()} rests in your pool: ${tableName} ${tableRules}.`);
          }
        }

      } catch (seedErr) {
        await supabase.from("party_inventory").delete().eq("carried_by", created.id);
        await supabase.from("party_members").delete().eq("id", created.id);
        throw seedErr;
      }

      // A roster character created by a DM is already at its table, so its
      // starting equipment goes in now. A player's character gets it when it
      // is attached (above, inside attachCharacter), or later, whenever it
      // first joins a table; until then the loadout waits on the character.
      // Outside the rollback: a failed grant puts its marker back and removes
      // its own rows, and is no reason to delete a character that exists.
      if (created.campaign_id) {
        try {
          await replayStartingGrants(created.id, created.campaign_id, queryClient);
        } catch (replayErr) {
          equipmentError = replayErr;
        }
      }
      if (equipmentError) {
        reportHandledError(equipmentError, "createCharacter.startingEquipment", { characterId: created.id });
        useToast().error(`${f.name.trim()} is made, but its starting equipment couldn't be added.`);
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
      finished.value = true;
      void router.push(createDestination({
        landedCampaignId, isDmCreate: isDmCreate.value, levelUp, benched: benchedChoices > 0, characterId: created.id,
      }));
    
    } catch (e) {
      Object.assign(f, preSave);
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
    f, activeTab, wizardStep, saving, finished, scoreMode,
    // edition (new characters): chosen on the first step, never written after create
    chosenRuleset, chooseRuleset, landingCampaign,
    portraitUrl, focalPoint, spellSlotMaxes,
    importBackgroundEquipment,
    classEquipmentChoice, importClassEquipment, classEquipmentPack, startingEquipmentDeferred,
    // subclass chosen at creation, when the class picks one at level 1
    subclassId, subclassLevel, subclassDueAtStart, subclassOptions, blockedBySubclassChoice,
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
    // the background's origin feat: null message when it resolves
    originFeat, originFeatMessage,
    // level 1 choices (new characters): what is owed, and whether the character may be made yet
    levelOne, blockedByLevelOne, finalScores,
    // methods
    mod, setSkillProf, skillBonus, toggleSave, saveBonus,
    resetSlotsToDefault, onSpeciesSelect, onClassSelect, onBackgroundSelect,
    toggleBgSkillChoice,
    save,
    // editing: the form saves itself (null while creating)
    autosave, finishEditing, freeSpeciesPicks,
  };
}

export type CharacterCreationForm = ReturnType<typeof useCharacterCreationForm>;
export const CHARACTER_FORM_KEY: InjectionKey<CharacterCreationForm> = Symbol("characterCreationForm");
