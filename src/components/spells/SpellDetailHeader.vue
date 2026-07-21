<template>
  <div class="flex items-center justify-between gap-3 flex-wrap">
    <RouterLink
      to="/spells"
      class="text-label-lg text-muted-foreground hover:text-foreground transition-colors"
    >
      ← Spellbook
    </RouterLink>
    <div class="flex items-center gap-2">
      <button
        v-if="isAiEnabled"
        type="button"
        class="inline-flex items-center gap-1.5 rounded-md border border-primary/40 px-3 py-2 font-cinzel text-xs font-semibold text-primary hover:bg-primary/10 transition-colors"
        @click="$emit('generate')"
      >
        <IconGenerate class="h-3.5 w-3.5" />
        Generate
      </button>
      <button
        v-if="hasSpell"
        type="button"
        :disabled="isSendingToScriptorium"
        class="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 font-cinzel text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors disabled:opacity-50"
        @click="$emit('sendToScriptorium')"
      >
        <IconScrollText class="h-3.5 w-3.5" />
        {{ isSendingToScriptorium ? "Sending…" : "Send to Scriptorium" }}
      </button>
      <template v-if="!isSrd">
        <button
          v-if="hasSpell"
          type="button"
          :disabled="isDeleting"
          class="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 px-3 py-2 font-cinzel text-xs font-semibold text-destructive hover:bg-destructive hover:text-destructive-foreground transition-colors disabled:opacity-50"
          @click="$emit('delete')"
        >
          <IconDelete class="h-3.5 w-3.5" />
          Delete
        </button>
        <button
          type="button"
          :disabled="isSaving || !canSave"
          class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-label-lg font-semibold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
          @click="$emit('save')"
        >
          <IconSave class="h-3.5 w-3.5" />
          {{ isSaving ? "Saving…" : hasSpell ? "Save" : "Create" }}
        </button>
      </template>
      <span v-else class="font-fell text-xs text-muted-foreground italic">SRD spell — art only</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { RouterLink } from "vue-router";
import { IconDelete, IconGenerate, IconSave, IconScrollText } from "@/lib/icons";

defineProps<{
  hasSpell: boolean;
  isSrd: boolean;
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
