<template>
  <div class="flex gap-px">
    <table
      v-for="group in ABILITY_GROUPS"
      :key="group[0].key"
      class="flex-1 border border-border/50 overflow-hidden"
      :class="rounded ? 'rounded-lg' : ''"
    >
      <thead>
        <tr class="border-b border-border/40">
          <th class="py-1 px-1.5 text-[9px] font-cinzel tracking-wider text-muted-foreground/70 text-left font-normal"></th>
          <th class="py-1 text-[9px] font-cinzel tracking-wider text-muted-foreground/70 text-center font-normal">#</th>
          <th class="py-1 text-[9px] font-cinzel tracking-wider text-muted-foreground/70 text-center font-normal">MOD</th>
          <th class="py-1 px-1.5 text-[9px] font-cinzel tracking-wider text-muted-foreground/70 text-center font-normal">SAVE</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-border/30">
        <tr
          v-for="ab in group"
          :key="ab.key"
          :style="{ backgroundColor: ab.color + '0d' }"
        >
          <!-- Label (click = roll ability) -->
          <td class="py-0 px-0">
            <button
              class="w-full py-1.5 px-1.5 font-cinzel text-[10px] font-bold tracking-wider text-left transition-opacity hover:opacity-60"
              :style="{ color: ab.color }"
              @click="emit('roll-ability', ab.key, ab.label, mod(ab.key))"
            >{{ ab.label }}</button>
          </td>
          <!-- Score -->
          <td class="py-0 px-0 text-center">
            <button
              class="w-full py-1.5 px-1 font-cinzel text-sm font-bold text-foreground hover:bg-white/5 transition-colors"
              @click="emit('roll-ability', ab.key, ab.label, mod(ab.key))"
            >{{ scores[ab.key] }}</button>
          </td>
          <!-- Modifier -->
          <td class="py-0 px-0 text-center">
            <button
              class="w-full py-1.5 px-1 font-fell text-xs hover:bg-white/5 transition-colors"
              :class="mod(ab.key) >= 0 ? 'text-elven-green' : 'text-destructive'"
              @click="emit('roll-ability', ab.key, ab.label, mod(ab.key))"
            >{{ fmt(mod(ab.key)) }}</button>
          </td>
          <!-- Save -->
          <td class="py-0 px-0 text-center">
            <button
              class="w-full flex items-center justify-center gap-1 py-1.5 px-1.5 hover:bg-white/5 transition-colors"
              @click="emit('roll-save', ab.key, ab.label, saveBonus(ab.key))"
            >
              <span
                class="h-2 w-2 rounded-full border shrink-0"
                :class="isProficient(ab.key) ? 'bg-primary border-primary' : 'border-muted-foreground/30'"
              />
              <span
                class="font-cinzel text-[10px] font-bold"
                :class="saveBonus(ab.key) >= 0 ? 'text-foreground' : 'text-destructive'"
              >{{ fmt(saveBonus(ab.key)) }}</span>
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
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

const props = withDefaults(defineProps<{
  /** The six ability scores. */
  scores: { str: number; dex: number; con: number; int: number; wis: number; cha: number };
  /**
   * Optional pre-computed saves keyed by ability ("str" | "dex" | …).
   * If omitted, save bonus falls back to the raw ability modifier with no proficiency pip.
   */
  saves?: Record<string, SaveEntry>;
  /** Whether to apply outer border-radius to each table. Default true. */
  rounded?: boolean;
}>(), { rounded: true });

const emit = defineEmits<{
  /** Ability check clicked — parent handles the roll. */
  "roll-ability": [key: string, label: string, modifier: number];
  /** Save clicked — parent handles the roll. */
  "roll-save": [key: string, label: string, bonus: number];
}>();

function mod(key: string): number {
  return Math.floor((props.scores[key as keyof typeof props.scores] - 10) / 2);
}

function fmt(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

function saveBonus(key: string): number {
  return props.saves?.[key]?.bonus ?? mod(key);
}

function isProficient(key: string): boolean {
  return props.saves?.[key]?.proficient ?? false;
}
</script>
