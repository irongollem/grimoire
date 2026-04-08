<template>
  <div class="space-y-6 max-w-lg mx-auto">
    <!-- Header -->
    <div class="text-center space-y-1">
      <p class="font-cinzel text-xs text-primary tracking-widest uppercase">Level Up</p>
      <h2 class="font-cinzel text-2xl font-bold text-foreground">
        {{ member.name }}
        <span class="text-muted-foreground">→ Level {{ nextLevel }}</span>
      </h2>
      <p v-if="member.class" class="font-fell text-sm text-muted-foreground italic">{{ member.class }}</p>
    </div>

    <!-- Max level guard -->
    <div v-if="nextLevel > 20" class="rounded-lg border border-border bg-card p-6 text-center">
      <p class="font-cinzel text-sm text-muted-foreground">{{ member.name }} has already reached level 20.</p>
    </div>

    <template v-else>
      <!-- Features gained -->
      <div class="rounded-lg border border-border bg-card p-4 space-y-3">
        <h3 class="font-cinzel text-xs tracking-wider text-muted-foreground uppercase">Features Gained</h3>

        <template v-if="levelData && levelData.features.length > 0">
          <ul class="space-y-1">
            <li
              v-for="feat in levelData.features"
              :key="feat"
              class="flex items-start gap-2 font-fell text-sm text-foreground"
            >
              <span class="text-primary mt-0.5">✦</span>
              <span>{{ feat }}</span>
            </li>
          </ul>
        </template>
        <template v-else-if="levelData">
          <p class="font-fell text-sm text-muted-foreground italic">
            Class feature details coming soon — check the class description for level {{ nextLevel }} features.
          </p>
        </template>
        <template v-else>
          <p class="font-fell text-sm text-muted-foreground italic">
            No class-specific feature data available yet for {{ member.class ?? "this class" }}.
          </p>
        </template>

        <!-- Spells known increase -->
        <div
          v-if="spellsKnownGain > 0"
          class="flex items-center gap-2 rounded-md bg-primary/10 border border-primary/20 px-3 py-2"
        >
          <span class="font-cinzel text-xs text-primary tracking-wider">SPELLS</span>
          <span class="font-fell text-sm text-foreground">
            Spells known increases to
            <strong class="font-cinzel">{{ levelData?.spells_known }}</strong>
            — add {{ spellsKnownGain }} new spell{{ spellsKnownGain > 1 ? 's' : '' }} in your spell list.
          </span>
        </div>

        <!-- Infusions known increase (Artificer) -->
        <div
          v-if="infusionsKnownGain > 0"
          class="flex items-center gap-2 rounded-md bg-primary/10 border border-primary/20 px-3 py-2"
        >
          <span class="font-cinzel text-xs text-primary tracking-wider">INFUSIONS</span>
          <span class="font-fell text-sm text-foreground">
            Infusions known increases to
            <strong class="font-cinzel">{{ levelData?.infusions_known }}</strong>
            — choose {{ infusionsKnownGain }} new infusion{{ infusionsKnownGain > 1 ? 's' : '' }} from your Artificer list.
          </span>
        </div>

        <!-- Class resource updates (e.g. Sorcery Points) -->
        <div
          v-for="res in resourceNotices"
          :key="res.key"
          class="flex items-center gap-2 rounded-md bg-primary/10 border border-primary/20 px-3 py-2"
        >
          <span class="font-cinzel text-xs text-primary tracking-wider uppercase">{{ res.key.replace('_', ' ') }}</span>
          <span class="font-fell text-sm text-foreground">
            {{ res.label }} maximum:
            <strong class="font-cinzel">{{ res.oldMax }}</strong>
            → <strong class="font-cinzel">{{ res.newMax }}</strong>
          </span>
        </div>

        <!-- Proficiency bonus bump -->
        <div
          v-if="newProfBonus !== member.proficiency_bonus"
          class="flex items-center gap-2 rounded-md bg-primary/10 border border-primary/20 px-3 py-2"
        >
          <span class="font-cinzel text-xs text-primary tracking-wider">PROF</span>
          <span class="font-fell text-sm text-foreground">
            Proficiency bonus increases to
            <strong class="font-cinzel">+{{ newProfBonus }}</strong>
          </span>
        </div>

        <!-- Spell slot change -->
        <div
          v-if="newSpellSlotSummary"
          class="flex items-center gap-2 rounded-md bg-primary/10 border border-primary/20 px-3 py-2"
        >
          <span class="font-cinzel text-xs text-primary tracking-wider">SLOTS</span>
          <span class="font-fell text-sm text-foreground">{{ newSpellSlotSummary }}</span>
        </div>
      </div>

      <!-- ASI picker -->
      <div v-if="levelData?.asi" class="rounded-lg border border-border bg-card p-4 space-y-4">
        <h3 class="font-cinzel text-xs tracking-wider text-muted-foreground uppercase">Ability Score Improvement</h3>
        <p class="font-fell text-sm text-muted-foreground">Choose how to apply your improvement.</p>

        <div class="flex rounded-md border border-border overflow-hidden w-fit font-cinzel text-xs tracking-wider">
          <button
            class="px-3 py-1.5 transition-colors"
            :class="asiMode === 'plus2' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'"
            @click="asiMode = 'plus2'"
          >+2 to one</button>
          <button
            class="px-3 py-1.5 transition-colors"
            :class="asiMode === 'plus1plus1' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'"
            @click="asiMode = 'plus1plus1'"
          >+1 / +1</button>
        </div>

        <div class="flex flex-wrap gap-3">
          <div class="space-y-1">
            <label class="font-cinzel text-[10px] text-muted-foreground tracking-wider">
              {{ asiMode === 'plus2' ? '+2 Ability' : '+1 First Ability' }}
            </label>
            <select
              v-model="asiPrimary"
              class="rounded border border-border bg-muted/40 px-2 py-1.5 font-cinzel text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="" disabled>Select…</option>
              <option v-for="ab in ABILITY_OPTIONS" :key="ab.key" :value="ab.key">{{ ab.label }}</option>
            </select>
          </div>

          <div v-if="asiMode === 'plus1plus1'" class="space-y-1">
            <label class="font-cinzel text-[10px] text-muted-foreground tracking-wider">+1 Second Ability</label>
            <select
              v-model="asiSecondary"
              class="rounded border border-border bg-muted/40 px-2 py-1.5 font-cinzel text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="" disabled>Select…</option>
              <option v-for="ab in ABILITY_OPTIONS" :key="ab.key" :value="ab.key">{{ ab.label }}</option>
            </select>
          </div>
        </div>

        <div v-if="asiPreview.length > 0" class="font-fell text-sm text-muted-foreground">
          <span v-for="(line, i) in asiPreview" :key="i" class="mr-3">{{ line }}</span>
        </div>
      </div>

      <!-- Subclass choice (first unlock, no subclass yet) -->
      <div v-if="needsSubclassChoice" class="rounded-lg border border-border bg-card p-4 space-y-3">
        <h3 class="font-cinzel text-xs tracking-wider text-muted-foreground uppercase">Choose Subclass</h3>
        <p class="font-fell text-sm text-muted-foreground">
          At level {{ nextLevel }}, {{ member.class }} characters choose their specialisation.
        </p>
        <select
          v-if="subclassOptions.length > 0"
          v-model="subclassInput"
          class="w-full rounded border border-border bg-muted/40 px-3 py-2 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="" disabled>Select subclass…</option>
          <option v-for="sc in subclassOptions" :key="sc" :value="sc">{{ sc }}</option>
        </select>
        <input
          v-else
          v-model="subclassInput"
          type="text"
          placeholder="e.g. Circle of the Moon"
          class="w-full rounded border border-border bg-muted/40 px-3 py-2 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <!-- Class-specific steps (single or multi-pick) -->
      <div
        v-for="step in classSteps"
        :key="step.key"
        class="rounded-lg border border-border bg-card p-4 space-y-3"
      >
        <h3 class="font-cinzel text-xs tracking-wider text-muted-foreground uppercase">{{ step.label }}</h3>
        <p v-if="step.description" class="font-fell text-sm text-muted-foreground">{{ step.description }}</p>

        <!-- Multi-pick: render N selects -->
        <template v-if="(step.count ?? 1) > 1">
          <div
            v-for="pickIdx in (step.count ?? 1)"
            :key="pickIdx"
            class="space-y-1"
          >
            <label class="font-cinzel text-[10px] text-muted-foreground tracking-wider">Choice {{ pickIdx }}</label>
            <select
              :value="(stepMultiValues[step.key] ?? [])[pickIdx - 1] ?? ''"
              class="w-full rounded border border-border bg-muted/40 px-3 py-2 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              @change="onMultiStepChange(step, pickIdx - 1, ($event.target as HTMLSelectElement).value)"
            >
              <option value="" disabled>Select…</option>
              <option
                v-for="opt in step.options"
                :key="opt"
                :value="opt"
                :disabled="isMultiPickTaken(step, pickIdx - 1, opt)"
              >{{ opt }}</option>
            </select>
          </div>
        </template>

        <!-- Single-pick -->
        <select
          v-else
          :value="stepValues[step.key] ?? ''"
          class="w-full rounded border border-border bg-muted/40 px-3 py-2 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          @change="onStepChange(step, ($event.target as HTMLSelectElement).value)"
        >
          <option value="" disabled>Select…</option>
          <option v-for="opt in step.options" :key="opt" :value="opt">{{ opt }}</option>
        </select>
      </div>

      <!-- Error -->
      <p v-if="error" class="font-fell text-sm text-destructive">{{ error }}</p>

      <!-- Confirm / Cancel -->
      <div class="flex gap-3">
        <RouterLink
          to="/play"
          class="flex-1 rounded-md border border-border px-4 py-2 font-cinzel text-xs text-muted-foreground text-center tracking-wider hover:text-foreground hover:border-primary/40 transition-colors"
        >Cancel</RouterLink>
        <button
          class="flex-1 rounded-md bg-primary px-4 py-2 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity disabled:opacity-50"
          :disabled="isPending || !canConfirm"
          @click="confirm"
        >
          {{ isPending ? "Applying…" : `Confirm Level ${nextLevel}` }}
        </button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useRouter, RouterLink } from "vue-router";
import { useUpdatePartyMember } from "@/composables/useParty";
import { getLevelData, proficiencyBonusForLevel, getClassSteps, getClassResources } from "./classFeatures";
import { getDefaultSpellSlots } from "@/types/spell.types";
import type { PartyMember, PartyMemberUpdate, SpellSlotEntry } from "@/types/party.types";
import type { AbilityKey, AsiMode, ClassStep } from "./types";
import { RANGER_SUBCLASSES }    from "./classes/ranger";
import { ARTIFICER_SUBCLASSES } from "./classes/artificer";
import { SORCERER_SUBCLASSES }  from "./classes/sorcerer";
import { PALADIN_SUBCLASSES }   from "./classes/paladin";
import { DRUID_SUBCLASSES }    from "./classes/druid";

const props = defineProps<{ member: PartyMember }>();

const router = useRouter();
const { mutateAsync: updateMember, isPending } = useUpdatePartyMember();

// ── Derived ────────────────────────────────────────────────────────────────────
const nextLevel    = computed(() => props.member.level + 1);
const levelData    = computed(() => getLevelData(props.member.class ?? "", nextLevel.value));
const newProfBonus = computed(() => proficiencyBonusForLevel(nextLevel.value));

const needsSubclassChoice = computed(() =>
  !!levelData.value?.subclass_feature && !props.member.subclass,
);

const SUBCLASS_OPTIONS: Record<string, readonly string[]> = {
  Artificer: ARTIFICER_SUBCLASSES,
  Druid:     DRUID_SUBCLASSES,
  Paladin:   PALADIN_SUBCLASSES,
  Ranger:    RANGER_SUBCLASSES,
  Sorcerer:  SORCERER_SUBCLASSES,
};
const subclassOptions = computed(() => SUBCLASS_OPTIONS[props.member.class ?? ""] ?? []);

// Spell slot change summary
const newSpellSlots = computed<SpellSlotEntry[]>(() =>
  getDefaultSpellSlots(props.member.class, nextLevel.value),
);
const newSpellSlotSummary = computed(() => {
  const prev = getDefaultSpellSlots(props.member.class, props.member.level);
  const next = newSpellSlots.value;
  if (next.length === 0) return null;
  const gains: string[] = [];
  for (const slot of next) {
    const old = prev.find(s => s.level === slot.level);
    if (!old) gains.push(`${slot.max}× level-${slot.level}`);
    else if (slot.max > old.max) gains.push(`+${slot.max - old.max} level-${slot.level}`);
  }
  if (gains.length === 0) return null;
  return `Spell slots: ${gains.join(", ")}`;
});

// Infusions known gain (Artificer)
const infusionsKnownGain = computed(() => {
  const cur  = levelData.value?.infusions_known;
  const prev = getLevelData(props.member.class ?? "", props.member.level)?.infusions_known ?? 0;
  if (!cur) return 0;
  return Math.max(0, cur - prev);
});

// Spells known gain
const spellsKnownGain = computed(() => {
  const cur  = levelData.value?.spells_known;
  const prev = getLevelData(props.member.class ?? "", props.member.level)?.spells_known ?? 0;
  if (!cur) return 0;
  return Math.max(0, cur - prev);
});

// Class resource change notices (e.g. Sorcery Points)
const resourceNotices = computed(() => {
  const defs = getClassResources(props.member.class ?? "", nextLevel.value);
  return defs.flatMap(def => {
    const newMax = def.maxAtLevel(nextLevel.value);
    const oldMax = def.maxAtLevel(props.member.level);
    if (newMax === oldMax) return [];
    return [{ key: def.key, label: def.label, oldMax, newMax }];
  });
});

// ── ASI ────────────────────────────────────────────────────────────────────────
const ABILITY_LABEL: Record<AbilityKey, string> = {
  str: "Strength", dex: "Dexterity", con: "Constitution",
  int: "Intelligence", wis: "Wisdom", cha: "Charisma",
};
const ABILITY_OPTIONS = (Object.entries(ABILITY_LABEL) as [AbilityKey, string][]).map(([key, label]) => ({ key, label }));

const asiMode      = ref<AsiMode>("plus2");
const asiPrimary   = ref<AbilityKey | "">("");
const asiSecondary = ref<AbilityKey | "">("");

const asiPreview = computed(() => {
  const lines: string[] = [];
  if (asiPrimary.value) {
    const cur = props.member[asiPrimary.value as keyof PartyMember] as number;
    lines.push(`${ABILITY_LABEL[asiPrimary.value]} ${cur} → ${cur + (asiMode.value === "plus2" ? 2 : 1)}`);
  }
  if (asiMode.value === "plus1plus1" && asiSecondary.value && asiSecondary.value !== asiPrimary.value) {
    const cur = props.member[asiSecondary.value as keyof PartyMember] as number;
    lines.push(`${ABILITY_LABEL[asiSecondary.value]} ${cur} → ${cur + 1}`);
  }
  return lines;
});

// ── Subclass ───────────────────────────────────────────────────────────────────
const subclassInput = ref("");

// ── Class-specific steps ───────────────────────────────────────────────────────
const classSteps = computed<ClassStep[]>(() =>
  getClassSteps(props.member.class ?? "", nextLevel.value),
);

// Single-pick steps (count === 1 or undefined)
const stepValues = ref<Record<string, string>>({});
function onStepChange(step: ClassStep, value: string) {
  stepValues.value = { ...stepValues.value, [step.key]: value };
}

// Multi-pick steps (count > 1) — stored as string[] per key
const stepMultiValues = ref<Record<string, string[]>>({});
function onMultiStepChange(step: ClassStep, idx: number, value: string) {
  const cur = [...(stepMultiValues.value[step.key] ?? [])];
  cur[idx] = value;
  stepMultiValues.value = { ...stepMultiValues.value, [step.key]: cur };
}
function isMultiPickTaken(step: ClassStep, ownIdx: number, opt: string): boolean {
  const picks = stepMultiValues.value[step.key] ?? [];
  return picks.some((v, i) => i !== ownIdx && v === opt);
}

// ── Validation ─────────────────────────────────────────────────────────────────
const error = ref("");

const canConfirm = computed(() => {
  if (nextLevel.value > 20) return false;
  if (levelData.value?.asi) {
    if (!asiPrimary.value) return false;
    if (asiMode.value === "plus1plus1" && (!asiSecondary.value || asiSecondary.value === asiPrimary.value)) return false;
  }
  if (needsSubclassChoice.value && !subclassInput.value.trim()) return false;
  for (const step of classSteps.value) {
    const count = step.count ?? 1;
    if (count > 1) {
      const picks = stepMultiValues.value[step.key] ?? [];
      if (picks.filter(Boolean).length < count) return false;
    } else {
      if (!stepValues.value[step.key]) return false;
    }
  }
  return true;
});

// ── Confirm ────────────────────────────────────────────────────────────────────
async function confirm() {
  error.value = "";
  const update: Record<string, unknown> = {
    level: nextLevel.value,
    proficiency_bonus: newProfBonus.value,
  };

  // Spell slots — always sync to class defaults on level-up
  if (newSpellSlots.value.length > 0) {
    const existing = props.member.spell_slots ?? [];
    update.spell_slots = newSpellSlots.value.map(s => ({
      ...s,
      used: existing.find(e => e.level === s.level)?.used ?? 0,
    }));
  }

  // ASI
  if (levelData.value?.asi && asiPrimary.value) {
    const bonus = asiMode.value === "plus2" ? 2 : 1;
    update[asiPrimary.value] = (props.member[asiPrimary.value as keyof PartyMember] as number) + bonus;
    if (asiMode.value === "plus1plus1" && asiSecondary.value) {
      update[asiSecondary.value] = (props.member[asiSecondary.value as keyof PartyMember] as number) + 1;
    }
  }

  // Class resources (e.g. Sorcery Points)
  const defs = getClassResources(props.member.class ?? "", nextLevel.value);
  if (defs.length > 0) {
    const newResources = { ...props.member.class_resources };
    for (const def of defs) {
      const newMax = def.maxAtLevel(nextLevel.value);
      const existing = newResources[def.key];
      newResources[def.key] = {
        max:     newMax,
        current: existing ? Math.min(existing.current, newMax) : newMax,
        rest:    def.rest,
      };
    }
    update.class_resources = newResources;
  }

  // Subclass + class_choices
  const newChoices: Record<string, unknown> = { ...props.member.class_choices };

  const subclass = subclassInput.value.trim();
  if (needsSubclassChoice.value && subclass) {
    update.subclass = subclass;
    newChoices.subclass = subclass;
  }

  // Class-specific step values
  for (const step of classSteps.value) {
    const count = step.count ?? 1;
    if (count > 1) {
      const picks = (stepMultiValues.value[step.key] ?? []).filter(Boolean);
      if (picks.length === 0) continue;
      if (step.type === "append") {
        const existing = Array.isArray(newChoices[step.key]) ? (newChoices[step.key] as string[]) : [];
        newChoices[step.key] = [...existing, ...picks];
      } else {
        newChoices[step.key] = picks;
      }
    } else {
      const val = stepValues.value[step.key];
      if (!val) continue;
      if (step.type === "append") {
        const existing = Array.isArray(newChoices[step.key]) ? (newChoices[step.key] as string[]) : [];
        newChoices[step.key] = [...existing, val];
      } else {
        newChoices[step.key] = val;
      }
    }
  }

  if (Object.keys(newChoices).length > Object.keys(props.member.class_choices).length
    || classSteps.value.length > 0 || (needsSubclassChoice.value && subclass)) {
    update.class_choices = newChoices;
  }

  try {
    await updateMember({ id: props.member.id, update: update as PartyMemberUpdate });
    void router.push("/play");
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Failed to apply level up.";
  }
}
</script>
