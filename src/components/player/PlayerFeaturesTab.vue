<template>
  <div class="space-y-4">

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
    <div
      v-if="member.languages?.length || member.tool_proficiencies?.length"
      class="rounded-lg border border-border bg-card overflow-hidden"
    >
      <div class="px-4 py-2.5 border-b border-border">
        <p class="text-label-lg font-semibold text-muted-foreground">Proficiencies & Languages</p>
      </div>
      <div class="divide-y divide-border">
        <div v-if="member.languages?.length" class="flex gap-3 px-4 py-2.5">
          <span class="text-label md:text-sm text-muted-foreground w-32 shrink-0 pt-0.5">Languages</span>
          <div class="flex flex-wrap gap-1.5">
            <template v-for="lang in member.languages" :key="lang">
              <RouterLink
                v-if="isOwner && isChoicePlaceholder(lang)"
                to="/play/character/edit?tab=profs"
                class="inline-flex items-center rounded-md bg-primary/8 border border-primary/30 border-dashed px-2 py-0.5 text-body text-primary/70 hover:text-primary hover:bg-primary/15 transition-colors"
                :title="'Tap to choose a language'"
              >{{ lang }}</RouterLink>
              <span
                v-else
                class="inline-flex items-center rounded-md bg-muted/50 border border-border px-2 py-0.5 text-body text-foreground"
              >{{ lang }}</span>
            </template>
          </div>
        </div>
        <div v-if="member.tool_proficiencies?.length" class="flex gap-3 px-4 py-2.5">
          <span class="text-label md:text-sm text-muted-foreground w-32 shrink-0 pt-0.5">Tools</span>
          <div class="flex flex-wrap gap-1.5">
            <span
              v-for="tool in member.tool_proficiencies"
              :key="tool"
              class="inline-flex items-center rounded-md bg-muted/50 border border-border px-2 py-0.5 text-body text-foreground"
            >{{ tool }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Class choices ───────────────────────────────────────────────────── -->
    <!-- ── Background feat (2024 PHB) ──────────────────────────────────────── -->
    <div v-if="backgroundFeat" class="rounded-lg border border-amber-500/30 bg-amber-500/5 overflow-hidden">
      <div class="px-4 py-2.5 border-b border-amber-500/20 bg-amber-500/10 flex items-center gap-2">
        <p class="text-label-lg font-semibold text-amber-600 dark:text-amber-400">Background Feat</p>
        <span class="text-eyebrow text-amber-600/60 dark:text-amber-400/60">2024 PHB</span>
      </div>
      <div class="px-4 py-3">
        <p class="font-cinzel text-sm font-bold text-foreground">{{ backgroundFeat }}</p>
      </div>
    </div>

    <div v-if="choiceEntries.length > 0" class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-4 py-2.5 border-b border-border">
        <p class="text-label-lg font-semibold text-muted-foreground">Choices</p>
      </div>
      <div class="divide-y divide-border">
        <div
          v-for="entry in choiceEntries"
          :key="entry.key"
          class="flex gap-3 px-4 py-2.5"
        >
          <span class="text-label md:text-sm text-muted-foreground w-32 shrink-0 pt-0.5">
            {{ entry.label }}
          </span>
          <div class="flex flex-wrap gap-1.5">
            <span
              v-for="val in entry.values"
              :key="val"
              class="inline-flex items-center rounded-md bg-primary/10 border border-primary/20 px-2 py-0.5 text-body text-foreground"
            >{{ val }}</span>
          </div>
        </div>
      </div>
    </div>

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
    <div v-if="isPaladin" class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-4 py-2.5 border-b border-border">
        <p class="text-label-lg font-semibold text-muted-foreground">Divine Smite</p>
      </div>
      <div class="divide-y divide-border">
        <div v-for="row in DIVINE_SMITE_TABLE" :key="row.slotLevel" class="flex items-center gap-3 px-4 py-2">
          <span class="text-label text-muted-foreground w-14 shrink-0">Slot {{ row.slotLevel }}</span>
          <span class="font-cinzel text-sm font-bold text-foreground flex-1">{{ row.damage }} radiant</span>
          <span class="text-caption text-muted-foreground italic shrink-0">{{ row.special }} vs undead/fiends</span>
        </div>
      </div>
      <div class="px-4 py-2 border-t border-border">
        <p class="text-caption text-muted-foreground italic">Expend a spell slot after a melee hit. Max 5d8 (+ 1d8 vs undead/fiends).</p>
      </div>
    </div>

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
    />

  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useRouter, RouterLink } from "vue-router";
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
import { useMetamagicOptions } from "@/composables/useMetamagic";
import type { MetamagicOption } from "@/lib/metamagic";
import { ELDRITCH_INVOCATIONS_MAP } from "@/data/eldritchInvocations";
import { MONK_KI_ABILITIES } from "@/data/monkKiAbilities";
import { BATTLE_MASTER_MANEUVERS, BATTLE_MASTER_MANEUVERS_MAP } from "@/data/battleMasterManeuvers";
import { useArtificerState } from "@/composables/useArtificerState";
import { mapFeatureIds, type FeatureEntry } from "@/levelup/types";
import type { CustomStep } from "@/levelup/customTypes";
import { useAllFeatures } from "@/composables/useFeatures";
import { useClassByName, useAllSystemClasses, useAllCustomClasses } from "@/composables/useCustomClasses";
import { useCustomSubclassByClassAndSubclass, useAllCustomSubclasses } from "@/composables/useCustomSubclasses";
import { useCharacterClasses } from "@/composables/useCharacterClasses";
import type { SystemClass, CustomClass, CustomSubclass } from "@/levelup/customTypes";
import { useTakeSpellcastingRest, useUpdatePartyMember } from "@/composables/useParty";
import { useAllSpecies } from "@/composables/useSpecies";
import { useConfirm } from "@/composables/useConfirm";
import type { PartyMember, SpellSlotEntry } from "@/types/party.types";
import type { Monster } from "@/types/monster.types";
import type { ClassFeatureGroup } from "./PlayerClassFeaturesList.vue";
import type { ResourceRow } from "./PlayerResourcePools.vue";
import { useRuleset } from "@/composables/useRuleset";
import { deriveEffectiveSpellSlots } from "@/lib/spellSlots";

const props = defineProps<{ member: PartyMember; showRestButtons?: boolean; wildshapeMonster?: Monster; isOwner?: boolean }>();

const router = useRouter();
const { ruleset } = useRuleset();

function isChoicePlaceholder(s: string): boolean {
  return s.toLowerCase().includes("choice");
}

const memberClassRef    = computed(() => props.member.class ?? "");
const memberSubclassRef = computed(() => props.member.subclass ?? "");
const classData = useClassByName(memberClassRef);
const { data: allFeatures, isPending: featuresPending } = useAllFeatures();
const { data: customSubclass } = useCustomSubclassByClassAndSubclass(memberClassRef, memberSubclassRef);

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

const featureObjectMap = computed(() => new Map((allFeatures.value ?? []).map(f => [f.id, f])));

// ── Multiclass feature grouping ───────────────────────────────────────────────

const memberIdRef = computed(() => props.member.id);
const { data: characterClasses, isPending: classesPending } = useCharacterClasses(memberIdRef);
const { data: allSystemClasses } = useAllSystemClasses();
const { data: allCustomClasses } = useAllCustomClasses();
const { data: allCustomSubclassEntries } = useAllCustomSubclasses();

const featureDataPending = computed(() => featuresPending.value || classesPending.value);

/** Legacy name lookup only; pinned character rows resolve by exact id below. */
const classDataMap = computed(() => {
  const map = new Map<string, SystemClass | CustomClass>();
  for (const c of allCustomClasses.value ?? []) map.set(c.class_name, c);
  for (const c of allSystemClasses.value ?? []) map.set(c.class_name, c);
  return map;
});

/** "ClassName::SubclassName" → subclass data. */
const subclassDataMap = computed(() => {
  const map = new Map<string, CustomSubclass>();
  for (const s of allCustomSubclassEntries.value ?? []) {
    map.set(`${s.class_name}::${s.subclass_name}`, s);
  }
  return map;
});

function classDefinitionFor(entry: NonNullable<typeof characterClasses.value>[number]) {
  if (entry.class_definition_id) {
    const definitions = entry.class_definition_kind === "custom"
      ? (allCustomClasses.value ?? [])
      : (allSystemClasses.value ?? []);
    return definitions.find(definition => definition.id === entry.class_definition_id) ?? null;
  }
  return classDataMap.value.get(entry.class_name) ?? null;
}

function subclassDefinitionFor(entry: NonNullable<typeof characterClasses.value>[number]) {
  if (!entry.subclass_name) return null;
  if (entry.subclass_definition_id) {
    return (allCustomSubclassEntries.value ?? []).find(
      definition => definition.id === entry.subclass_definition_id,
    ) ?? null;
  }
  return subclassDataMap.value.get(`${entry.class_name}::${entry.subclass_name}`) ?? null;
}

function buildFeaturesByLevel(
  cls: { features: Record<string, string[]> } | null | undefined,
  maxLevel: number,
): Record<number, FeatureEntry[]> {
  if (!cls) return {};
  const result: Record<number, FeatureEntry[]> = {};
  for (let lvl = 1; lvl <= maxLevel; lvl++) {
    const entries = mapFeatureIds(cls.features[lvl.toString()] ?? [], featureObjectMap.value);
    if (entries.length > 0) result[lvl] = entries;
  }
  return result;
}

/**
 * Feature groups keyed by class — one per character_classes row. DM-built
 * characters have no character_classes rows (only the player creation wizard
 * seeds one — see useCharacterClasses.ts), so fall back to a single group
 * synthesized from the legacy party_members.class/subclass/level fields.
 */
const classFeatureGroups = computed<ClassFeatureGroup[]>(() => {
  const rows = characterClasses.value ?? [];
  if (rows.length > 0) {
    return rows.map(cc => {
      const classDefinition = classDefinitionFor(cc);
      const subclassDefinition = subclassDefinitionFor(cc);
      return {
        class_name: cc.class_name,
        subclass_name: cc.subclass_name,
        levels: cc.levels,
        featuresByLevel: buildFeaturesByLevel(classDefinition, cc.levels),
        subclassFeaturesByLevel: buildFeaturesByLevel(subclassDefinition, cc.levels),
      };
    });
  }
  if (!props.member.class) return [];
  const className = props.member.class;
  const subclassName = props.member.subclass ?? null;
  const levels = props.member.level;
  return [{
    class_name: className,
    subclass_name: subclassName,
    levels,
    featuresByLevel: buildFeaturesByLevel(classDataMap.value.get(className), levels),
    subclassFeaturesByLevel: subclassName
      ? buildFeaturesByLevel(subclassDataMap.value.get(`${className}::${subclassName}`), levels)
      : {},
  }];
});

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

/** All spell_pick steps from the class and subclass at levels the character has reached. */
const spellPickSteps = computed((): CustomStep[] => {
  const allSteps = [
    ...(classData.value?.steps ?? []),
    ...(customSubclass.value?.steps ?? []),
  ] as CustomStep[];
  return allSteps.filter(s => s.step_type === "spell_pick" && s.level <= props.member.level);
});

// ── Class choices (read-only) ─────────────────────────────────────────────────

const CHOICE_LABELS: Record<string, string> = {
  subclass:               "Subclass",
  fighting_style:         "Fighting Style",
  pact_boon:              "Pact Boon",
  expertise:              "Expertise",
  eldritch_invocations:   "Invocations",
  metamagic_options:      "Metamagic",
  infusions_known:        "Infusions",
  favored_enemy:          "Favored Enemy",
  natural_explorer:       "Natural Explorer",
  ranger_conclave:        "Ranger Conclave",
  divine_domain:          "Divine Domain",
  druid_circle:           "Druid Circle",
  arcane_tradition:       "Arcane Tradition",
  sorcerous_origin:       "Sorcerous Origin",
  bardic_college:         "Bardic College",
  monastic_tradition:     "Monastic Tradition",
  roguish_archetype:      "Roguish Archetype",
  martial_archetype:      "Martial Archetype",
  barbarian_path:         "Primal Path",
};

/** Background feat name from class_choices (set when a 2024 PHB background is picked). */
const backgroundFeat = computed(() => {
  const raw = props.member.class_choices?.background_feat;
  return raw && typeof raw === "string" ? raw : null;
});

const choiceEntries = computed(() => {
  const choices = props.member.class_choices ?? {};
  return Object.entries(choices)
    .filter(([key, v]) =>
      key !== "metamagic_options" && key !== "infusions_known" &&
      key !== "eldritch_invocations" && key !== "battle_master_maneuvers" &&
      key !== "background_feat" &&           // shown in its own dedicated card
      v !== null && v !== undefined && v !== "",
    )
    .map(([key, value]) => ({
      key,
      label: CHOICE_LABELS[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
      values: Array.isArray(value) ? (value as string[]) : [String(value)],
    }));
});

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

const DIVINE_SMITE_TABLE = [
  { slotLevel: 1,   damage: "2d8", special: "3d8" },
  { slotLevel: 2,   damage: "3d8", special: "4d8" },
  { slotLevel: 3,   damage: "4d8", special: "5d8" },
  { slotLevel: "4+", damage: "5d8", special: "6d8" },
] as const;

// ── Class detection ───────────────────────────────────────────────────────────

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

const memberRef = computed(() => props.member);
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
} = useArtificerState(memberRef, characterClasses);
</script>
