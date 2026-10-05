<template>
  <div class="space-y-4">

    <!-- ── Background ruleset review (character converted to the other edition) ─────────────── -->
    <RulesetReviewBanner
      v-if="hasBackgroundRulesetReview"
      link-to="/play/background"
      link-label="Review background"
      ack-label="Keep current choices"
      :acknowledging="acknowledgingBackgroundReview"
      @acknowledge="acknowledgeBackgroundReview"
    >
      {{ member.name }} was converted to the {{ rulesetRules(member.ruleset) }}. Review the background ability scores and Origin feat.
    </RulesetReviewBanner>

    <!-- ── Beast traits (only when wildshaped) ──────────────────────────────── -->
    <PlayerWildshapeTraits
      v-if="wildshapeMonster?.stat_block?.special_abilities?.length"
      :monster="wildshapeMonster"
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

    <!-- ── Class features and feats: one card per feature, grouped by class ── -->
    <CharacterFeaturesPanel
      :granted="granted"
      :pools="pools"
      :remaining="remaining"
      :class-choices="member.class_choices"
      :pending="isPending"
      :error="error"
      :readonly="!canWrite"
      @spend="spendFromPool"
      @restore="restoreToPool"
      @navigate-spells="router.push('/play/spells')"
    />

    <!-- ── Spell choices ─────────────────────────────────────────────────── -->

    <!-- ── Racial / Subrace traits ───────────────────────────────────────────── -->
    <PlayerRacialTraits v-if="racialTraitGroups.length" :groups="racialTraitGroups" />

    <!-- ── Languages & Tool Proficiencies ───────────────────────────────────── -->
    <PlayerProficienciesCard
      v-if="member.languages?.length || member.tool_proficiencies?.length"
      :languages="member.languages"
      :tool-proficiencies="member.tool_proficiencies"
      :is-owner="isOwner"
    />

    <!-- ── Class choices & background ASI (2024 PHB); the origin feat is a feat, shown with the others ───────── -->
    <PlayerChoicesCard
      :class-choices="member.class_choices"
      :exclude-keys="choiceKeysShownElsewhere"
      :background-asi-bonuses="backgroundAsiBonuses"
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
import { rulesetRules } from "@/composables/party/useCharacterRuleset";
import RulesetReviewBanner from "@/components/common/RulesetReviewBanner.vue";
import PlayerWildshapeTraits from "./PlayerWildshapeTraits.vue";
import PlayerFlexibleCasting from "./PlayerFlexibleCasting.vue";
import PlayerSorcererFeatures from "./PlayerSorcererFeatures.vue";
import PlayerBattleMasterManeuvers from "./PlayerBattleMasterManeuvers.vue";
import PlayerArtificerInfusions from "./PlayerArtificerInfusions.vue";
import PlayerRacialTraits from "./PlayerRacialTraits.vue";
import type { TraitGroup } from "./PlayerRacialTraits.vue";
import PlayerExpandableList from "./PlayerExpandableList.vue";
import type { ExpandableItem } from "./PlayerExpandableList.vue";
import PlayerProficienciesCard from "./PlayerProficienciesCard.vue";
import PlayerChoicesCard from "./PlayerChoicesCard.vue";
import CharacterFeaturesPanel from "@/components/features/CharacterFeaturesPanel.vue";
import { useMetamagicOptions } from "@/composables/party/useMetamagic";
import type { MetamagicOption } from "@/rules/metamagic";
import { ELDRITCH_INVOCATIONS_MAP } from "@/data/eldritchInvocations";
import type { EldritchInvocation } from "@/data/eldritchInvocations";
import { MONK_KI_ABILITIES } from "@/data/monkKiAbilities";
import { BATTLE_MASTER_MANEUVERS, BATTLE_MASTER_MANEUVERS_MAP } from "@/data/battleMasterManeuvers";
import type { BattleManeuver } from "@/data/battleMasterManeuvers";
import { useArtificerState } from "@/composables/party/useArtificerState";
import { useClassDefinitionLookup } from "@/composables/party/useClassDefinitionLookup";
import { useCharacterFeatures } from "@/composables/features/useCharacterFeatures";
import { useFeatureUses } from "@/composables/features/useFeatureUses";
import { useUpdatePartyMember } from "@/composables/party/useParty";
import { useAllSpecies } from "@/composables/rules/useSpecies";
import type { PartyMember, SaveKey, SpellSlotEntry } from "@/types/party.types";
import type { PlayerVisibleMonster } from "@/types/monster.types";
import { useRuleset } from "@/composables/rules/useRuleset";
import { deriveEffectiveSpellSlots } from "@/rules/spellSlots";
import { useBackground } from "@/composables/rules/useBackgrounds";
import { abilityBonusesForChoice, parseBackgroundAsiChoice } from "@/rules/backgroundAsi";
import { useRulesetReviews, useAcknowledgeRulesetReviews } from "@/composables/play/useRulesetReviews";

// `canManage` is the page's write signal: the character's owner, or the DM
// managing it (the same signal the Wild Shape tab gets). Only then does the tab
// spend uses or reconcile pools; anyone else reads.
const props = defineProps<{
  member: PartyMember;
  wildshapeMonster?: PlayerVisibleMonster;
  isOwner?: boolean;
  canManage?: boolean;
}>();

const router = useRouter();
const { ruleset } = useRuleset();
const toast = useToast();

const memberRef = computed(() => props.member);
const memberIdRef = computed(() => props.member.id);
const canWrite = computed(() => props.canManage === true);

const { data: linkedBackground } = useBackground(computed(() => props.member.background_id ?? ""));

const { mutate: updateMember } = useUpdatePartyMember();
const { data: allSpecies } = useAllSpecies();
const linkedSpecies = computed(() =>
  (allSpecies.value ?? []).find((s) => s.id === props.member.species_id) ?? null,
);
const linkedSubrace = computed(() =>
  props.member.subrace && linkedSpecies.value?.subraces
    ? (linkedSpecies.value.subraces.find(sr => sr.name === props.member.subrace) ?? null)
    : null,
);

// ── Features, pools and uses ──────────────────────────────────────────────────

const { characterClasses, classDefinitionFor } = useClassDefinitionLookup(memberRef);
const { granted, pools, isPending, complete, error } = useCharacterFeatures(memberRef);
const { remaining, spend, restore, reconcile, needsReconcile, isSaving } = useFeatureUses(memberRef, pools);

// Pools are derived from the features, so while those are still loading the
// pool list is empty and "reconciling" would delete every stored pool. Wait for
// a settled, error-free read in which every class and subclass definition
// resolved (`complete`), and only write when this viewer may.
watch(
  [needsReconcile, isPending, complete, error, canWrite, isSaving],
  () => {
    if (!canWrite.value || isPending.value || !complete.value || error.value || isSaving.value || !needsReconcile.value) return;
    reconcile().catch((e: unknown) => toast.error(toast.fromError(e, "Couldn't update feature uses.")));
  },
  { immediate: true },
);

async function spendFromPool(key: string, amount: number) {
  try {
    await spend({ key, amount });
  } catch (e) {
    toast.error(toast.fromError(e, "Couldn't spend that."));
  }
}

async function restoreToPool(key: string, amount: number) {
  try {
    await restore(key, amount);
  } catch (e) {
    toast.error(toast.fromError(e, "Couldn't restore that."));
  }
}

/** The pool as the bespoke sorcery card wants it (current / max). */
const sorceryResource = computed(() => {
  const pool = pools.value.find(p => p.key === "sorcery_points");
  const left = remaining("sorcery_points");
  if (!pool || pool.max === "unlimited" || typeof left !== "number") return null;
  return { current: left, max: pool.max };
});

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

/**
 * Keys a feature card already lists under its own name, so the generic Choices
 * card does not show the same pick twice.
 */
const choiceKeysShownElsewhere = computed(() =>
  granted.value.flatMap(g => (g.mechanics.choices ?? []).map(c => c.key)),
);

// ── Background ASI (2024 PHB), fed to PlayerChoicesCard ────────────────

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
  return names.map(n => ELDRITCH_INVOCATIONS_MAP.get(n)).filter((inv): inv is EldritchInvocation => !!inv);
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

// ── Class detection (for the bespoke cards below) ─────────────────────────────

const isMonk = computed(() =>
  (characterClasses.value ?? []).some(cc => cc.class_name === "Monk"),
);

const isBattleMaster = computed(() => {
  const subclass = (characterClasses.value ?? []).find(cc => cc.class_name === "Fighter")?.subclass_name;
  return !!subclass && subclass.toLowerCase().includes("battle master");
});

function classLevel(className: string, officialOnly = false): number {
  return (characterClasses.value ?? []).find(cc =>
    cc.class_name === className && (!officialOnly || cc.class_definition_kind !== "custom"),
  )?.levels ?? 0;
}

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
// The superiority dice are a pool now, shown on the Combat Superiority card.

const knownManeuvers = computed(() => {
  const raw = props.member.class_choices?.battle_master_maneuvers;
  const names: string[] = Array.isArray(raw) ? (raw as string[]) : raw ? [String(raw)] : [];
  return names.map(n => BATTLE_MASTER_MANEUVERS_MAP.get(n)).filter((m): m is BattleManeuver => !!m);
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

// ── Infusions (Artificer) ─────────────────────────────────────────────────────

const {
  isArtificer,
  artificerLevel,
  memberInventoryItems,
  knownInfusions,
  localActiveInfusions,
  availableInfusionsToLearn,
  learnInfusion,
  applyInfusion,
  removeActiveInfusionByName,
  saveInfusionText,
} = useArtificerState(memberRef, characterClasses);

/** How many infusions can be active: the size of the `infusion_slots` pool the features grant. */
const infusionSlotsMax = computed(() => {
  const pool = pools.value.find(p => p.key === "infusion_slots");
  return pool && pool.max !== "unlimited" ? pool.max : 0;
});
</script>
