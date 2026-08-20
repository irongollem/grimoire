<template>
  <div class="flex flex-col gap-2">
    <div v-if="entries?.length" class="flex flex-wrap gap-1.5">
      <div
        v-for="e in entries"
        :key="e.id"
        class="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-1"
      >
        <IconSun class="h-3 w-3 text-muted-foreground shrink-0" />
        <RouterLink
          :to="`/deities/${e.deity.id}`"
          class="font-cinzel text-2xs font-semibold text-foreground hover:text-primary transition-colors"
        >{{ e.deity.name }}</RouterLink>
        <span v-if="e.deity.titles" class="text-caption-sm text-muted-foreground italic">{{ e.deity.titles }}</span>
        <AppButton variant="ghost" tone="danger" size="inline-xs" class="shrink-0" label="×" @click="remove(e)" />
      </div>
    </div>
    <p v-else class="text-caption text-muted-foreground italic">No patron deities linked.</p>

    <div class="flex items-center gap-2 mt-1">
      <EntityCombobox v-model="newDeityId" :options="availableDeities" placeholder="Add deity…" />
      <AppButton
        variant="primary"
        size="sm"
        :icon="IconAdd"
        icon-size="xs"
        label="Add"
        class="shrink-0"
        :disabled="!newDeityId || adding"
        @click="add"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { RouterLink } from "vue-router";
import { IconAdd, IconSun } from '@/lib/icons';
import {
  useFactionDeities,
  useAddFactionDeity,
  useRemoveFactionDeity,
  type FactionDeityWithDeity,
} from "@/composables/useFactions";
import { useAllDeities } from "@/composables/useDeities";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import AppButton from "@/components/common/AppButton.vue";

const props = defineProps<{ factionId: string }>();

const { data: entries } = useFactionDeities(props.factionId);
const { data: allDeities } = useAllDeities();
const addMut = useAddFactionDeity();
const removeMut = useRemoveFactionDeity();

const linkedIds = computed(() => new Set((entries.value ?? []).map((e) => e.deity_id)));
const availableDeities = computed(() =>
  (allDeities.value ?? [])
    .filter((d) => !linkedIds.value.has(d.id))
    .map((d) => ({ id: d.id, name: d.titles ? `${d.name} — ${d.titles}` : d.name })),
);

const newDeityId = ref("");
const adding = ref(false);

async function add() {
  if (!newDeityId.value) return;
  adding.value = true;
  try {
    await addMut.mutateAsync({ faction_id: props.factionId, deity_id: newDeityId.value });
    newDeityId.value = "";
  } finally {
    adding.value = false;
  }
}

async function remove(e: FactionDeityWithDeity) {
  await removeMut.mutateAsync({ id: e.id, faction_id: e.faction_id, deity_id: e.deity_id });
}
</script>
