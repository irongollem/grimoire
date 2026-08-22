<template>
  <AppModal :open="!!spell" size="lg" align="sheet" @close="$emit('close')">
    <ModalHeader :title="spell?.name ?? ''" :subtitle="spellSubtitle" closeable @close="$emit('close')" />

    <!-- Body (scrollable) -->
    <div v-if="spell" class="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">
      <SpellSheet :spell="spell" />
    </div>
  </AppModal>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { spellLevelLabel } from "@/types/spell.types";
import type { Spell } from "@/types/spell.types";
import SpellSheet from "@/components/spells/SpellSheet.vue";
import AppModal from "@/components/common/AppModal.vue";
import ModalHeader from "@/components/common/ModalHeader.vue";

const props = defineProps<{ spell: Spell | null }>();
defineEmits<{ close: [] }>();

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

const spellSubtitle = computed(() => {
  const s = props.spell;
  if (!s) return "";
  return [
    spellLevelLabel(s.level),
    capitalize(s.school),
    s.ritual ? "Ritual" : null,
    s.concentration ? "Concentration" : null,
  ]
    .filter(Boolean)
    .join(" · ");
});
</script>
