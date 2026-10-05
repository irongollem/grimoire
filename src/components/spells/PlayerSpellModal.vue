<template>
  <AppModal :open="!!spell" size="lg" align="sheet" @close="$emit('close')">
    <ModalHeader :title="spell?.name ?? ''" :subtitle="spellSubtitle" closeable @close="$emit('close')" />

    <!-- Body (scrollable) -->
    <div v-if="spell" class="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">
      <SpellSheet :spell="spell" compact />
    </div>

    <!-- Actions, only when the spell is the player's own -->
    <div v-if="spell && (canCast || prepareAction)" class="flex shrink-0 flex-col gap-2 border-t border-border px-5 py-3">
      <p v-if="canCast && castDisabledReason" class="text-caption text-muted-foreground">{{ castDisabledReason }}</p>
      <div class="flex gap-3">
        <AppButton
          v-if="prepareAction"
          variant="subtle"
          size="md"
          class="flex-1"
          :disabled="busy"
          :label="prepareAction === 'prepare' ? 'Prepare' : 'Unprepare'"
          @click="emit('prepare')"
        />
        <AppButton
          v-if="canCast"
          variant="primary"
          size="md"
          class="flex-1"
          :icon="IconWand"
          :disabled="busy || !!castDisabledReason"
          label="Cast"
          @click="emit('cast')"
        />
      </div>
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
import AppButton from "@/components/common/AppButton.vue";
import { IconWand } from "@/lib/icons";

const props = defineProps<{
  spell: Spell | null;
  /** Show Cast: the spell is on the player's list and ready to cast. */
  canCast?: boolean;
  /** Why Cast is unavailable (for example no slot left); disables the button. */
  castDisabledReason?: string | null;
  /** Show Prepare or Unprepare; omitted where the class does not prepare this spell. */
  prepareAction?: "prepare" | "unprepare" | null;
  busy?: boolean;
}>();
const emit = defineEmits<{ close: []; cast: []; prepare: [] }>();

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

const spellSubtitle = computed(() => {
  const s = props.spell;
  if (!s) return "";
  const school = s.school.toLowerCase();
  return s.level === 0 ? `${capitalize(school)} cantrip` : `${spellLevelLabel(s.level).toLowerCase()} ${school}`;
});
</script>
