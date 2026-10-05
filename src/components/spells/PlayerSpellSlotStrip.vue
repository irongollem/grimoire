<template>
  <section
    v-if="rows.length"
    class="mb-3 overflow-hidden rounded-lg border border-border bg-card"
    aria-label="Spell slots"
  >
    <div class="grid divide-y divide-border md:grid-cols-2 md:divide-y-0">
      <div
        v-for="row in rows"
        :key="row.key"
        class="flex min-h-11 items-center gap-2 px-3 md:border-b md:border-border md:odd:border-r"
      >
        <span class="w-28 shrink-0 text-label-lg font-bold text-foreground">{{ row.label }}</span>
        <div class="flex items-center">
          <!--
            Stays native: the visible pip is 1rem, but the tap target has to be
            2.75rem, which no AppButton size gives a ring this small. The hit area is
            the button, the ring is its child.
          -->
          <button
            v-for="pip in row.slot.max"
            :key="pip"
            type="button"
            class="group grid h-11 w-9 place-items-center rounded-md focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-60"
            :aria-label="`${row.label}: ${pip <= row.remaining ? 'spend' : 'restore'} slot ${pip}`"
            :disabled="disabled"
            @click="emit('set-used', row.slot, usedAfterPipTap(row.slot, pip))"
          >
            <span
              class="h-4 w-4 rounded-full border-2 transition-colors"
              :class="pip <= row.remaining
                ? 'border-primary bg-primary'
                : 'border-muted-foreground/40 group-hover:border-primary/60'"
            />
          </button>
        </div>
        <span class="ml-auto shrink-0 text-label tabular-nums text-muted-foreground">
          {{ row.remaining }} / {{ row.slot.max }}
        </span>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { slotPool, spellSlotKey, type SpellSlotPool } from "@/rules/spellSlots";
import { usedAfterPipTap } from "@/rules/spellSlotPips";
import type { SpellSlotEntry } from "@/types/party.types";

const { spellSlots, disabled = false } = defineProps<{
  spellSlots: SpellSlotEntry[];
  disabled?: boolean;
}>();

const emit = defineEmits<{ "set-used": [slot: SpellSlotEntry, used: number] }>();

const ORDINALS = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"] as const;
const POOL_ORDER: readonly SpellSlotPool[] = ["spellcasting", "pact", "feature", "temporary"];
const POOL_NAME: Record<SpellSlotPool, string> = {
  spellcasting: "",
  pact: "Pact Magic",
  feature: "Feature",
  temporary: "Created",
};

function labelFor(slot: SpellSlotEntry): string {
  const level = ORDINALS[slot.level - 1] ?? `Level ${slot.level}`;
  const pool = slotPool(slot);
  return pool === "spellcasting" ? `${level} level` : `${POOL_NAME[pool]} ${level}`;
}

const rows = computed(() =>
  spellSlots
    .filter((slot) => slot.max > 0)
    .sort((a, b) =>
      POOL_ORDER.indexOf(slotPool(a)) - POOL_ORDER.indexOf(slotPool(b)) || a.level - b.level,
    )
    .map((slot) => ({
      key: spellSlotKey(slot),
      slot,
      label: labelFor(slot),
      remaining: slot.max - slot.used,
    })),
);
</script>
