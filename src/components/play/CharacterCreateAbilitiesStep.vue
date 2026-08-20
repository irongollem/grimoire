<template>
  <div class="space-y-4">

    <!-- Score method tabs -->
    <div class="p-1 rounded-lg bg-muted w-fit">
      <SegmentedControl
        :model-value="scoreMode"
        :options="scoreModeOptions"
        size="sm"
        @update:model-value="onScoreModeChange"
      />
    </div>

    <!-- Point Buy -->
    <div v-if="scoreMode === 'pointbuy'" class="space-y-3">
      <div class="flex items-center justify-between">
        <p class="text-label-lg font-semibold text-muted-foreground">ASSIGN SCORES</p>
        <div class="flex items-center gap-2">
          <span class="font-cinzel text-xs text-muted-foreground">Points remaining:</span>
          <span class="font-cinzel text-sm font-bold"
            :class="pointsRemaining < 0 ? 'text-destructive' : pointsRemaining === 0 ? 'text-green-500' : 'text-primary'">
            {{ pointsRemaining }}
          </span>
        </div>
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div v-for="stat in ABILITY_STATS" :key="stat.key"
          class="rounded-lg border bg-card p-3 flex flex-col items-center gap-1.5 transition-colors"
          :class="asiMode === 'bonus' && racialBonusMap[stat.key] ? 'border-primary/40 bg-primary/2' : 'border-border'">
          <span class="text-label font-semibold text-muted-foreground">{{ stat.label }}</span>
          <div class="flex items-center gap-2">
            <AppButton
              variant="outline"
              size="icon-xs"
              shape="pill"
              label="−"
              :disabled="f[stat.key] <= 8"
              @click="f[stat.key]--"
            />
            <span class="text-heading font-bold w-8 text-center">{{ displayScore(stat.key) }}</span>
            <AppButton
              variant="outline"
              size="icon-xs"
              shape="pill"
              label="+"
              :disabled="f[stat.key] >= 15 || pointsRemaining <= 0 || (pointsRemaining < (POINT_BUY_COSTS[f[stat.key] + 1] ?? 99) - POINT_BUY_COSTS[f[stat.key]])"
              @click="f[stat.key]++"
            />
          </div>
          <span v-if="asiMode === 'bonus' && racialBonusMap[stat.key]"
            class="font-cinzel text-2xs font-bold text-primary leading-none">
            +{{ racialBonusMap[stat.key] }} racial
          </span>
          <span class="font-cinzel text-xs font-bold"
            :class="totalMod(stat.key) >= 0 ? 'text-green-500' : 'text-destructive'">
            {{ totalMod(stat.key) >= 0 ? '+' : '' }}{{ totalMod(stat.key) }}
          </span>
          <span class="font-cinzel text-2xs text-muted-foreground">{{ POINT_BUY_COSTS[f[stat.key]] ?? 0 }} pts</span>
        </div>
      </div>
    </div>

    <!-- Standard Array / 4d6 pool -->
    <div v-else-if="scoreMode === 'array' || scoreMode === 'roll'" class="space-y-3">
      <div class="flex items-center justify-between flex-wrap gap-2">
        <p class="text-body text-muted-foreground italic">
          <template v-if="scoreMode === 'array'">Assign the standard array (15, 14, 13, 12, 10, 8) to your abilities.</template>
          <template v-else>4d6 drop lowest — reroll until happy, then assign.</template>
        </p>
        <AppButton v-if="scoreMode === 'roll'" variant="primary" size="sm" label="Reroll Pool" @click="rollAbilityScores" />
      </div>
      <div class="flex items-center gap-1.5 flex-wrap rounded-md border border-border bg-card px-3 py-2">
        <span class="text-label text-muted-foreground mr-1">POOL</span>
        <span v-for="(val, idx) in scorePool" :key="idx"
          class="w-9 h-9 rounded-md border font-cinzel text-sm font-bold flex items-center justify-center transition-colors"
          :class="Object.values(scoreAssignment).includes(idx)
            ? 'border-primary/30 bg-primary/10 text-primary/60 line-through'
            : 'border-border bg-muted/50 text-foreground'">{{ val }}</span>
        <span v-if="scorePool.length === 0" class="text-caption text-muted-foreground italic">No pool loaded.</span>
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div v-for="stat in ABILITY_STATS" :key="stat.key"
          class="rounded-lg border bg-card p-3 flex flex-col items-center gap-1.5 transition-colors"
          :class="asiMode === 'bonus' && racialBonusMap[stat.key] ? 'border-primary/40 bg-primary/2' : 'border-border'">
          <span class="text-label font-semibold text-muted-foreground">{{ stat.label }}</span>
          <AppSelect
            :model-value="scoreAssignment[stat.key] ?? ''"
            tone="filled"
            size="body"
            weight="normal"
            class="w-full text-center px-3"
            @update:model-value="(v) => onPoolPick(stat.key, String(v))"
          >
            <option value="">—</option>
            <option v-for="opt in availableForAbility(stat.key)" :key="opt.idx" :value="opt.idx">{{ opt.val }}</option>
          </AppSelect>
          <span v-if="asiMode === 'bonus' && racialBonusMap[stat.key]"
            class="font-cinzel text-2xs font-bold text-primary leading-none">
            +{{ racialBonusMap[stat.key] }} racial
          </span>
          <span class="font-cinzel text-xs font-bold"
            :class="totalMod(stat.key) >= 0 ? 'text-green-500' : 'text-destructive'">
            {{ totalMod(stat.key) >= 0 ? '+' : '' }}{{ totalMod(stat.key) }}
          </span>
        </div>
      </div>
    </div>

    <!-- Manual entry -->
    <div v-else class="space-y-3">
      <p class="text-body text-muted-foreground italic">Enter your scores directly.</p>
      <div class="grid grid-cols-3 sm:grid-cols-6 gap-2">
        <label v-for="stat in ABILITY_STATS" :key="stat.key" class="flex flex-col items-center gap-1">
          <span class="text-label font-semibold text-muted-foreground">{{ stat.label }}</span>
          <AppInput
            v-model.number="f[stat.key]"
            type="number"
            tone="filled"
            size="body"
            align="center"
            class="px-1"
            min="1"
            max="30"
          />
          <span v-if="asiMode === 'bonus' && racialBonusMap[stat.key]"
            class="font-cinzel text-2xs font-bold text-primary leading-none">
            +{{ racialBonusMap[stat.key] }} racial
          </span>
          <span class="font-cinzel text-xs font-bold"
            :class="totalMod(stat.key) >= 0 ? 'text-green-500' : 'text-destructive'">
            {{ totalMod(stat.key) >= 0 ? '+' : '' }}{{ totalMod(stat.key) }}
          </span>
        </label>
      </div>
    </div>

    <!-- Species ASI -->
    <div v-if="selectedSpecies?.ability_score_increases && Object.keys(selectedSpecies.ability_score_increases).length"
      class="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2.5">

      <!-- Header + mode switch -->
      <div class="flex items-center justify-between flex-wrap gap-2">
        <p class="text-label-lg font-semibold text-primary">
          {{ selectedSpecies.name.toUpperCase() }} BONUSES
        </p>
        <SegmentedControl
          :model-value="asiMode"
          :options="asiModeOptions"
          size="sm"
          @update:model-value="onAsiModeChange"
        />
      </div>

      <!-- Racial mode: structured — bonuses shown directly in score cards above -->
      <p v-if="asiMode === 'bonus' && asiIsStructured"
        class="text-caption text-muted-foreground italic">
        Racial bonuses reflected in your scores above — applied automatically on save.
      </p>

      <!-- Racial mode: unstructured — show free-text description, player adjusts manually -->
      <div v-else-if="asiMode === 'bonus' && !asiIsStructured" class="space-y-1">
        <p class="text-body text-foreground">{{ asiDescriptionText }}</p>
        <p class="text-caption text-muted-foreground italic">
          Free-text bonus — adjust your scores above to include it, then use Skip or Custom instead.
        </p>
      </div>

      <!-- Custom mode: distribute 3 free points (player picks which abilities) -->
      <div v-else-if="asiMode === 'custom'" class="space-y-2">
        <p class="text-caption text-muted-foreground italic">
          Distribute 3 free points across any abilities (max +2 per ability).
          <span :class="customAsiTotal >= 3 ? 'text-green-500 font-bold not-italic' : 'text-primary'">
            {{ customAsiTotal < 3 ? `${3 - customAsiTotal} remaining` : 'All assigned' }}.
          </span>
        </p>
        <div class="grid grid-cols-3 sm:grid-cols-6 gap-2">
          <div v-for="stat in ABILITY_STATS" :key="stat.key" class="flex flex-col items-center gap-1">
            <span class="text-label font-semibold text-muted-foreground">{{ stat.label }}</span>
            <div class="flex items-center gap-1">
              <AppButton
                variant="outline"
                size="icon-2xs"
                label="−"
                :disabled="customAsi[stat.key] <= 0"
                @click="adjustCustomAsi(stat.key, -1)"
              />
              <span class="font-cinzel text-sm font-bold w-5 text-center"
                :class="customAsi[stat.key] > 0 ? 'text-primary' : 'text-muted-foreground'">
                +{{ customAsi[stat.key] }}
              </span>
              <AppButton
                variant="outline"
                size="icon-2xs"
                label="+"
                :disabled="customAsi[stat.key] >= 2 || customAsiTotal >= 3"
                @click="adjustCustomAsi(stat.key, 1)"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Skip mode -->
      <p v-else class="text-caption text-muted-foreground italic">
        Racial bonuses skipped — you handle your ability scores above.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from "vue";
import {
  ABILITY_STATS, SCORE_MODES, POINT_BUY_COSTS, STANDARD_ARRAY, roll4d6DropLowest,
  type AbilityKey, type AsiMode,
} from "@/rules/characterCreation";
import type { CharacterCreationForm } from "@/composables/useCharacterCreationForm";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import SegmentedControl from "@/components/common/SegmentedControl.vue";

const scoreModeOptions = SCORE_MODES.map((mode) => ({ value: mode.id, label: mode.label }));

const { form } = defineProps<{ form: CharacterCreationForm }>();

const {
  f, scoreMode, pointsRemaining,
  asiMode, customAsi, customAsiTotal, adjustCustomAsi,
  selectedSpecies, selectedSubrace,
  mod,
} = form;

// ── Species ASI format detection ──────────────────────────────────────────────
function isStructuredAsi(asi: Record<string, number | string> | null | undefined): boolean {
  if (!asi) return true;
  if ("description" in asi) return false;
  return Object.values(asi).every(v => typeof v === "number");
}

const asiIsStructured = computed(() =>
  isStructuredAsi(selectedSpecies.value?.ability_score_increases) &&
  isStructuredAsi(selectedSubrace.value?.ability_score_increases),
);

const asiModeOptions = computed(() => {
  const opts: { value: AsiMode; label: string }[] = [];
  if (asiIsStructured.value) opts.push({ value: "bonus", label: "Racial" });
  opts.push({ value: "custom", label: "Custom (+3)" });
  opts.push({ value: "manual", label: "Skip" });
  return opts;
});

function onAsiModeChange(mode: AsiMode) {
  asiMode.value = mode;
}

const racialBonusMap = computed((): Partial<Record<AbilityKey, number>> => {
  if (!asiIsStructured.value || asiMode.value !== "bonus") return {};
  const abilityKeyMap: Record<string, AbilityKey> = {
    str: "str", dex: "dex", con: "con", int: "int", wis: "wis", cha: "cha",
    strength: "str", dexterity: "dex", constitution: "con", intelligence: "int", wisdom: "wis", charisma: "cha",
  };
  const map: Partial<Record<AbilityKey, number>> = {};
  const addAsi = (asi: Record<string, number | string>) => {
    for (const [k, v] of Object.entries(asi)) {
      const fk = abilityKeyMap[k.toLowerCase()];
      if (fk && typeof v === "number") map[fk] = (map[fk] ?? 0) + v;
    }
  };
  const base = selectedSpecies.value?.ability_score_increases;
  if (base && !("description" in base)) addAsi(base);
  const sub = selectedSubrace.value?.ability_score_increases;
  if (sub && !("description" in sub)) addAsi(sub);
  return map;
});

function displayScore(key: AbilityKey): number {
  return f[key] + (racialBonusMap.value[key] ?? 0);
}

function totalMod(key: AbilityKey): number {
  return mod(displayScore(key));
}

const asiDescriptionText = computed((): string => {
  const parts: string[] = [];
  const baseAsi = selectedSpecies.value?.ability_score_increases;
  if (baseAsi) {
    if ("description" in baseAsi && typeof baseAsi.description === "string") parts.push(baseAsi.description as string);
    else parts.push(...Object.entries(baseAsi).map(([k, v]) => `${k.toUpperCase()} +${v}`));
  }
  const subAsi = selectedSubrace.value?.ability_score_increases;
  if (subAsi) {
    if ("description" in subAsi && typeof subAsi.description === "string") parts.push(`${f.subrace}: ${subAsi.description}`);
    else parts.push(...Object.entries(subAsi).map(([k, v]) => `${f.subrace}: ${k.toUpperCase()} +${v}`));
  }
  return parts.join(", ");
});

// ── Ability score pool (array / roll modes) ───────────────────────────────────
const scorePool = ref<number[]>([]);
const scoreAssignment = reactive<Record<AbilityKey, number | null>>({
  str: null, dex: null, con: null, int: null, wis: null, cha: null,
});

function resetPool(values: readonly number[]) {
  scorePool.value = [...values];
  for (const k of Object.keys(scoreAssignment) as AbilityKey[]) {
    scoreAssignment[k] = null;
    f[k] = 8;
  }
}

function rollAbilityScores() {
  const rolled = Array.from({ length: 6 }, () => roll4d6DropLowest()).sort((a, b) => b - a);
  resetPool(rolled);
}

function availableForAbility(abilityKey: AbilityKey): { idx: number; val: number }[] {
  const takenIdxs = new Set<number>();
  for (const k of Object.keys(scoreAssignment) as AbilityKey[]) {
    if (k !== abilityKey && scoreAssignment[k] !== null) takenIdxs.add(scoreAssignment[k]!);
  }
  return scorePool.value.map((val, idx) => ({ idx, val })).filter((e) => !takenIdxs.has(e.idx));
}

function onPoolPick(abilityKey: AbilityKey, poolIdxStr: string) {
  if (poolIdxStr === "") {
    scoreAssignment[abilityKey] = null;
    f[abilityKey] = 8;
    return;
  }
  const idx = Number(poolIdxStr);
  scoreAssignment[abilityKey] = idx;
  f[abilityKey] = scorePool.value[idx] ?? 8;
}

function onScoreModeChange(mode: typeof SCORE_MODES[number]["id"]) {
  scoreMode.value = mode;
  if (mode === "array" && scorePool.value.length === 0) resetPool(STANDARD_ARRAY);
  if (mode === "roll" && scorePool.value.length === 0) rollAbilityScores();
}
</script>
