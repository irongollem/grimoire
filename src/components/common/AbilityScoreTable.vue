<template>
  <!--
    Every ability is exactly two targets, in both layouts: the check (name,
    score and modifier together, because they all roll the same d20) and the
    save. Both answer a hover the same way: the ability's own tint deepens and
    the number you would roll turns gold.

    Each ability keeps its colour, as the 2024 books colour-code them. The
    colour is mixed into the ink, the border and a faint wash rather than used
    neat, so amber and green stay readable on paper and in the dark themes.
  -->

  <!-- ── Sheet: the 2024 character sheet's ability boxes ──────────────────
       A framed box per ability: name, the modifier large (it is what you add
       to the d20), the score in an oval on the bottom edge, and the save under
       it. Six across from sm up, three by two on a phone. -->
  <div v-if="layout === 'sheet'" data-ability-sheet class="grid grid-cols-3 gap-x-2 gap-y-3 border-t border-border p-3 sm:grid-cols-6 sm:gap-x-3">
    <div v-for="ab in ABILITIES" :key="ab.key" class="flex min-w-0 flex-col" :style="{ '--ab': ab.color }">
      <AppButton
        variant="menu"
        size="body"
        block
        class="group relative flex-col justify-center gap-1 rounded-md border px-1 pt-2 pb-4 text-center"
        :class="[FRAME, WASH, HOVER]"
        :tooltip="`Roll a ${ab.name} check`"
        :aria-label="`${ab.name} ${scores[ab.key]}, modifier ${fmt(mod(ab.key))}: roll a check`"
        v-roll-mode="{ enabled: rollModePicker, on: (m: RollMode | null) => emit('roll-ability', ab.key, ab.abbr, mod(ab.key), m) }"
      >
        <span class="max-w-full truncate text-label font-bold" :class="INK">{{ ab.name }}</span>
        <span
          class="font-cinzel text-title font-bold leading-none transition-colors group-hover:text-primary"
          :class="mod(ab.key) < 0 ? 'text-destructive' : 'text-foreground'"
        >{{ fmt(mod(ab.key)) }}</span>
        <span class="absolute -bottom-2.5 left-1/2 min-w-9 -translate-x-1/2 rounded-full border bg-card px-2 font-cinzel text-label-lg leading-snug text-foreground" :class="FRAME">{{ scores[ab.key] }}</span>
      </AppButton>
      <AppButton
        variant="menu"
        size="body"
        block
        class="group mt-3.5 justify-center gap-1.5 rounded-md px-1 py-1"
        :class="HOVER"
        :tooltip="`Roll a ${ab.name} saving throw`"
        :aria-label="`${ab.name} saving throw ${fmt(saveBonus(ab.key))}${isProficient(ab.key) ? ', proficient' : ''}: roll a save`"
        v-roll-mode="{ enabled: rollModePicker, on: (m: RollMode | null) => emit('roll-save', ab.key, ab.abbr, saveBonus(ab.key), m) }"
      >
        <span class="h-3 w-3 shrink-0 rounded-full border-2" :class="pipClass(ab.key)" />
        <span class="text-label text-muted-foreground">Save</span>
        <span
          class="font-cinzel text-label-lg font-bold transition-colors group-hover:text-primary"
          :class="saveBonus(ab.key) < 0 ? 'text-destructive' : 'text-foreground'"
        >{{ fmt(saveBonus(ab.key)) }}</span>
      </AppButton>
    </div>
  </div>

  <!-- ── Stat block: two groups of three, as in the 2024 Monster Manual ─── -->
  <div v-else class="flex flex-row gap-px">
    <div
      v-for="group in ABILITY_GROUPS"
      :key="group[0].key"
      class="grid flex-1 grid-cols-[1fr_auto_auto_auto] border border-border/50"
    >
      <div class="col-span-4 grid grid-cols-subgrid border-b border-border/40 text-label text-muted-foreground/70">
        <span class="col-start-3 px-1.5 py-1 text-center">Mod</span>
        <span class="px-1.5 py-1 text-center">Save</span>
      </div>
      <template v-for="(ab, i) in group" :key="ab.key">
        <AppButton
          :style="{ '--ab': ab.color }"
          variant="menu"
          size="body"
          class="group col-span-3 grid grid-cols-subgrid items-baseline gap-0 rounded-none px-0 py-1.5"
          :class="[WASH, HOVER, i > 0 && 'border-t border-border/30']"
          :tooltip="`Roll a ${ab.name} check`"
          :aria-label="`${ab.name} ${scores[ab.key]}, modifier ${fmt(mod(ab.key))}: roll a check`"
          v-roll-mode="{ enabled: rollModePicker, on: (m: RollMode | null) => emit('roll-ability', ab.key, ab.abbr, mod(ab.key), m) }"
        >
          <span class="pl-2 text-label font-bold" :class="INK">{{ ab.abbr }}</span>
          <span class="px-1.5 text-center text-heading-sm font-bold text-foreground">{{ scores[ab.key] }}</span>
          <span
            class="px-1.5 text-center font-cinzel text-xs font-bold transition-colors group-hover:text-primary"
            :class="mod(ab.key) < 0 ? 'text-destructive' : 'text-foreground'"
          >{{ fmt(mod(ab.key)) }}</span>
        </AppButton>
        <AppButton
          :style="{ '--ab': ab.color }"
          variant="menu"
          size="body"
          class="group justify-center gap-1 rounded-none border-l border-border/30 px-1.5 py-1.5"
          :class="[WASH, HOVER, i > 0 && 'border-t']"
          :tooltip="`Roll a ${ab.name} saving throw`"
          :aria-label="`${ab.name} saving throw ${fmt(saveBonus(ab.key))}${isProficient(ab.key) ? ', proficient' : ''}: roll a save`"
          v-roll-mode="{ enabled: rollModePicker, on: (m: RollMode | null) => emit('roll-save', ab.key, ab.abbr, saveBonus(ab.key), m) }"
        >
          <span class="h-2.5 w-2.5 shrink-0 rounded-full border-2" :class="pipClass(ab.key)" />
          <span
            class="font-cinzel text-xs font-bold transition-colors group-hover:text-primary"
            :class="saveBonus(ab.key) < 0 ? 'text-destructive' : 'text-foreground'"
          >{{ fmt(saveBonus(ab.key)) }}</span>
        </AppButton>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import AppButton from "@/components/common/AppButton.vue";
import type { RollMode } from "@/lib/dice/roller";

const ABILITIES = [
  { key: "str", abbr: "STR", name: "Strength", color: "#ef4444" },
  { key: "dex", abbr: "DEX", name: "Dexterity", color: "#22c55e" },
  { key: "con", abbr: "CON", name: "Constitution", color: "#f59e0b" },
  { key: "int", abbr: "INT", name: "Intelligence", color: "#3b82f6" },
  { key: "wis", abbr: "WIS", name: "Wisdom", color: "#14b8a6" },
  { key: "cha", abbr: "CHA", name: "Charisma", color: "#a855f7" },
] as const;

// Each reads the `--ab` colour set on the ability's element.
const WASH = "bg-[color:color-mix(in_oklab,var(--ab)_5%,transparent)]";
const HOVER = "hover:bg-[color:color-mix(in_oklab,var(--ab)_13%,transparent)]";
const FRAME = "border-[color:color-mix(in_oklab,var(--ab)_35%,var(--border))]";
const INK = "text-[color:color-mix(in_oklab,var(--ab)_70%,var(--foreground))]";

type AbilityKey = (typeof ABILITIES)[number]["key"];

const ABILITY_GROUPS = [ABILITIES.slice(0, 3), ABILITIES.slice(3)];

export interface SaveEntry {
  bonus: number;
  proficient: boolean;
}

const {
  scores,
  saves,
  layout = "statblock",
} = defineProps<{
  /** The six ability scores. */
  scores: Record<AbilityKey, number>;
  /**
   * Optional pre-computed saves keyed by ability ("str" | "dex" | …).
   * If omitted, save bonus falls back to the raw ability modifier with no proficiency pip.
   */
  saves?: Record<string, SaveEntry>;
  /**
   * `statblock` (default): two bordered groups of three rows, score / mod / save,
   * for creature panels. `sheet`: six ability boxes in one band (three by two on
   * a phone), modifier first and score below it, for a character's own sheet.
   * It draws a top rule and its own padding, so it closes the card it sits in.
   */
  layout?: "statblock" | "sheet";
  /**
   * Enable the long-press / right-click advantage-disadvantage picker on each
   * roll button (#501). Off by default so shared DM / read-only usages are
   * unaffected. The chosen mode is passed as the emit's 4th argument.
   */
  rollModePicker?: boolean;
}>();

const emit = defineEmits<{
  /** Ability check clicked — parent handles the roll. Mode set when picked. */
  "roll-ability": [key: string, label: string, modifier: number, mode?: RollMode | null];
  /** Save clicked — parent handles the roll. Mode set when picked. */
  "roll-save": [key: string, label: string, bonus: number, mode?: RollMode | null];
}>();

function mod(key: AbilityKey): number {
  return Math.floor((scores[key] - 10) / 2);
}

function fmt(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

function saveBonus(key: AbilityKey): number {
  return saves?.[key]?.bonus ?? mod(key);
}

function isProficient(key: AbilityKey): boolean {
  return saves?.[key]?.proficient ?? false;
}

/** The same proficiency pip as the skill rows, so a proficient save reads the same as a proficient skill. */
function pipClass(key: AbilityKey): string {
  return isProficient(key) ? "border-primary bg-primary/20" : "border-muted-foreground/30";
}
</script>
