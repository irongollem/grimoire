<template>
  <div class="space-y-4">

    <!-- ── Background ruleset review (campaign edition changed) ─────────────── -->
    <RulesetReviewBanner
      v-if="hasBackgroundRulesetReview"
      link-to="/play/background"
      link-label="Review background"
      ack-label="Keep current choices"
      :acknowledging="acknowledgingBackgroundReview"
      @acknowledge="acknowledgeBackgroundReview"
    >
      The campaign rules changed. Review {{ member.name }}'s background ability scores and Origin feat.
    </RulesetReviewBanner>

    <!-- ── Beast traits (only when wildshaped) ──────────────────────────────── -->
    <PlayerWildshapeTraits
      v-if="wildshapeMonster?.stat_block?.special_abilities?.length"
      :monster="wildshapeMonster"
    />

    <!-- ── Rest buttons (hidden when header already provides them) ────────── -->
    <div v-if="showRestButtons" class="flex gap-2">
      <button
        class="flex-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 font-cinzel text-xs text-amber-600 hover:bg-amber-500/20 transition-colors"
        @click="shortRest"
      >Short Rest</button>
      <button
        class="flex-1 rounded-md border border-blue-500/40 bg-blue-500/10 px-3 py-2 font-cinzel text-xs text-blue-600 hover:bg-blue-500/20 transition-colors"
        @click="longRest"
      >Long Rest</button>
    </div>

    <!-- ── Resource pools ─────────────────────────────────────────────────── -->
    <PlayerResourcePools
      v-if="displayedResources.length > 0"
      :resources="displayedResources"
      @spend="spendResource"
      @restore="restoreResource"
      @spend-amount="confirmVariableSpend"
    />

    <PlayerFlexibleCasting
      v-if="sorceryResource && sorceryResource.max > 0"
      :party-member-id="member.id"
      :sorcery-points="sorceryResource"
      :spell-slots="effectiveSlots"
    />

    <PlayerSorcererFeatures
      v-if="ruleset === '2024' && classLevel('Sorcerer', true) > 0"
      :member="member"
      :level="classLevel('Sorcerer', true)"
    />

    <!-- ── Class features (one card per class, grouped for multiclass) ──────── -->
    <template v-if="featureDataPending">
      <div
        v-for="n in 2"
        :key="n"
        class="rounded-lg border border-border bg-card overflow-hidden animate-pulse"
      >
        <div class="px-4 py-2.5 border-b border-border">
          <div class="h-3 w-32 rounded bg-muted" />
        </div>
        <div class="divide-y divide-border">
          <div v-for="i in 4" :key="i" class="px-4 py-2.5 flex items-center gap-3">
            <div class="h-2.5 w-8 rounded bg-muted shrink-0" />
            <div class="h-2.5 rounded bg-muted" :style="`width: ${50 + i * 12}%`" />
          </div>
        </div>
      </div>
    </template>
    <template v-else>
      <PlayerClassFeaturesList
        v-for="group in classFeatureGroups"
        :key="group.class_name"
        :group="group"
        @navigate-spells="router.push('/play/spells')"
      />
    </template>

    <!-- ── Spell choices ─────────────────────────────────────────────────── -->
    <PlayerSpellChoices :member="member" :steps="spellPickSteps" />

    <!-- ── Racial / Subrace traits ───────────────────────────────────────────── -->
    <PlayerRacialTraits v-if="racialTraitGroups.length" :groups="racialTraitGroups" />

    <!-- ── Languages & Tool Proficiencies ───────────────────────────────────── -->
    <PlayerProficienciesCard
      v-if="member.languages?.length || member.tool_proficiencies?.length"
      :languages="member.languages"
      :tool-proficiencies="member.tool_proficiencies"
      :is-owner="isOwner"
    />

    <!-- ── Class choices, background ASI & background feat (2024 PHB) ───────── -->
    <PlayerChoicesCard
      :class-choices="member.class_choices"
      :exclude-keys="spellPickStepKeys"
      :background-asi-bonuses="backgroundAsiBonuses"
      :background-origin-feat="backgroundOriginFeat"
      :background-feat="backgroundFeat"
    />

    <!-- ── Metamagic ─────────────────────────────────────────────────────── -->
    <PlayerExpandableList
      v-if="metamagicItems.length > 0"
      title="Metamagic"
      :items="metamagicItems"
    />

    <!-- ── Eldritch Invocations (Warlock) ──────────────────────────────────── -->
    <PlayerExpandableList
      v-if="invocationItems.length > 0"
      title="Eldritch Invocations"
      :items="invocationItems"
    />

    <!-- ── Divine Smite (Paladin) ───────────────────────────────────────────── -->
    <PlayerDivineSmiteCard v-if="isPaladin" />

    <!-- ── Rage (Barbarian) ──────────────────────────────────────────────────── -->
    <PlayerBarbarianRage
      v-if="isBarbarian"
      ref="rageRef"
      :member="member"
      :barbarian-level="classLevel('Barbarian')"
      :rage-uses-current="rageResource?.current ?? 0"
      :rage-uses-max="rageResource?.max ?? 0"
      @spend-use="spendResource('rage_uses')"
    />

    <!-- ── Ki Abilities (Monk) ─────────────────────────────────────────────────── -->
    <PlayerExpandableList
      v-if="isMonk && kiItems.length > 0"
      title="Ki Abilities"
      :items="kiItems"
    />

    <!-- ── Battle Master Maneuvers (Fighter) ──────────────────────────────────── -->
    <PlayerBattleMasterManeuvers
      v-if="isBattleMaster"
      :known-maneuvers="knownManeuvers"
      :available-to-learn="availableManeuversToLearn"
      :superiority-dice-size="superiorityDiceSize"
      :superiority-dice-current="superiorityDiceResource?.current ?? 0"
      :superiority-dice-max="superiorityDiceResource?.max ?? 0"
      @spend-superiority-die="spendResource('superiority_dice')"
      @restore-superiority-die="restoreResource('superiority_dice')"
      @learn-maneuver="learnManeuver"
    />

    <!-- ── Infusions (Artificer) ──────────────────────────────────────────── -->
    <PlayerArtificerInfusions
      v-if="isArtificer && artificerLevel >= 2"
      :known-infusions="knownInfusions"
      :available-to-learn="availableInfusionsToLearn"
      :active-infusions="localActiveInfusions"
      :slots-max="infusionSlotsMax"
      :inventory-items="memberInventoryItems"
      @remove="removeActiveInfusionByName"
      @apply="applyInfusion"
      @learn="learnInfusion"
      @save-text="saveInfusionText"
    />

  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useRouter } from "vue-router";
import { useToast } from "@/composables/useToast";
import RulesetReviewBanner from "@/components/common/RulesetReviewBanner.vue";
import PlayerWildshapeTraits from "./PlayerWildshapeTraits.vue";
import PlayerResourcePools from "./PlayerResourcePools.vue";
import PlayerFlexibleCasting from "./PlayerFlexibleCasting.vue";
import PlayerSorcererFeatures from "./PlayerSorcererFeatures.vue";
import PlayerClassFeaturesList from "./PlayerClassFeaturesList.vue";
import PlayerBattleMasterManeuvers from "./PlayerBattleMasterManeuvers.vue";
import PlayerArtificerInfusions from "./PlayerArtificerInfusions.vue";
import PlayerBarbarianRage from "./PlayerBarbarianRage.vue";
import PlayerSpellChoices from "./PlayerSpellChoices.vue";
import PlayerRacialTraits from "./PlayerRacialTraits.vue";
import type { TraitGroup } from "./PlayerRacialTraits.vue";
import PlayerExpandableList from "./PlayerExpandableList.vue";
import type { ExpandableItem } from "./PlayerExpandableList.vue";
import PlayerProficienciesCard from "./PlayerProficienciesCard.vue";
import PlayerChoicesCard from "./PlayerChoicesCard.vue";
import PlayerDivineSmiteCard from "./PlayerDivineSmiteCard.vue";
import { useMetamagicOptions } from "@/composables/useMetamagic";
import type { MetamagicOption } from "@/rules/metamagic";
import { ELDRITCH_INVOCATIONS_MAP } from "@/data/eldritchInvocations";
import { MONK_KI_ABILITIES } from "@/data/monkKiAbilities";
import { BATTLE_MASTER_MANEUVERS, BATTLE_MASTER_MANEUVERS_MAP } from "@/data/battleMasterManeuvers";
import { useArtificerState } from "@/composables/useArtificerState";
import { useClassFeatureGroups } from "@/composables/useClassFeatureGroups";
import type { CustomStep } from "@/levelup/customTypes";
import { useClassByName } from "@/composables/useCustomClasses";
import { useCustomSubclassByClassAndSubclass } from "@/composables/useCustomSubclasses";
import { useTakeSpellcastingRest, useUpdatePartyMember } from "@/composables/useParty";
import { useAllSpecies } from "@/composables/useSpecies";
import { useConfirm } from "@/composables/useConfirm";
import type { PartyMember, SaveKey, SpellSlotEntry } from "@/types/party.types";
import type { Monster } from "@/types/monster.types";
import type { ResourceRow } from "./PlayerResourcePools.vue";
import { useRuleset } from "@/composables/useRuleset";
import { deriveEffectiveSpellSlots } from "@/rules/spellSlots";
import { useBackground } from "@/composables/useBackgrounds";
import { abilityBonusesForChoice, parseBackgroundAsiChoice } from "@/rules/backgroundAsi";
import { useRulesetReviews, useAcknowledgeRulesetReviews } from "@/composables/useRulesetReviews";

const props = defineProps<{ member: PartyMember; showRestButtons?: boolean; wildshapeMonster?: Monster; isOwner?: boolean }>();

const router = useRouter();
const { ruleset } = useRuleset();
const toast = useToast();

const memberRef = computed(() => props.member);
const memberIdRef = computed(() => props.member.id);

const memberClassRef    = computed(() => props.member.class ?? "");
const memberSubclassRef = computed(() => props.member.subclass ?? "");
const classData = useClassByName(memberClassRef);
const { data: customSubclass } = useCustomSubclassByClassAndSubclass(memberClassRef, memberSubclassRef);
const { data: linkedBackground } = useBackground(computed(() => props.member.background_id ?? ""));

const { mutate: updateMember } = useUpdatePartyMember();
const { mutateAsync: takeSpellcastingRest } = useTakeSpellcastingRest();
const { confirm } = useConfirm();
const { data: allSpecies } = useAllSpecies();
const linkedSpecies = computed(() =>
  (allSpecies.value ?? []).find((s) => s.id === props.member.species_id) ?? null,
);
const linkedSubrace = computed(() =>
  props.member.subrace && linkedSpecies.value?.subraces
    ? (linkedSpecies.value.subraces.find(sr => sr.name === props.member.subrace) ?? null)
    : null,
);

// ── Multiclass feature grouping ───────────────────────────────────────────────

const {
  characterClasses,
  classFeatureGroups,
  featureDataPending,
  classDefinitionFor,
} = useClassFeatureGroups(memberRef);

// ── Local optimistic state ────────────────────────────────────────────────────

const localResources = ref<ResourceRow[]>([]);

function syncFromProps() {
  localResources.value = Object.entries(props.member.class_resources ?? {}).map(([key, res]) => ({
    key,
    label: key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
    current: res.current,
    max: res.max,
    rest: res.rest,
  }));
}

watch(() => [props.member.id, props.member.updated_at], syncFromProps, { immediate: true });

// Spell slots — single source of truth: TanStack Query cache via props.member.spell_slots.
// Falls back to multiclass or per-class defaults when DB has no stored slots yet.
const effectiveSlots = computed((): SpellSlotEntry[] =>
  deriveEffectiveSpellSlots(
    props.member,
    characterClasses.value ?? [],
    ruleset.value,
    classDefinitionFor,
  ),
);

// ── Persist helpers ───────────────────────────────────────────────────────────

function persistResources() {
  const class_resources = Object.fromEntries(
    localResources.value.map(r => [r.key, { current: r.current, max: r.max, rest: r.rest }]),
  );
  updateMember({ id: props.member.id, update: { class_resources } });
}

// ── Resource controls ─────────────────────────────────────────────────────────

function spendResource(key: string) {
  const r = localResources.value.find(r => r.key === key);
  if (!r || r.current <= 0) return;
  r.current--;
  persistResources();
}

function restoreResource(key: string) {
  const r = localResources.value.find(r => r.key === key);
  if (!r || r.current >= r.max) return;
  r.current++;
  persistResources();
}

function confirmVariableSpend(key: string, amount: number) {
  const r = localResources.value.find(r => r.key === key);
  if (!r) return;
  r.current = Math.max(0, r.current - Math.min(Math.max(1, amount), r.current));
  persistResources();
}

// ── Rest ──────────────────────────────────────────────────────────────────────

async function shortRest() {
  await takeSpellcastingRest({ partyMemberId: props.member.id, rest: "short" });
}

async function longRest() {
  const ok = await confirm(
    "Take a long rest? This will restore all resources and spell slots.",
    { title: "Long Rest", confirmLabel: "Rest", danger: false },
  );
  if (!ok) return;

  await takeSpellcastingRest({ partyMemberId: props.member.id, rest: "long" });
  rageRef.value?.deactivate();
  if (props.member.rage_active) {
    updateMember({ id: props.member.id, update: { rage_active: false } });
  }
}

// ── Spell pick steps ──────────────────────────────────────────────────────────

/** Every custom class + subclass level-up step defined for this character. */
const allCustomSteps = computed((): CustomStep[] => [
  ...(classData.value?.steps ?? []),
  ...(customSubclass.value?.steps ?? []),
] as CustomStep[]);

/** All spell_pick steps at levels the character has reached (drives the picker). */
const spellPickSteps = computed((): CustomStep[] =>
  allCustomSteps.value.filter(s => s.step_type === "spell_pick" && s.level <= props.member.level),
);

/**
 * Keys of every spell_pick step — these render in PlayerSpellChoices, so the
 * generic Choices card excludes them to avoid showing the same pick twice
 * (as a raw stored value at that).
 */
const spellPickStepKeys = computed(() =>
  allCustomSteps.value.filter(s => s.step_type === "spell_pick").map(s => s.key),
);

// ── Background ASI & feat (2024 PHB), fed to PlayerChoicesCard ────────────────

/** Background feat name from class_choices (set when a 2024 PHB background is picked). */
const backgroundFeat = computed(() => {
  const raw = props.member.class_choices?.background_feat;
  return raw && typeof raw === "string" ? raw : null;
});

/**
 * Structured Origin feat for the resolved-link display. Prefers the linked
 * background's current origin_feat (picks up edits made after this member
 * chose it); falls back to re-parsing the stored raw name so the badge still
 * renders correctly for a member whose background was since deleted.
 */
const backgroundOriginFeat = computed(() => {
  if (linkedBackground.value?.origin_feat) return linkedBackground.value.origin_feat;
  return backgroundFeat.value ? { name: backgroundFeat.value, variant: null } : null;
});

/** Ability-score deltas from the member's stored 2024 background ASI choice, for display only. */
const backgroundAsiBonuses = computed(() => {
  const trio = linkedBackground.value?.asi_ability_trio;
  if (!trio) return [];
  const choice = parseBackgroundAsiChoice(props.member.class_choices?.background_asi);
  const bonuses = abilityBonusesForChoice(choice, trio);
  const LABELS: Record<SaveKey, string> = {
    str: "Strength", dex: "Dexterity", con: "Constitution",
    int: "Intelligence", wis: "Wisdom", cha: "Charisma",
  };
  return (Object.entries(bonuses) as [SaveKey, number][])
    .map(([key, delta]) => ({ key, label: LABELS[key], delta }));
});

const { data: rulesetReviews } = useRulesetReviews(memberIdRef);
const hasBackgroundRulesetReview = computed(() =>
  (rulesetReviews.value ?? []).some((r) => r.flag_type === "background"),
);
const { mutateAsync: acknowledgeRulesetReviews } = useAcknowledgeRulesetReviews();
const acknowledgingBackgroundReview = ref(false);
async function acknowledgeBackgroundReview() {
  if (acknowledgingBackgroundReview.value) return;
  acknowledgingBackgroundReview.value = true;
  try {
    await acknowledgeRulesetReviews({ partyMemberId: props.member.id, flagTypes: ["background"] });
  } catch (e) {
    toast.error(toast.fromError(e, "Couldn't acknowledge the rule change."));
  } finally {
    acknowledgingBackgroundReview.value = false;
  }
}

const { optionsByName: metamagicByName } = useMetamagicOptions();
const knownMetamagic = computed(() => {
  const raw = props.member.class_choices?.metamagic_options;
  const names: string[] = Array.isArray(raw) ? (raw as string[]) : raw ? [String(raw)] : [];
  return names.map(n => metamagicByName.value.get(n)).filter((option): option is MetamagicOption => !!option);
});

const knownInvocations = computed(() => {
  const raw = props.member.class_choices?.eldritch_invocations;
  const names: string[] = Array.isArray(raw) ? (raw as string[]) : raw ? [String(raw)] : [];
  return names.map(n => ELDRITCH_INVOCATIONS_MAP.get(n)).filter(Boolean) as import("@/data/eldritchInvocations").EldritchInvocation[];
});

// ── Racial trait groups (for PlayerRacialTraits) ───────────────────────────────

const racialTraitGroups = computed<TraitGroup[]>(() => {
  const groups: TraitGroup[] = [];
  if (linkedSpecies.value?.traits?.length) {
    groups.push({ heading: "Racial Traits", subheading: linkedSpecies.value.name, traits: linkedSpecies.value.traits });
  }
  if (linkedSubrace.value?.traits?.length) {
    groups.push({ heading: "Variant Traits", subheading: linkedSubrace.value.name, traits: linkedSubrace.value.traits });
  }
  return groups;
});

// ── Expandable list items (for PlayerExpandableList) ──────────────────────────

const metamagicItems = computed<ExpandableItem[]>(() =>
  knownMetamagic.value.map(opt => ({
    name: opt.name,
    description: opt.description,
    badges: [{ label: `${opt.sp_cost} SP`, variant: "primary" as const }],
  })),
);

const invocationItems = computed<ExpandableItem[]>(() =>
  knownInvocations.value.map(inv => ({
    name: inv.name,
    description: inv.description,
    badges: [
      ...(inv.grants_spell ? [{ label: "Spell", variant: "primary" as const }] : []),
      ...(inv.min_level > 2 ? [{ label: `Lv ${inv.min_level}+`, variant: "muted" as const }] : []),
    ],
  })),
);

// ── Paladin ───────────────────────────────────────────────────────────────────

const isPaladin = computed(() =>
  props.member.class === "Paladin" ||
  (characterClasses.value ?? []).some(cc => cc.class_name === "Paladin"),
);

// ── Class detection ─────────────────────────────────────────────────────────────

const isBarbarian = computed(() =>
  props.member.class === "Barbarian" ||
  (characterClasses.value ?? []).some(cc => cc.class_name === "Barbarian"),
);

const isMonk = computed(() =>
  props.member.class === "Monk" ||
  (characterClasses.value ?? []).some(cc => cc.class_name === "Monk"),
);

const isFighter = computed(() =>
  props.member.class === "Fighter" ||
  (characterClasses.value ?? []).some(cc => cc.class_name === "Fighter"),
);

const isBattleMaster = computed(() => {
  if (!isFighter.value) return false;
  const subclass = (characterClasses.value ?? []).find(cc => cc.class_name === "Fighter")?.subclass_name
    ?? (props.member.class === "Fighter" ? props.member.subclass : null);
  return !!subclass && subclass.toLowerCase().includes("battle master");
});

function classLevel(className: string, officialOnly = false): number {
  return (characterClasses.value ?? []).find(cc =>
    cc.class_name === className && (!officialOnly || cc.class_definition_kind !== "custom"),
  )?.levels
    ?? ((characterClasses.value ?? []).length === 0 && props.member.class === className
      ? props.member.level
      : 0);
}

// ── Barbarian rage ────────────────────────────────────────────────────────────

const rageResource = computed(() => localResources.value.find(r => r.key === "rage_uses") ?? null);
const sorceryResource = computed(() => localResources.value.find(r => r.key === "sorcery_points") ?? null);
const rageRef = ref<InstanceType<typeof PlayerBarbarianRage> | null>(null);

// ── Monk ki ───────────────────────────────────────────────────────────────────

const kiItems = computed<ExpandableItem[]>(() => {
  const lvl = classLevel("Monk");
  return MONK_KI_ABILITIES
    .filter(a => a.min_level <= lvl)
    .map(a => ({
      name: a.name,
      description: a.description,
      subtext: a.timing,
      badges: a.ki_cost > 0 ? [{ label: `${a.ki_cost} ki`, variant: "primary" as const }] : [],
    }));
});

// ── Battle Master maneuvers ───────────────────────────────────────────────────

const superiorityDiceResource = computed(() => localResources.value.find(r => r.key === "superiority_dice") ?? null);

const superiorityDiceSize = computed(() => {
  const lvl = classLevel("Fighter");
  if (lvl >= 18) return "d12";
  if (lvl >= 10) return "d10";
  return "d8";
});

const knownManeuvers = computed(() => {
  const raw = props.member.class_choices?.battle_master_maneuvers;
  const names: string[] = Array.isArray(raw) ? (raw as string[]) : raw ? [String(raw)] : [];
  return names.map(n => BATTLE_MASTER_MANEUVERS_MAP.get(n)).filter(Boolean) as import("@/data/battleMasterManeuvers").BattleManeuver[];
});

// Battle Master maneuvers known scale with Fighter level: 3 at L3, 5 at L7,
// 7 at L10, 9 at L15 (PHB). Without this cap a level-3 BM could learn them all.
function maneuverKnownCap(fighterLevel: number): number {
  if (fighterLevel >= 15) return 9;
  if (fighterLevel >= 10) return 7;
  if (fighterLevel >= 7) return 5;
  if (fighterLevel >= 3) return 3;
  return 0;
}
const maneuverCap = computed(() => maneuverKnownCap(classLevel("Fighter")));

const availableManeuversToLearn = computed(() => {
  if (knownManeuvers.value.length >= maneuverCap.value) return [];
  const known = new Set(knownManeuvers.value.map(m => m.name));
  return BATTLE_MASTER_MANEUVERS.filter(m => !known.has(m.name));
});

function learnManeuver(name: string) {
  const current = props.member.class_choices?.battle_master_maneuvers;
  const existing: string[] = Array.isArray(current) ? (current as string[]) : current ? [String(current)] : [];
  if (existing.includes(name) || existing.length >= maneuverCap.value) return;
  updateMember({ id: props.member.id, update: { class_choices: { ...props.member.class_choices, battle_master_maneuvers: [...existing, name] } } });
}

// ── Resources display ─────────────────────────────────────────────────────────

const displayedResources = computed(() =>
  localResources.value.filter(r => {
    if (r.key === "infusion_slots" && isArtificer.value) return false;
    if (r.key === "superiority_dice" && isBattleMaster.value) return false;
    return true;
  }),
);

// ── Infusions (Artificer) ─────────────────────────────────────────────────────

const {
  isArtificer,
  artificerLevel,
  memberInventoryItems,
  knownInfusions,
  infusionSlotsMax,
  localActiveInfusions,
  availableInfusionsToLearn,
  learnInfusion,
  applyInfusion,
  removeActiveInfusionByName,
  saveInfusionText,
} = useArtificerState(memberRef, characterClasses);
</script>
