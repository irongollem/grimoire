<template>
  <EntityLinkSection
    v-model="newDeityId"
    :entries="entries ?? []"
    :options="availableDeities"
    layout="chip"
    empty="No patron deities linked."
    placeholder="Add deity…"
    :adding="adding"
    remove-label="patron deity"
    @add="add"
    @remove="remove"
  >
    <template #entry="{ entry }">
      <IconSun class="h-3 w-3 text-muted-foreground shrink-0" />
      <RouterLink
        :to="`/deities/${entry.deity.id}`"
        class="font-cinzel text-2xs font-semibold text-foreground hover:text-primary transition-colors"
      >{{ entry.deity.name }}</RouterLink>
      <span v-if="entry.deity.titles" class="text-caption-sm text-muted-foreground italic">
        {{ entry.deity.titles }}
      </span>
    </template>
  </EntityLinkSection>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { RouterLink } from "vue-router";
import { IconSun } from '@/lib/icons';
import {
  useFactionDeities,
  useAddFactionDeity,
  useRemoveFactionDeity,
  type FactionDeityWithDeity,
} from "@/composables/useFactions";
import { useAllDeities } from "@/composables/useDeities";
import EntityLinkSection from "@/components/common/EntityLinkSection.vue";

const props = defineProps<{ factionId: string }>();

const { data: entries } = useFactionDeities(props.factionId);
const { data: allDeities } = useAllDeities();
const addMut = useAddFactionDeity();
const removeMut = useRemoveFactionDeity();

const linkedIds = computed(() => new Set((entries.value ?? []).map((e) => e.deity_id)));
// The picker shows "Name — Titles" so two similarly-named deities can be told apart;
// the chip itself renders the two parts separately.
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
