<template>
  <div class="flex flex-col gap-2">
    <div class="flex flex-wrap items-center gap-2">
      <!-- Title input -->
      <label class="flex-1 min-w-48">
        <span class="sr-only">{{ titleLabel ?? "Title" }}</span>
        <input
          :value="title"
          :placeholder="titlePlaceholder ?? 'Title…'"
          :disabled="disabled"
          class="w-full bg-card border border-border rounded-md px-3 py-2 text-heading font-bold text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
          @input="emit('update:title', ($event.target as HTMLInputElement).value)"
        />
      </label>

      <!-- Caller-defined controls between title and save (e.g. status select) -->
      <slot name="controls" />

      <!-- Player visibility (if provided) -->
      <PlayerVisibilityToggle
        v-if="visibleTo !== undefined"
        :visible-to="visibleTo"
        @update:visible-to="emit('update:visibleTo', $event)"
      />

      <!-- Caller-defined extra buttons before Save (e.g. Generate, Send to Scriptorium) -->
      <slot name="extra-actions" />

      <button
        v-if="exists && !hideCancel"
        type="button"
        class="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 font-cinzel text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-muted-foreground/50 transition-colors"
        @click="emit('cancel')"
      >
        Cancel
      </button>

      <button
        type="button"
        :disabled="!canSave || saving"
        class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-label-lg font-semibold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
        @click="emit('save')"
      >
        <IconSave class="h-3.5 w-3.5" />
        {{ saving ? "Saving…" : exists ? "Save" : createLabel ?? "Create" }}
      </button>

      <button
        v-if="exists"
        type="button"
        class="inline-flex items-center gap-1.5 rounded-md border border-destructive px-3 py-2 font-cinzel text-xs font-semibold text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
        :disabled="deleting"
        @click="emit('delete')"
      >
        <IconDelete class="h-3.5 w-3.5" />
        {{ deleting ? "Deleting…" : "Delete" }}
      </button>
    </div>

    <p v-if="error" class="text-destructive text-body">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
import { IconSave, IconDelete } from "@/lib/icons";
import PlayerVisibilityToggle from "@/components/common/PlayerVisibilityToggle.vue";

defineProps<{
  title: string;
  titleLabel?: string;
  titlePlaceholder?: string;
  exists: boolean;
  canSave: boolean;
  saving?: boolean;
  deleting?: boolean;
  disabled?: boolean;
  hideCancel?: boolean;
  createLabel?: string;
  error?: string | null;
  visibleTo?: string[];
}>();

const emit = defineEmits<{
  (e: "update:title", value: string): void;
  (e: "update:visibleTo", value: string[]): void;
  (e: "save"): void;
  (e: "cancel"): void;
  (e: "delete"): void;
}>();
</script>
