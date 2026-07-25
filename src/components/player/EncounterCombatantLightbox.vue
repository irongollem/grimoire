<template>
  <EntityLightbox
    :open="!!combatant"
    :portrait-src="portrait"
    :portrait-alt="combatant?.name"
    :placeholder="placeholder"
    :focal-point="focalPoint"
    @close="$emit('close')"
  >
    <h2 class="text-heading font-bold text-foreground">{{ combatant?.name }}</h2>
    <PlayerNotesWidget
      v-if="notesTarget"
      :entity-type="notesTarget.type"
      :entity-id="notesTarget.id"
      :placeholder="
        notesTarget.type === 'npc'
          ? 'Your observations about this character…'
          : 'Your observations about this creature…'
      "
    />
  </EntityLightbox>
</template>

<script setup lang="ts">
import { computed } from "vue";
import EntityLightbox from "@/components/common/EntityLightbox.vue";
import PlayerNotesWidget from "@/components/common/PlayerNotesWidget.vue";
import type { RunCombatant } from "@/types/encounter.types";

const { combatant } = defineProps<{ combatant: RunCombatant | null }>();
defineEmits<{ close: [] }>();

// A wildshaped combatant wears the beast's face — enlarge that, so the picture
// matches the row the player tapped.
const portrait = computed(
  () => combatant?.wildshape?.beast_image_url ?? combatant?.portrait_url ?? null,
);
const focalPoint = computed(() =>
  combatant?.wildshape?.beast_image_url ? null : (combatant?.portrait_focal_point ?? null),
);

const placeholder = computed(() =>
  combatant?.npc_id ? "/assets/placeholders/npc.webp" : "/assets/placeholders/monster.webp",
);

// NPC-backed combatants keep their notes under the `npc` entity so they line up
// with notes the player writes from the party / atlas views.
const notesTarget = computed<{ type: "npc" | "monster"; id: string } | null>(() => {
  if (combatant?.npc_id) return { type: "npc", id: combatant.npc_id };
  if (combatant?.monster_id) return { type: "monster", id: combatant.monster_id };
  return null;
});
</script>
