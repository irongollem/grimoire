<template>
  <div class="flex flex-col gap-2">
    <div class="flex flex-wrap items-center gap-2">
      <!-- Title input -->
      <label class="flex-1 min-w-48">
        <span class="sr-only">{{ titleLabel ?? "Title" }}</span>
        <AppInput
          :model-value="title"
          tone="card"
          size="heading"
          :placeholder="titlePlaceholder ?? 'Title…'"
          :disabled="disabled"
          @update:model-value="emit('update:title', $event)"
        />
      </label>

      <!-- Caller-defined controls between title and save (e.g. status select) -->
      <slot name="controls" />

      <!-- Reveal to players (if the entity has an audience) -->
      <AudienceRevealControl
        v-if="visibleTo !== undefined"
        :name="title"
        :visible-to="visibleTo"
        @change="emit('update:visibleTo', $event)"
      />

      <!-- Caller-defined extra buttons before Save (e.g. Generate, Send to Scriptorium) -->
      <slot name="extra-actions" />

      <AppButton
        v-if="exists && !hideCancel"
        variant="subtle"
        size="md"
        label="Cancel"
        @click="emit('cancel')"
      />

      <AppButton
        variant="primary"
        size="md"
        :disabled="!canSave || saving"
        :icon="IconSave"
        :label="saving ? 'Saving…' : exists ? 'Save' : (createLabel ?? 'Create')"
        @click="emit('save')"
      />

      <AppButton
        v-if="exists"
        variant="destructive"
        size="md"
        :disabled="deleting"
        :icon="IconDelete"
        :label="deleting ? 'Deleting…' : 'Delete'"
        @click="emit('delete')"
      />
    </div>

    <p v-if="error" class="text-destructive text-body">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
import { IconSave, IconDelete } from "@/lib/icons";
import AudienceRevealControl from "@/components/common/AudienceRevealControl.vue";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";

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
