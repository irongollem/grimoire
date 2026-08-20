<template>
  <Teleport to="body">
    <Transition name="dialog-fade">
      <div
        v-if="modelValue"
        class="fixed inset-0 z-200 flex items-center justify-center p-4"
        @mousedown.self="$emit('update:modelValue', false)"
      >
        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" />
        <div
          class="relative w-full max-w-sm rounded-xl border border-border bg-card shadow-2xl"
          role="dialog"
          aria-modal="true"
        >
          <div class="px-5 pt-5 pb-3">
            <h2 class="font-cinzel text-sm font-bold text-foreground tracking-wide mb-1">Save to Atlas</h2>
            <p class="text-body text-muted-foreground mb-4">
              Bake this map and attach it to a location in your Atlas.
            </p>
            <label class="block text-eyebrow text-muted-foreground mb-1">
              Location
            </label>
            <EntityCombobox
              v-model="locationId"
              :options="locationOptions"
              placeholder="Search locations…"
            />
            <p v-if="targetHasMap" class="mt-2 text-caption text-amber-500">This location already has a map — saving will replace it.</p>
            <p v-if="error" class="mt-2 text-caption text-destructive">{{ error }}</p>
          </div>
          <div class="flex justify-end gap-2 px-5 pb-5 pt-2">
            <button
              type="button"
              class="px-4 py-1.5 rounded-md border border-border text-label-lg font-semibold text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
              @click="$emit('update:modelValue', false)"
            >Cancel</button>
            <AppButton
              variant="primary"
              size="sm"
              :disabled="!locationId || baking"
              @click="$emit('save', locationId)"
            >{{ baking ? "Baking…" : "Save to Atlas" }}</AppButton>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import AppButton from "@/components/common/AppButton.vue";

interface LocationOption {
  id: string;
  name: string;
}

const { modelValue, locationOptions, baking, error, targetHasMap } = defineProps<{
  modelValue: boolean;
  locationOptions: LocationOption[];
  baking: boolean;
  error: string | null;
  targetHasMap: boolean;
}>();

defineEmits<{
  "update:modelValue": [value: boolean];
  save: [locationId: string];
}>();

const locationId = defineModel<string>("locationId", { default: "" });
</script>

<style scoped>
.dialog-fade-enter-active,
.dialog-fade-leave-active { transition: opacity 0.15s ease; }
.dialog-fade-enter-active .relative,
.dialog-fade-leave-active .relative { transition: transform 0.15s ease, opacity 0.15s ease; }
.dialog-fade-enter-from,
.dialog-fade-leave-to { opacity: 0; }
.dialog-fade-enter-from .relative,
.dialog-fade-leave-to .relative { transform: scale(0.95); opacity: 0; }
</style>
