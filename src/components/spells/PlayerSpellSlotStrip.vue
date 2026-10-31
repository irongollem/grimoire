<template>
  <section
    v-if="rows.length"
    class="@container mb-3 overflow-hidden rounded-lg border border-border bg-card"
    aria-label="Spell slots"
  >
    <!--
      Laid out by its own width, not the viewport's: the Hearth puts it in a third
      of a tablet screen and the Spells page across a whole one. A row needs about
      21rem on one line (label, four pips, count), so below that the pips drop to a
      line of their own under the label and count, and two columns need twice that.
    -->
    <div class="grid divide-y divide-border @2xl:grid-cols-2 @2xl:divide-y-0">
      <div
        v-for="row in rows"
        :key="row.key"
        class="grid min-h-11 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 px-3 pt-2 @min-[21rem]:flex @min-[21rem]:pt-0 @2xl:border-b @2xl:border-border @2xl:odd:border-r"
      >
        <span class="shrink-0 text-label-lg font-bold text-foreground @min-[21rem]:w-28">{{ row.label }}</span>
        <!-- On its own line the first ring lines up with the label, not its hit area. -->
        <div class="col-span-2 row-start-2 -ml-2.5 flex flex-wrap items-center @min-[21rem]:ml-0">
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
import { ordinal } from "@/lib/ordinal";

const { spellSlots, disabled = false } = defineProps<{
  spellSlots: SpellSlotEntry[];
  disabled?: boolean;
}>();

const emit = defineEmits<{ "set-used": [slot: SpellSlotEntry, used: number] }>();

const POOL_ORDER: readonly SpellSlotPool[] = ["spellcasting", "pact", "feature", "temporary"];
const POOL_NAME: Record<SpellSlotPool, string> = {
  spellcasting: "",
  pact: "Pact Magic",
  feature: "Feature",
  temporary: "Created",
};

function labelFor(slot: SpellSlotEntry): string {
  const level = ordinal(slot.level);
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
