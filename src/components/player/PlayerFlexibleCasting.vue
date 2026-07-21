<template>
  <div class="rounded-lg border border-violet-500/25 bg-violet-500/5 overflow-hidden">
    <div class="px-4 py-2.5 border-b border-violet-500/20">
      <p class="text-label-lg font-semibold text-violet-500">Flexible Casting</p>
    </div>
    <div class="grid gap-3 p-3 sm:grid-cols-2">
      <div class="flex items-center gap-2">
        <select
          v-model.number="createLevel"
          class="min-w-0 flex-1 rounded border border-border bg-card px-2 py-1.5 font-cinzel text-xs text-foreground"
        >
          <option v-for="level in creatableLevels" :key="level" :value="level">
            Level {{ level }} — {{ SLOT_COSTS[level] }} SP
          </option>
        </select>
        <button
          class="rounded border border-violet-500/30 bg-violet-500/10 px-3 py-1.5 font-cinzel text-xs text-violet-500 disabled:opacity-40"
          :disabled="pending || creatableLevels.length === 0"
          @click="convert('points_to_slot')"
        >Create slot</button>
      </div>

      <div class="flex items-center gap-2">
        <select
          v-model="sacrificeKey"
          class="min-w-0 flex-1 rounded border border-border bg-card px-2 py-1.5 font-cinzel text-xs text-foreground"
        >
          <option v-for="slot in sacrificableSlots" :key="spellSlotKey(slot)" :value="spellSlotKey(slot)">
            {{ poolLabel(slot) }} level {{ slot.level }} — +{{ slot.level }} SP
          </option>
        </select>
        <button
          class="rounded border border-violet-500/30 bg-violet-500/10 px-3 py-1.5 font-cinzel text-xs text-violet-500 disabled:opacity-40"
          :disabled="pending || sacrificableSlots.length === 0"
          @click="convert('slot_to_points')"
        >Convert slot</button>
      </div>
    </div>
    <p class="px-3 pb-3 font-fell text-xs text-muted-foreground italic">
      Created slots vanish when you finish a Long Rest. Sorcery Points can’t exceed {{ sorceryPoints.max }}.
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watchEffect } from "vue";
import { useConvertSorceryPoints } from "@/composables/useParty";
import { useToast } from "@/composables/useToast";
import { spellSlotKey, slotPool } from "@/lib/spellSlots";
import type { SpellSlotEntry } from "@/types/party.types";

const SLOT_COSTS: Record<number, number> = { 1: 2, 2: 3, 3: 5, 4: 6, 5: 7 };

const props = defineProps<{
  partyMemberId: string;
  sorceryPoints: { current: number; max: number };
  spellSlots: SpellSlotEntry[];
}>();

const toast = useToast();
const { mutateAsync, isPending: pending } = useConvertSorceryPoints();
const creatableLevels = computed(() =>
  [1, 2, 3, 4, 5].filter((level) => SLOT_COSTS[level] <= props.sorceryPoints.current),
);
const sacrificableSlots = computed(() =>
  props.spellSlots.filter((slot) =>
    slot.used < slot.max && props.sorceryPoints.current + slot.level <= props.sorceryPoints.max,
  ),
);
const createLevel = ref(1);
const sacrificeKey = ref("");

watchEffect(() => {
  if (!creatableLevels.value.includes(createLevel.value)) createLevel.value = creatableLevels.value[0] ?? 1;
  if (!sacrificableSlots.value.some((slot) => spellSlotKey(slot) === sacrificeKey.value)) {
    sacrificeKey.value = sacrificableSlots.value[0] ? spellSlotKey(sacrificableSlots.value[0]) : "";
  }
});

function poolLabel(slot: SpellSlotEntry): string {
  const pool = slotPool(slot);
  if (pool === "pact") return "Pact";
  if (pool === "temporary") return "Created";
  return "Spell";
}

async function convert(direction: "points_to_slot" | "slot_to_points") {
  const slot = direction === "slot_to_points"
    ? sacrificableSlots.value.find((candidate) => spellSlotKey(candidate) === sacrificeKey.value)
    : null;
  try {
    await mutateAsync({
      partyMemberId: props.partyMemberId,
      direction,
      slotLevel: slot?.level ?? createLevel.value,
      pool: slot ? slotPool(slot) : "spellcasting",
    });
  } catch (error) {
    toast.error(toast.fromError(error));
  }
}
</script>
