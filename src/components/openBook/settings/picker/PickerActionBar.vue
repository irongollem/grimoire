<template>
  <div data-slip class="flex flex-wrap items-center gap-3 rounded-md border border-border bg-card px-4 py-3">
    <span class="grow text-label-lg" aria-live="polite">
      {{ summary.selected }} selected
      <span v-if="summary.notShared > 0" class="font-normal text-muted-foreground">
        · {{ summary.notShared }} {{ summary.notShared === 1 ? "is" : "are" }} not ready for the book yet
      </span>
    </span>
    <AppButton variant="ghost" size="sm" label="Take out of the book" :disabled="disabled" @click="emit('take-out')" />
    <AppButton
      v-if="summary.canGoIn > 0"
      :variant="summary.notShared > 0 ? 'outline' : 'primary'"
      size="sm"
      :label="summary.notShared > 0 ? `Add the ${summary.canGoIn} that can go in` : `Add ${summary.canGoIn}`"
      :disabled="disabled"
      @click="emit('add-eligible')"
    />
    <AppButton
      v-if="summary.notShared > 0"
      variant="live"
      size="sm"
      :label="`Share all ${summary.selected} with the party and add`"
      :disabled="disabled || !hasParty"
      :tooltip="hasParty ? undefined : 'The campaign has no party members to share with'"
      @click="emit('share-and-add')"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import type { SelectionSummary } from "@/lib/openBook/pickerRows";

const { summary, busy, hasParty } = defineProps<{ summary: SelectionSummary; busy: boolean; hasParty: boolean }>();
const emit = defineEmits<{ "take-out": []; "add-eligible": []; "share-and-add": [] }>();

const disabled = computed(() => busy || summary.selected === 0);
</script>
