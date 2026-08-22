<template>
  <!--
    `alertdialog`, not `dialog`: this appears unbidden to report that something
    failed, so it should interrupt rather than wait to be read. `ModalHeader`'s
    subtitle becomes its description, which is the part the role exists to
    carry — the reassurance that nothing was lost is the whole message.

    `panel-class` restates the destructive border the old panel drew. That is a
    per-dialog accent on top of the shell's box rather than a re-declaration of
    it, and no other modal in the app is bordered by its own severity.
  -->
  <AppModal
    :open="open"
    size="md"
    align="sheet"
    role="alertdialog"
    panel-class="border-destructive/40"
    @close="emit('close')"
  >
    <ModalHeader
      title="Quick view unavailable"
      subtitle="The supporting tool failed to load. Your quest position and specialist data were not changed."
      subtitle-role="body"
      :icon="IconWarning"
      tone="danger"
      header-class="border-none"
    />
    <div class="flex shrink-0 justify-end px-5 pb-5">
      <AppButton label="Close" variant="subtle" @click="emit('close')" />
    </div>
  </AppModal>
</template>

<script setup lang="ts">
import { nextTick, onMounted, ref } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import AppModal from "@/components/common/AppModal.vue";
import ModalHeader from "@/components/common/ModalHeader.vue";
import { IconWarning } from "@/lib/icons";

/** Vue hands an async component's `errorComponent` the failure. Unused here — the
 *  message is deliberately the same whatever went wrong — but declared so the
 *  contract with `defineAsyncComponent` is visible. */
defineProps<{ error?: Error }>();
const emit = defineEmits<{ close: [] }>();

/**
 * This component only exists once the load has already failed, so there is no
 * "closed" state to open *from* — and a `<Transition>` does not animate its
 * initial render. Raising the flag a tick after mount makes the panel arrive as
 * a change, which is what the shell animates. Same trick as `EntityDetailModal`.
 */
const open = ref(false);
onMounted(() => void nextTick(() => { open.value = true; }));
</script>
