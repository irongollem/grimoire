<template>
  <EntityDetailModal
    :title="displayName"
    :subtitle="subtitle"
    :loading="isLoading"
    contained
    :origin-key="`/npcs/${id}`"
    @close="emit('close')"
  >
    <template #actions>
      <NpcRevealControl v-if="npc" :npc="npc" />
      <AppButton
        variant="subtle"
        size="sm"
        label="Edit"
        :icon="IconEdit"
        :to="`/npcs/${id}?edit=true`"
      />
    </template>

    <NpcSheet v-if="npc" :npc="npc" />
    <p v-else class="py-16 text-center text-body text-muted-foreground italic">
      This NPC could not be found.
    </p>
  </EntityDetailModal>
</template>

<script setup lang="ts">
/**
 * An NPC's sheet, over the NPC grid.
 *
 * Nothing here is about being a modal — the shell, the dismissal and the flight
 * out of the card all belong to `EntityDetailModal`. This is the NPC-shaped
 * part: which name to show while an alter ego is in play, the two actions worth
 * having within reach of the artwork, and the sheet itself.
 */
import { computed } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import EntityDetailModal from "@/components/common/EntityDetailModal.vue";
import NpcRevealControl from "@/components/npcs/NpcRevealControl.vue";
import NpcSheet from "@/components/npcs/NpcSheet.vue";
import { useNpc } from "@/composables/npcs/useNpcs";
import { IconEdit } from "@/lib/icons";
import { getNpcDisplayName } from "@/lib/npcDisplay";

const { id } = defineProps<{ id: string }>();

const emit = defineEmits<{ close: [] }>();

const { data: npc, isLoading } = useNpc(computed(() => id));

// `getNpcDisplayName` is honestly nullable — the player projection returns null
// for a name that is not revealed — so the "no name" case is marked rather than
// coerced. A DM looking at their own NPC always has one.
const displayName = computed(() => (npc.value ? getNpcDisplayName(npc.value) ?? "???" : "NPC"));

/** What this NPC is, in one line — the header's job now the sheet has dropped it. */
const subtitle = computed(() => {
  if (!npc.value) return undefined;
  const { race, occupation, alignment, age } = npc.value;
  return [race, occupation, alignment, age ? `Age ${age}` : null].filter(Boolean).join(" · ");
});
</script>
