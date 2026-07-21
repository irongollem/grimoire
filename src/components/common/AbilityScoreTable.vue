<template>
  <!-- ── Horizontal (default): two tables side-by-side ────────────────────── -->
  <div v-if="!vertical" class="flex flex-row gap-px">
    <table
      v-for="group in ABILITY_GROUPS"
      :key="group[0].key"
      class="flex-1 overflow-hidden"
      :class="[
        borderless ? '' : 'border border-border/50',
        rounded ? 'rounded-lg' : '',
      ]"
    >
      <thead>
        <tr class="border-b border-border/40">
          <th class="py-1 px-1.5 text-[0.5625rem] font-cinzel tracking-wider text-muted-foreground/70 text-left font-normal"></th>
          <th class="py-1 text-[0.5625rem] font-cinzel tracking-wider text-muted-foreground/70 text-center font-normal">#</th>
          <th class="py-1 text-[0.5625rem] font-cinzel tracking-wider text-muted-foreground/70 text-center font-normal">MOD</th>
          <th class="py-1 px-1.5 text-[0.5625rem] font-cinzel tracking-wider text-muted-foreground/70 text-center font-normal">SAVE</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-border/30">
        <tr
          v-for="ab in group"
          :key="ab.key"
          :style="{ backgroundColor: ab.color + '0d' }"
        >
          <td class="py-0 px-0">
            <button
              class="w-full py-1.5 px-1.5 text-label font-bold text-left transition-opacity hover:opacity-60 cursor-pointer"
              :style="{ color: ab.color }"
              :title="`Roll ${ab.label} check`"
              v-roll-mode="{ enabled: rollModePicker, on: (m: RollMode | null) => emit('roll-ability', ab.key, ab.label, mod(ab.key), m) }"
            >{{ ab.label }}</button>
          </td>
          <td class="py-0 px-0 text-center">
            <button
              class="w-full py-1.5 px-1 font-cinzel text-sm font-bold text-foreground hover:bg-primary/10 hover:text-primary transition-colors cursor-pointer"
              :title="`Roll ${ab.label} check`"
              v-roll-mode="{ enabled: rollModePicker, on: (m: RollMode | null) => emit('roll-ability', ab.key, ab.label, mod(ab.key), m) }"
            >{{ scores[ab.key] }}</button>
          </td>
          <td class="py-0 px-0 text-center">
            <button
              class="w-full py-1.5 px-1 font-cinzel text-xs font-bold rounded hover:bg-primary/10 hover:text-primary transition-colors cursor-pointer"
              :class="mod(ab.key) >= 0 ? 'text-elven-green' : 'text-destructive'"
              :title="`Roll ${ab.label} check`"
              v-roll-mode="{ enabled: rollModePicker, on: (m: RollMode | null) => emit('roll-ability', ab.key, ab.label, mod(ab.key), m) }"
            >{{ fmt(mod(ab.key)) }}</button>
          </td>
          <td class="py-0 px-0 text-center">
            <button
              class="w-full flex items-center justify-center gap-1 py-1.5 px-1.5 rounded hover:bg-primary/10 transition-colors cursor-pointer group"
              :title="`Roll ${ab.label} saving throw`"
              v-roll-mode="{ enabled: rollModePicker, on: (m: RollMode | null) => emit('roll-save', ab.key, ab.label, saveBonus(ab.key), m) }"
            >
              <span
                class="h-2.5 w-2.5 rounded-full border-2 shrink-0 transition-colors"
                :class="isProficient(ab.key) ? 'bg-primary border-primary' : 'border-muted-foreground/30 group-hover:border-primary/50'"
              />
              <span
                class="font-cinzel text-2xs font-bold group-hover:text-primary transition-colors"
                :class="saveBonus(ab.key) >= 0 ? 'text-foreground' : 'text-destructive'"
              >{{ fmt(saveBonus(ab.key)) }}</span>
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- ── Vertical: single full-width table, all 6 rows ────────────────────── -->
  <table
    v-else
    class="w-full overflow-hidden"
    :class="[
      borderless ? '' : 'border border-border/50',
      rounded ? 'rounded-lg' : '',
    ]"
  >
    <thead>
      <tr class="border-b border-border/40">
        <th class="py-1 px-3 text-[0.5625rem] font-cinzel tracking-wider text-muted-foreground/70 text-left font-normal"></th>
        <th class="py-1 text-[0.5625rem] font-cinzel tracking-wider text-muted-foreground/70 text-center font-normal">#</th>
        <th class="py-1 text-[0.5625rem] font-cinzel tracking-wider text-muted-foreground/70 text-center font-normal">MOD</th>
        <th class="py-1 px-3 text-[0.5625rem] font-cinzel tracking-wider text-muted-foreground/70 text-center font-normal">SAVE</th>
      </tr>
    </thead>
    <tbody class="divide-y divide-border/30">
      <tr
        v-for="ab in ABILITIES"
        :key="ab.key"
        :style="{ backgroundColor: ab.color + '0d' }"
      >
        <td class="py-0 px-0">
          <button
            class="w-full py-1.5 px-3 text-label font-bold text-left transition-opacity hover:opacity-60 cursor-pointer"
            :style="{ color: ab.color }"
            :title="`Roll ${ab.label} check`"
            v-roll-mode="{ enabled: rollModePicker, on: (m: RollMode | null) => emit('roll-ability', ab.key, ab.label, mod(ab.key), m) }"
          >{{ ab.label }}</button>
        </td>
        <td class="py-0 px-0 text-center">
          <button
            class="w-full py-1.5 px-2 font-cinzel text-sm font-bold text-foreground hover:bg-primary/10 hover:text-primary transition-colors cursor-pointer"
            :title="`Roll ${ab.label} check`"
            v-roll-mode="{ enabled: rollModePicker, on: (m: RollMode | null) => emit('roll-ability', ab.key, ab.label, mod(ab.key), m) }"
          >{{ scores[ab.key] }}</button>
        </td>
        <td class="py-0 px-0 text-center">
          <button
            class="w-full py-1.5 px-2 font-cinzel text-xs font-bold rounded hover:bg-primary/10 hover:text-primary transition-colors cursor-pointer"
            :class="mod(ab.key) >= 0 ? 'text-elven-green' : 'text-destructive'"
            :title="`Roll ${ab.label} check`"
            v-roll-mode="{ enabled: rollModePicker, on: (m: RollMode | null) => emit('roll-ability', ab.key, ab.label, mod(ab.key), m) }"
          >{{ fmt(mod(ab.key)) }}</button>
        </td>
        <td class="py-0 px-0 text-center">
          <button
            class="w-full flex items-center justify-center gap-1 py-1.5 px-3 rounded hover:bg-primary/10 transition-colors cursor-pointer group"
            :title="`Roll ${ab.label} saving throw`"
            v-roll-mode="{ enabled: rollModePicker, on: (m: RollMode | null) => emit('roll-save', ab.key, ab.label, saveBonus(ab.key), m) }"
          >
            <span
              class="h-2.5 w-2.5 rounded-full border-2 shrink-0 transition-colors"
              :class="isProficient(ab.key) ? 'bg-primary border-primary' : 'border-muted-foreground/30 group-hover:border-primary/50'"
            />
            <span
              class="font-cinzel text-2xs font-bold group-hover:text-primary transition-colors"
              :class="saveBonus(ab.key) >= 0 ? 'text-foreground' : 'text-destructive'"
            >{{ fmt(saveBonus(ab.key)) }}</span>
          </button>
        </td>
      </tr>
    </tbody>
  </table>
</template>

<script setup lang="ts">
import type { RollMode } from "@/lib/roller";

const ABILITIES = [
  { key: "str", label: "STR", color: "#ef4444" },
  { key: "dex", label: "DEX", color: "#22c55e" },
  { key: "con", label: "CON", color: "#f59e0b" },
  { key: "int", label: "INT", color: "#3b82f6" },
  { key: "wis", label: "WIS", color: "#14b8a6" },
  { key: "cha", label: "CHA", color: "#a855f7" },
] as const;

const ABILITY_GROUPS = [ABILITIES.slice(0, 3), ABILITIES.slice(3)];

export interface SaveEntry {
  bonus: number;
  proficient: boolean;
}

const {
  scores,
  saves,
  rounded = true,
} = defineProps<{
  /** The six ability scores. */
  scores: { str: number; dex: number; con: number; int: number; wis: number; cha: number };
  /**
   * Optional pre-computed saves keyed by ability ("str" | "dex" | …).
   * If omitted, save bonus falls back to the raw ability modifier with no proficiency pip.
   */
  saves?: Record<string, SaveEntry>;
  /** Whether to apply outer border-radius to each table. Default true. */
  rounded?: boolean;
  /**
   * Stack all six abilities in a single full-width table instead of two side-by-side tables.
   * Use in narrow contexts where horizontal space is limited.
   */
  vertical?: boolean;
  /**
   * Remove the outer border so the table blends flush into its parent card.
   * Use when the parent already provides the visual boundary.
   */
  borderless?: boolean;
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

function mod(key: string): number {
  return Math.floor((scores[key as keyof typeof scores] - 10) / 2);
}

function fmt(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

function saveBonus(key: string): number {
  return saves?.[key]?.bonus ?? mod(key);
}

function isProficient(key: string): boolean {
  return saves?.[key]?.proficient ?? false;
}
</script>
