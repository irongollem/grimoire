<template>
  <AppModal
    :open="dialog !== null"
    size="sm"
    labelled-by="dialog-title"
    :backdrop-dismiss="false"
    @close="cancel"
  >
    <!-- Header -->
    <div class="flex items-start gap-3 px-5 pt-5 pb-3">
      <div
        class="shrink-0 flex items-center justify-center w-9 h-9 rounded-full"
        :class="
          dialog?.danger
            ? 'bg-destructive/15 text-destructive'
            : 'bg-primary/15 text-primary'
        "
      >
        <IconWarning v-if="dialog?.danger" class="h-4.5 w-4.5" />
        <IconInfo v-else class="h-4.5 w-4.5" />
      </div>
      <div class="flex-1 min-w-0">
        <h2
          id="dialog-title"
          class="font-cinzel text-sm font-bold text-foreground tracking-wide"
        >
          {{ dialog?.title }}
        </h2>
        <p
          class="mt-1 text-body text-muted-foreground leading-snug"
        >
          {{ dialog?.message }}
        </p>
      </div>
    </div>

    <!-- Footer -->
    <div class="flex justify-end gap-2 px-5 pb-5 pt-2">
      <AppButton
        v-if="dialog?.type === 'confirm'"
        variant="subtle"
        size="sm"
        label="Cancel"
        @click="cancel"
      />
      <!-- Stays native: `tinted`+`danger`+`solid` is close but paints
           `--tone-danger` (hsl 0 84% 60%), a lighter red than the
           `--destructive` (hsl 0 72% 45%) this has always used. Reconciling the
           two is a design call across every destructive confirm in the app —
           tracked in #752, deliberately not folded into the #746 shell move. -->
      <button
        type="button"
        class="px-4 py-1.5 rounded-md text-label-lg font-semibold transition-colors"
        :class="
          dialog?.danger
            ? 'bg-destructive text-destructive-foreground hover:opacity-90'
            : 'bg-primary text-primary-foreground hover:opacity-90'
        "
        @click="ok"
      >
        {{ dialog?.confirmLabel }}
      </button>
    </div>
  </AppModal>
</template>

<script setup lang="ts">
/**
 * The app-wide confirm/alert, mounted once in `App.vue`.
 *
 * `backdropDismiss: false` is the answer to the question #746 raised. Backdrop
 * dismissal has never actually worked here — the handler was copied in the form
 * where `.self` can never match — so migrating it would have *added* "a click
 * beside the panel cancels" across all 73 call sites. For a dialog that exists
 * to ask a question, a stray click is not an answer, so it stays off.
 *
 * Escape does close it, and that is the half worth keeping: `dismissable:
 * false` would have suppressed Escape too, leaving a keyboard user with no way
 * out of an app-wide dialog. Both routes resolve `false` — the safe direction —
 * so nothing destructive can happen by dismissal either way.
 */
import { IconInfo, IconWarning } from '@/lib/icons';
import { useConfirm } from "@/composables/useConfirm";
import AppButton from "@/components/common/AppButton.vue";
import AppModal from "@/components/common/AppModal.vue";

const { dialog, _resolve } = useConfirm();

function ok() {
  _resolve(true);
}
function cancel() {
  _resolve(false);
}
</script>

