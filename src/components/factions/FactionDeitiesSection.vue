<template>
  <div class="flex flex-col gap-2">
    <div v-if="entries?.length" class="flex flex-wrap gap-1.5">
      <div
        v-for="e in entries"
        :key="e.id"
        class="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-1"
      >
        <Sun class="h-3 w-3 text-muted-foreground shrink-0" />
        <RouterLink
          :to="`/deities/${e.deity.id}`"
          class="font-cinzel text-[10px] font-semibold text-foreground hover:text-primary transition-colors"
        >{{ e.deity.name }}</RouterLink>
        <span v-if="e.deity.titles" class="font-fell text-[10px] text-muted-foreground italic">{{ e.deity.titles }}</span>
        <button
          type="button"
          class="text-muted-foreground hover:text-destructive transition-colors text-sm leading-none shrink-0"
          @click="remove(e)"
        >×</button>
      </div>
    </div>
    <p v-else class="font-fell text-xs text-muted-foreground italic">No patron deities linked.</p>

    <div class="flex items-center gap-2 mt-1">
      <EntityCombobox v-model="newDeityId" :options="availableDeities" placeholder="Add deity…" />
      <button
        type="button"
        :disabled="!newDeityId || adding"
        class="shrink-0 inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 font-cinzel text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
        @click="add"
      >
        <Plus class="h-3 w-3" />
        Add
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { RouterLink } from "vue-router";
import { Plus, Sun } from "lucide-vue-next";
import {
  useFactionDeities,
  useAddFactionDeity,
  useRemoveFactionDeity,
  type FactionDeityWithDeity,
} from "@/composables/useFactions";
import { useAllDeities } from "@/composables/useDeities";
import EntityCombobox from "@/components/common/EntityCombobox.vue";

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
