<template>
  <AppModal
    :open="modelValue"
    size="sm"
    labelled-by="save-atlas-title"
    @close="$emit('update:modelValue', false)"
  >
    <div class="px-5 pt-5 pb-3">
      <h2 id="save-atlas-title" class="font-cinzel text-sm font-bold text-foreground tracking-wide mb-1">Save to Atlas</h2>
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
      <AppButton variant="subtle" size="sm" label="Cancel" @click="$emit('update:modelValue', false)" />
      <AppButton
        variant="primary"
        size="sm"
        :disabled="!locationId || baking"
        @click="$emit('save', locationId)"
      >{{ baking ? "Baking…" : "Save to Atlas" }}</AppButton>
    </div>
  </AppModal>
</template>

<script setup lang="ts">
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import AppButton from "@/components/common/AppButton.vue";
import AppModal from "@/components/common/AppModal.vue";

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
