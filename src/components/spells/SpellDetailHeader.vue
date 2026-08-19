<template>
  <div class="flex items-center justify-between gap-3 flex-wrap">
    <RouterLink
      to="/spells"
      class="text-label-lg text-muted-foreground hover:text-foreground transition-colors"
    >
      ← Spellbook
    </RouterLink>
    <div class="flex items-center gap-2">
      <AppButton
        v-if="isAiEnabled"
        variant="tinted"
        tone="primary"
        emphasis="outline"
        size="md"
        :icon="IconGenerate"
        label="Generate"
        @click="$emit('generate')"
      />
      <AppButton
        v-if="hasSpell"
        variant="subtle"
        size="md"
        :disabled="isSendingToScriptorium"
        :icon="IconScrollText"
        :label="isSendingToScriptorium ? 'Sending…' : 'Send to Scriptorium'"
        @click="$emit('sendToScriptorium')"
      />
      <template v-if="!isShared">
        <AppButton
          v-if="hasSpell"
          variant="destructive"
          size="md"
          :disabled="isDeleting"
          :icon="IconDelete"
          label="Delete"
          @click="$emit('delete')"
        />
        <AppButton
          variant="primary"
          size="md"
          :disabled="isSaving || !canSave"
          :icon="IconSave"
          :label="isSaving ? 'Saving…' : hasSpell ? 'Save' : 'Create'"
          @click="$emit('save')"
        />
      </template>
      <span v-else class="text-caption text-muted-foreground italic">Reference spell — art only</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { RouterLink } from "vue-router";
import { IconDelete, IconGenerate, IconSave, IconScrollText } from "@/lib/icons";
import AppButton from "@/components/common/AppButton.vue";

defineProps<{
  hasSpell: boolean;
  isShared: boolean;
  isAiEnabled: boolean;
  isSaving: boolean;
  isDeleting: boolean;
  isSendingToScriptorium: boolean;
  canSave: boolean;
}>();

defineEmits<{
  generate: [];
  sendToScriptorium: [];
  delete: [];
  save: [];
}>();
</script>
