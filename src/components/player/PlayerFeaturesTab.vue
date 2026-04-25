<template>
  <div class="space-y-4">

    <!-- ── Beast traits (only when wildshaped) ──────────────────────────────── -->
    <div
      v-if="wildshapeMonster?.stat_block?.special_abilities?.length"
      class="rounded-lg border border-primary/30 bg-card overflow-hidden"
    >
      <div class="px-4 py-2.5 border-b border-border">
        <p class="font-cinzel text-xs font-semibold text-primary/80 tracking-wider">
          Beast Traits
          <span class="normal-case font-fell font-normal tracking-normal ml-1 text-muted-foreground/70">({{ wildshapeMonster.name }})</span>
        </p>
      </div>
      <div class="divide-y divide-border">
        <div
          v-for="trait in wildshapeMonster.stat_block.special_abilities"
          :key="trait.name"
          class="px-4 py-2.5"
        >
          <button
            class="w-full text-left flex items-center gap-2 cursor-pointer"
            @click="toggleExpanded(`beast-${trait.name}`)"
          >
            <span class="font-fell text-sm text-foreground flex-1">{{ trait.name }}</span>
            <ChevronDown class="h-3 w-3 text-muted-foreground/60 transition-transform shrink-0" :class="expanded.has(`beast-${trait.name}`) ? 'rotate-180' : ''" />
          </button>
          <div v-if="expanded.has(`beast-${trait.name}`)" class="mt-2 rounded-md bg-muted/30 border border-border/60 px-3 py-2 font-fell text-sm text-muted-foreground leading-relaxed">
            {{ trait.description }}
          </div>
        </div>
      </div>
    </div>

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
    <div v-if="localResources.length > 0" class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-4 py-2.5 border-b border-border">
        <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Resources</p>
      </div>
      <div class="divide-y divide-border">
        <div
          v-for="res in localResources"
          :key="res.key"
          class="flex items-center gap-3 px-4 py-2.5"
        >
          <span class="font-fell text-sm text-foreground flex-1">{{ res.label }}</span>
          <span
            class="font-cinzel text-[10px] tracking-wider rounded px-1.5 py-0.5 shrink-0"
            :class="res.rest === 'short'
              ? 'bg-amber-500/10 text-amber-600 border border-amber-500/20'
              : 'bg-blue-500/10 text-blue-600 border border-blue-500/20'"
          >{{ res.rest === "short" ? "Short" : "Long" }}</span>
          <div class="flex items-center gap-1.5 shrink-0">
            <button
              class="h-6 w-6 rounded border border-border font-cinzel text-sm text-muted-foreground hover:text-foreground hover:border-primary/40 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              :disabled="res.current <= 0"
              @click="spendResource(res.key)"
            >−</button>
            <span class="font-cinzel text-sm text-foreground w-10 text-center">
              {{ res.current }} / {{ res.max }}
            </span>
            <button
              class="h-6 w-6 rounded border border-border font-cinzel text-sm text-muted-foreground hover:text-foreground hover:border-primary/40 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              :disabled="res.current >= res.max"
              @click="restoreResource(res.key)"
            >+</button>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Spell slots ────────────────────────────────────────────────────── -->
    <div v-if="effectiveSlots.length > 0" class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-4 py-2.5 border-b border-border">
        <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Spell Slots</p>
      </div>
      <div class="divide-y divide-border">
        <div
          v-for="slot in effectiveSlots"
          :key="slot.level"
          class="flex items-center gap-3 px-4 py-2.5"
        >
          <span class="font-cinzel text-[10px] text-muted-foreground tracking-wider w-14 shrink-0">
            Level {{ slot.level }}
          </span>
          <div class="flex gap-1.5 flex-wrap">
            <button
              v-for="i in slot.max"
              :key="i"
              class="h-5 w-5 rounded-full border-2 transition-colors"
              :class="i <= (slot.max - slot.used)
                ? 'border-primary bg-primary/80 hover:bg-primary/60'
                : 'border-muted-foreground/30 bg-transparent hover:border-primary/40'"
              :title="i <= (slot.max - slot.used) ? 'Click to use slot' : 'Click to restore slot'"
              @click="toggleSlot(slot.level, i)"
            />
          </div>
          <span class="font-cinzel text-[10px] text-muted-foreground ml-auto shrink-0">
            {{ slot.max - slot.used }}/{{ slot.max }}
          </span>
        </div>
      </div>
    </div>

    <!-- ── Class features (one card per class, grouped for multiclass) ──────── -->
    <template v-for="group in classFeatureGroups" :key="group.class_name">
      <div class="rounded-lg border border-border bg-card overflow-hidden">
        <div class="px-4 py-2.5 border-b border-border">
          <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">
            {{ group.class_name || 'Class' }} Features
            <span v-if="group.subclass_name" class="normal-case font-fell font-normal tracking-normal ml-1 text-muted-foreground/70">({{ group.subclass_name }})</span>
          </p>
        </div>

        <div
          v-if="Object.keys(group.featuresByLevel).length === 0 && Object.keys(group.subclassFeaturesByLevel).length === 0"
          class="px-4 py-3"
        >
          <p class="font-fell text-sm text-muted-foreground italic">No class features defined yet.</p>
        </div>

        <div v-else class="divide-y divide-border">
          <!-- Class features -->
          <template v-for="(features, lvl) in group.featuresByLevel" :key="lvl">
            <div
              v-for="feat in features"
              :key="`${group.class_name}-${lvl}-${featureName(feat)}`"
              class="px-4 py-2.5"
            >
              <button
                class="w-full text-left flex items-center gap-3"
                :class="featureDescription(feat) ? 'cursor-pointer' : 'cursor-default'"
                @click="featureDescription(feat) && toggleExpanded(`class-${group.class_name}-${lvl}-${featureName(feat)}`)"
              >
                <span class="font-cinzel text-[10px] text-muted-foreground tracking-wider w-10 shrink-0">Lvl {{ lvl }}</span>
                <span class="font-fell text-sm text-foreground flex-1">{{ featureName(feat) }}</span>
                <ChevronDown
                  v-if="featureDescription(feat)"
                  class="h-3 w-3 text-muted-foreground/60 transition-transform shrink-0"
                  :class="expanded.has(`class-${group.class_name}-${lvl}-${featureName(feat)}`) ? 'rotate-180' : ''"
                />
              </button>
              <div
                v-if="featureDescription(feat) && expanded.has(`class-${group.class_name}-${lvl}-${featureName(feat)}`)"
                class="mt-2 rounded-md bg-muted/30 border border-border/60 px-3 py-2"
              >
                <RichTextViewer :content="featureDescription(feat)!" />
              </div>
            </div>
          </template>
          <!-- Subclass features inline (subtle tint + "Subclass" badge) -->
          <template v-for="(subFeats, lvl) in group.subclassFeaturesByLevel" :key="`sub-${lvl}`">
            <div
              v-for="feat in subFeats"
              :key="`${group.class_name}-sub-${lvl}-${featureName(feat)}`"
              class="px-4 py-2.5 bg-primary/3"
            >
              <button
                class="w-full text-left flex items-center gap-3"
                :class="featureDescription(feat) ? 'cursor-pointer' : 'cursor-default'"
                @click="featureDescription(feat) && toggleExpanded(`sub-${group.class_name}-${lvl}-${featureName(feat)}`)"
              >
                <span class="font-cinzel text-[10px] text-muted-foreground tracking-wider w-10 shrink-0">Lvl {{ lvl }}</span>
                <span class="font-fell text-sm text-foreground flex-1">{{ featureName(feat) }}</span>
                <span class="font-cinzel text-[9px] text-primary/60 tracking-wider shrink-0 mr-1">Subclass</span>
                <ChevronDown
                  v-if="featureDescription(feat)"
                  class="h-3 w-3 text-muted-foreground/60 transition-transform shrink-0"
                  :class="expanded.has(`sub-${group.class_name}-${lvl}-${featureName(feat)}`) ? 'rotate-180' : ''"
                />
              </button>
              <div
                v-if="featureDescription(feat) && expanded.has(`sub-${group.class_name}-${lvl}-${featureName(feat)}`)"
                class="mt-2 rounded-md bg-muted/30 border border-border/60 px-3 py-2"
              >
                <RichTextViewer :content="featureDescription(feat)!" />
              </div>
            </div>
          </template>
        </div>
      </div>
    </template>

    <!-- ── Spell choices ─────────────────────────────────────────────────── -->
    <div v-if="spellPickSteps.length > 0" class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-4 py-2.5 border-b border-border">
        <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Spell Choices</p>
      </div>
      <div class="divide-y divide-border">
        <div v-for="step in spellPickSteps" :key="step.key" class="px-4 py-3 space-y-2">
          <div class="flex items-baseline gap-3">
            <span class="font-cinzel text-[10px] text-muted-foreground tracking-wider w-10 shrink-0">Lvl {{ step.level }}</span>
            <span class="font-fell text-sm font-semibold text-foreground">{{ step.label }}</span>
          </div>
          <p v-if="step.description" class="font-fell text-xs text-muted-foreground pl-13">{{ step.description }}</p>
          <!-- Already picked -->
          <div v-if="spellChoicesForStep(step.key).length" class="pl-13 flex flex-wrap gap-1.5">
            <span
              v-for="(name, i) in spellChoicesForStep(step.key)"
              :key="i"
              class="inline-flex items-center rounded-md bg-primary/10 border border-primary/20 px-2 py-0.5 font-fell text-sm text-foreground"
            >{{ name }}</span>
          </div>
          <!-- Not yet picked -->
          <div v-else class="pl-13 flex items-center gap-2">
            <select
              v-model="pendingSpellPicks[step.key]"
              class="flex-1 bg-muted/40 border border-border rounded px-2 py-1 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="" disabled>Choose a spell…</option>
              <option v-for="opt in step.options" :key="opt" :value="opt">{{ opt }}</option>
            </select>
            <button
              :disabled="!pendingSpellPicks[step.key]"
              class="px-2.5 py-1 bg-primary text-primary-foreground rounded font-cinzel text-[10px] tracking-wider disabled:opacity-40 transition-opacity hover:opacity-90"
              @click="confirmSpellPick(step.key)"
            >Save</button>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Racial traits ─────────────────────────────────────────────────────── -->
    <div v-if="linkedSpecies && linkedSpecies.traits?.length" class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-4 py-2.5 border-b border-border">
        <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">
          Racial Traits
          <span class="normal-case font-fell font-normal tracking-normal ml-1 text-muted-foreground/70">({{ linkedSpecies.name }})</span>
        </p>
      </div>
      <div class="divide-y divide-border">
        <div
          v-for="trait in linkedSpecies.traits"
          :key="trait.name"
          class="px-4 py-2.5"
        >
          <button
            class="w-full text-left flex items-center gap-2"
            :class="trait.description ? 'cursor-pointer' : 'cursor-default'"
            @click="trait.description && toggleExpanded(`racial-${trait.name}`)"
          >
            <span class="font-fell text-sm text-foreground flex-1">{{ trait.name }}</span>
            <ChevronDown
              v-if="trait.description"
              class="h-3 w-3 text-muted-foreground/60 transition-transform shrink-0"
              :class="expanded.has(`racial-${trait.name}`) ? 'rotate-180' : ''"
            />
          </button>
          <div
            v-if="trait.description && expanded.has(`racial-${trait.name}`)"
            class="mt-2 rounded-md bg-muted/30 border border-border/60 px-3 py-2 font-fell text-sm text-muted-foreground leading-relaxed"
          >
            <RichTextViewer :content="trait.description" />
          </div>
        </div>
      </div>
    </div>

    <!-- ── Subrace traits ─────────────────────────────────────────────────────── -->
    <div v-if="linkedSubrace && linkedSubrace.traits?.length" class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-4 py-2.5 border-b border-border">
        <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">
          Variant Traits
          <span class="normal-case font-fell font-normal tracking-normal ml-1 text-muted-foreground/70">({{ linkedSubrace.name }})</span>
        </p>
      </div>
      <div class="divide-y divide-border">
        <div
          v-for="trait in linkedSubrace.traits"
          :key="trait.name"
          class="px-4 py-2.5"
        >
          <button
            class="w-full text-left flex items-center gap-2"
            :class="trait.description ? 'cursor-pointer' : 'cursor-default'"
            @click="trait.description && toggleExpanded(`subrace-${trait.name}`)"
          >
            <span class="font-fell text-sm text-foreground flex-1">{{ trait.name }}</span>
            <ChevronDown
              v-if="trait.description"
              class="h-3 w-3 text-muted-foreground/60 transition-transform shrink-0"
              :class="expanded.has(`subrace-${trait.name}`) ? 'rotate-180' : ''"
            />
          </button>
          <div
            v-if="trait.description && expanded.has(`subrace-${trait.name}`)"
            class="mt-2 rounded-md bg-muted/30 border border-border/60 px-3 py-2 font-fell text-sm text-muted-foreground leading-relaxed"
          >
            <RichTextViewer :content="trait.description" />
          </div>
        </div>
      </div>
    </div>


    <!-- ── Languages & Tool Proficiencies ───────────────────────────────────── -->
    <div
      v-if="member.languages?.length || member.tool_proficiencies?.length"
      class="rounded-lg border border-border bg-card overflow-hidden"
    >
      <div class="px-4 py-2.5 border-b border-border">
        <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Proficiencies & Languages</p>
      </div>
      <div class="divide-y divide-border">
        <div v-if="member.languages?.length" class="flex gap-3 px-4 py-2.5">
          <span class="font-cinzel text-[10px] text-muted-foreground tracking-wider w-32 shrink-0 pt-0.5">Languages</span>
          <div class="flex flex-wrap gap-1.5">
            <span
              v-for="lang in member.languages"
              :key="lang"
              class="inline-flex items-center rounded-md bg-muted/50 border border-border px-2 py-0.5 font-fell text-sm text-foreground"
            >{{ lang }}</span>
          </div>
        </div>
        <div v-if="member.tool_proficiencies?.length" class="flex gap-3 px-4 py-2.5">
          <span class="font-cinzel text-[10px] text-muted-foreground tracking-wider w-32 shrink-0 pt-0.5">Tools</span>
          <div class="flex flex-wrap gap-1.5">
            <span
              v-for="tool in member.tool_proficiencies"
              :key="tool"
              class="inline-flex items-center rounded-md bg-muted/50 border border-border px-2 py-0.5 font-fell text-sm text-foreground"
            >{{ tool }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Class choices ───────────────────────────────────────────────────── -->
    <div v-if="choiceEntries.length > 0" class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-4 py-2.5 border-b border-border">
        <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Choices</p>
      </div>
      <div class="divide-y divide-border">
        <div
          v-for="entry in choiceEntries"
          :key="entry.key"
          class="flex gap-3 px-4 py-2.5"
        >
          <span class="font-cinzel text-[10px] text-muted-foreground tracking-wider w-32 shrink-0 pt-0.5">
            {{ entry.label }}
          </span>
          <div class="flex flex-wrap gap-1.5">
            <span
              v-for="val in entry.values"
              :key="val"
              class="inline-flex items-center rounded-md bg-primary/10 border border-primary/20 px-2 py-0.5 font-fell text-sm text-foreground"
            >{{ val }}</span>
          </div>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { ChevronDown } from "lucide-vue-next";
import RichTextViewer from "@/components/common/RichTextViewer.vue";
import { featureName, featureDescription, mapFeatureIds, type FeatureEntry } from "@/levelup/types";
import type { CustomStep } from "@/levelup/customTypes";
import { useAllFeatures } from "@/composables/useFeatures";
import { getDefaultSpellSlots, getSlotRecovery, getMulticlassSpellSlots } from "@/types/spell.types";
import { useClassByName, useAllSystemClasses, useAllCustomClasses } from "@/composables/useCustomClasses";
import { useCustomSubclassByClassAndSubclass, useAllCustomSubclasses } from "@/composables/useCustomSubclasses";
import { useCharacterClasses } from "@/composables/useCharacterClasses";
import type { SystemClass, CustomClass, CustomSubclass } from "@/levelup/customTypes";
import { useUpdatePartyMember } from "@/composables/useParty";
import { useAllSpecies } from "@/composables/useSpecies";
import { useConfirm } from "@/composables/useConfirm";
import type { PartyMember, SpellSlotEntry } from "@/types/party.types";
import type { Monster } from "@/types/monster.types";

const props = defineProps<{ member: PartyMember; showRestButtons?: boolean; wildshapeMonster?: Monster }>();

const memberClassRef    = computed(() => props.member.class ?? "");
const memberSubclassRef = computed(() => props.member.subclass ?? "");
const classData = useClassByName(memberClassRef);
const { data: allFeatures } = useAllFeatures();
const { data: customSubclass } = useCustomSubclassByClassAndSubclass(memberClassRef, memberSubclassRef);

const { mutate: updateMember } = useUpdatePartyMember();
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
const { data: characterClasses } = useCharacterClasses(memberIdRef);
const { data: allSystemClasses } = useAllSystemClasses();
const { data: allCustomClasses } = useAllCustomClasses();
const { data: allCustomSubclassEntries } = useAllCustomSubclasses();

/** class_name → class data (custom wins over system on name collision). */
const classDataMap = computed(() => {
  const map = new Map<string, SystemClass | CustomClass>();
  for (const c of allSystemClasses.value ?? []) map.set(c.class_name, c);
  for (const c of allCustomClasses.value ?? []) map.set(c.class_name, c);
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

interface ClassFeatureGroup {
  class_name: string;
  subclass_name: string | null;
  levels: number;
  featuresByLevel: Record<number, FeatureEntry[]>;
  subclassFeaturesByLevel: Record<number, FeatureEntry[]>;
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

/** Feature groups keyed by class — one per character_classes row. */
const classFeatureGroups = computed<ClassFeatureGroup[]>(() =>
  (characterClasses.value ?? []).map(cc => ({
    class_name: cc.class_name,
    subclass_name: cc.subclass_name,
    levels: cc.levels,
    featuresByLevel: buildFeaturesByLevel(classDataMap.value.get(cc.class_name), cc.levels),
    subclassFeaturesByLevel: cc.subclass_name
      ? buildFeaturesByLevel(subclassDataMap.value.get(`${cc.class_name}::${cc.subclass_name}`), cc.levels)
      : {},
  }))
);

// ── Local optimistic state ────────────────────────────────────────────────────

interface LocalResource {
  key: string;
  label: string;
  current: number;
  max: number;
  rest: "short" | "long";
}

const localResources = ref<LocalResource[]>([]);

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
const effectiveSlots = computed((): SpellSlotEntry[] => {
  const m = props.member;
  if (m.spell_slots?.length) return m.spell_slots;
  const list = (characterClasses.value ?? []).map((c) => ({ class_name: c.class_name, levels: c.levels }));
  if (list.length > 0) return getMulticlassSpellSlots(list);
  return getDefaultSpellSlots(m.class, m.level);
});

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

// ── Spell slot controls ───────────────────────────────────────────────────────

function toggleSlot(level: number, pip: number) {
  const slots = effectiveSlots.value;
  const slot = slots.find(s => s.level === level);
  if (!slot) return;
  const available = slot.max - slot.used;
  // pip index from left; pips 1..available are filled (click = use), rest are empty (click = restore)
  const newUsed = pip <= available
    ? Math.min(slot.max, slot.used + 1)
    : Math.max(0, slot.used - 1);
  const updated = slots.map(s => s.level === level ? { ...s, used: newUsed } : s);
  updateMember({ id: props.member.id, update: { spell_slots: updated } });
}

// ── Rest ──────────────────────────────────────────────────────────────────────

function shortRest() {
  // Restore short-rest resources
  for (const r of localResources.value) {
    if (r.rest === "short") r.current = r.max;
  }
  persistResources();

  // Restore spell slots if class recharges on short rest (Warlock pact magic)
  if ((classData.value?.slot_recovery ?? getSlotRecovery(props.member.class)) === "short") {
    updateMember({ id: props.member.id, update: { spell_slots: effectiveSlots.value.map(s => ({ ...s, used: 0 })) } });
  }
}

async function longRest() {
  const ok = await confirm(
    "Take a long rest? This will restore all resources and spell slots.",
    { title: "Long Rest", confirmLabel: "Rest", danger: false },
  );
  if (!ok) return;

  for (const r of localResources.value) r.current = r.max;
  persistResources();

  updateMember({ id: props.member.id, update: { spell_slots: effectiveSlots.value.map(s => ({ ...s, used: 0 })) } });
}


const expanded = ref(new Set<string>());
function toggleExpanded(name: string) {
  if (expanded.value.has(name)) expanded.value.delete(name);
  else expanded.value.add(name);
  expanded.value = new Set(expanded.value); // trigger reactivity
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

function spellChoicesForStep(stepKey: string): string[] {
  const v = (props.member.class_choices ?? {})[stepKey];
  if (!v) return [];
  return Array.isArray(v) ? (v as string[]) : [String(v)];
}

const pendingSpellPicks = ref<Record<string, string>>({});

function confirmSpellPick(stepKey: string) {
  const picked = pendingSpellPicks.value[stepKey];
  if (!picked) return;
  const newChoices = { ...props.member.class_choices, [stepKey]: picked };
  updateMember({ id: props.member.id, update: { class_choices: newChoices } });
}

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

const choiceEntries = computed(() => {
  const choices = props.member.class_choices ?? {};
  return Object.entries(choices)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([key, value]) => ({
      key,
      label: CHOICE_LABELS[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
      values: Array.isArray(value) ? (value as string[]) : [String(value)],
    }));
});
</script>
