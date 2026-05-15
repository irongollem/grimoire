<template>
  <EntityLightbox
    :open="!!combatant"
    :portrait-src="combatant?.portrait_url ?? null"
    :portrait-alt="combatant?.name"
    :focal-point="combatant?.portrait_focal_point ?? null"
    @close="$emit('close')"
  >
    <h2 class="font-cinzel text-lg font-bold text-foreground">{{ combatant?.name }}</h2>
    <PlayerNotesWidget
      v-if="combatant?.monster_id"
      entity-type="monster"
      :entity-id="combatant.monster_id"
      placeholder="Your observations about this creature…"
    />
  </EntityLightbox>
</template>

<script setup lang="ts">
import EntityLightbox from "@/components/common/EntityLightbox.vue";
import PlayerNotesWidget from "@/components/common/PlayerNotesWidget.vue";
import type { RunCombatant } from "@/types/encounter.types";

defineProps<{ combatant: RunCombatant | null }>();
defineEmits<{ close: [] }>();
</script>
