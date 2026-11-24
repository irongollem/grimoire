<template>
  <label v-if="visible" class="flex items-center gap-2" data-testid="entry-arc">
    <span class="text-eyebrow text-muted-foreground">Arc</span>
    <AppSelect :model-value="entry.arc_id" tone="filled" weight="normal" :size="compact ? 'caption' : 'body'" aria-label="The arc it belongs to" @update:model-value="choose">
      <option :value="null">No arc</option>
      <option v-for="arc in arcs" :key="arc.id" :value="arc.id">{{ arc.name }}</option>
    </AppSelect>
  </label>
</template>

<script setup lang="ts">
/**
 * Which arc an entry belongs to: one picker for the truth, force, secret, lore, backstory and open-question rows.
 * A premise entry never has one. It stays out of the way until the DM has made an arc (or the entry holds one).
 */
import { computed } from "vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import { useCanonArcs } from "@/composables/canon/useCanonArcs";
import { useUpdateCanonEntry } from "@/composables/canon/useCanonEntries";
import type { CanonEntry } from "@/types/canon.types";

const { entry, compact = false } = defineProps<{ entry: CanonEntry; compact?: boolean }>();

const { data } = useCanonArcs();
const arcs = computed(() => data.value ?? []);
const { mutate: update } = useUpdateCanonEntry();

const visible = computed(() => entry.part !== "premise" && (arcs.value.length > 0 || entry.arc_id !== null));

function choose(arcId: string | null) {
  update({ id: entry.id, patch: { arc_id: arcId } });
}
</script>
