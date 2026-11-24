<template>
  <!-- A confirm that can carry one tick box ("Also delete the voice from ElevenLabs"): useConfirm has no such box. -->
  <AppModal :open="open" size="sm" :label="title" @close="emit('cancel')">
    <div class="flex flex-col gap-3 p-5">
      <h2 class="text-heading-sm font-semibold text-foreground">{{ title }}</h2>
      <p class="text-body text-muted-foreground">{{ message }}</p>
      <AppCheckbox v-if="checkLabel" v-model="ticked" :label="checkLabel" />
      <div class="flex justify-end gap-2">
        <AppButton variant="outline" label="Cancel" @click="emit('cancel')" />
        <AppButton :variant="danger ? 'destructive' : 'primary'" :label="confirmLabel" @click="emit('confirm', ticked)" />
      </div>
    </div>
  </AppModal>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import AppModal from "@/components/common/overlays/AppModal.vue";

const { open, title, message, confirmLabel, checkLabel, danger = false } = defineProps<{
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  /** When set, a tick box with this label; its state comes back with the confirmation. */
  checkLabel?: string;
  danger?: boolean;
}>();
const emit = defineEmits<{ (e: "confirm", ticked: boolean): void; (e: "cancel"): void }>();

const ticked = ref(false);
// A reopened dialog starts unticked: a deletion is never pre-agreed by the last one.
watch(
  () => open,
  () => {
    ticked.value = false;
  },
);
</script>
