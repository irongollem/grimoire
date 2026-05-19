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
            <p class="font-fell text-sm text-muted-foreground mb-4">
              Bake this map and attach it to a location in your Atlas.
            </p>
            <label class="block font-cinzel text-[10px] tracking-wider text-muted-foreground uppercase mb-1">
              Location
            </label>
            <EntityCombobox
              v-model="locationId"
              :options="locationOptions"
              placeholder="Search locations…"
            />
            <p v-if="targetHasMap" class="mt-2 font-fell text-xs text-amber-500">This location already has a map — saving will replace it.</p>
            <p v-if="error" class="mt-2 font-fell text-xs text-destructive">{{ error }}</p>
          </div>
          <div class="flex justify-end gap-2 px-5 pb-5 pt-2">
            <button
              type="button"
              class="px-4 py-1.5 rounded-md border border-border font-cinzel text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors tracking-wider"
              @click="$emit('update:modelValue', false)"
            >Cancel</button>
            <button
              type="button"
              :disabled="!locationId || baking"
              class="px-4 py-1.5 rounded-md font-cinzel text-xs font-semibold tracking-wider bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
              @click="$emit('save', locationId)"
            >{{ baking ? "Baking…" : "Save to Atlas" }}</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import EntityCombobox from "@/components/common/EntityCombobox.vue";

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
