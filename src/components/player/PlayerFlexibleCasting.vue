<template>
  <div class="rounded-lg border border-violet-500/25 bg-violet-500/5 overflow-hidden">
    <div class="px-4 py-2.5 border-b border-violet-500/20">
      <p class="text-label-lg font-semibold text-violet-500">Flexible Casting</p>
    </div>
    <div class="grid gap-3 p-3 sm:grid-cols-2">
      <div class="flex items-center gap-2">
        <AppSelect v-model.number="createLevel" size="sm" class="min-w-0 flex-1">
          <option v-for="level in creatableLevels" :key="level" :value="level">
            Level {{ level }} — {{ SLOT_COSTS[level] }} SP
          </option>
        </AppSelect>
        <AppButton
          variant="tinted"
          size="sm"
          label="Create slot"
          :disabled="pending || creatableLevels.length === 0"
          tone="arcane"
          emphasis="soft"
          @click="convert('points_to_slot')"
        />
      </div>

      <div class="flex items-center gap-2">
        <AppSelect v-model="sacrificeKey" size="sm" class="min-w-0 flex-1">
          <option v-for="slot in sacrificableSlots" :key="spellSlotKey(slot)" :value="spellSlotKey(slot)">
            {{ poolLabel(slot) }} level {{ slot.level }} — +{{ slot.level }} SP
          </option>
        </AppSelect>
        <AppButton
          variant="tinted"
          size="sm"
          label="Convert slot"
          :disabled="pending || sacrificableSlots.length === 0"
          tone="arcane"
          emphasis="soft"
          @click="convert('slot_to_points')"
        />
      </div>
    </div>
    <p class="px-3 pb-3 text-caption text-muted-foreground italic">
      Created slots vanish when you finish a Long Rest. Sorcery Points can’t exceed {{ sorceryPoints.max }}.
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watchEffect } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import { useConvertSorceryPoints } from "@/composables/party/useParty";
import { useToast } from "@/composables/useToast";
import { spellSlotKey, slotPool } from "@/rules/spellSlots";
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
