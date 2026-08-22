<template>
  <AppModal
    :open="dialog !== null"
    size="sm"
    :backdrop-dismiss="false"
    @close="cancel"
  >
    <!--
      The question is the subtitle, which makes it the dialog's
      `aria-describedby` — a confirm that announces its title and then leaves
      the actual question unread is the one thing this dialog must not do.
      `border-none` because there is no body below it to divide from: the
      header *is* the dialog, and the buttons answer it.
    -->
    <ModalHeader
      :title="dialog?.title ?? ''"
      :subtitle="dialog?.message"
      subtitle-role="body"
      :icon="dialog?.danger ? IconWarning : IconInfo"
      :tone="dialog?.danger ? 'danger' : 'primary'"
      header-class="border-none pb-3"
    />

    <!-- Footer -->
    <div class="flex justify-end gap-2 px-5 pb-5 pt-2">
      <AppButton
        v-if="dialog?.type === 'confirm'"
        variant="subtle"
        size="sm"
        label="Cancel"
        @click="cancel"
      />
      <AppButton
        v-bind="confirmStyle"
        size="sm"
        :label="dialog?.confirmLabel"
        @click="ok"
      />
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
import { computed } from "vue";
import { IconInfo, IconWarning } from '@/lib/icons';
import { useConfirm } from "@/composables/useConfirm";
import AppButton from "@/components/common/AppButton.vue";
import AppModal from "@/components/common/AppModal.vue";
import ModalHeader from "@/components/common/ModalHeader.vue";
import type { ButtonVariants } from "@/components/common/appButtonVariants";

const { dialog, _resolve } = useConfirm();

/**
 * The two solid CTAs the app has, chosen per dialog: red when the answer deletes
 * something, the theme's gold otherwise.
 *
 * Bound as an object rather than three conditional props because the branches do
 * not line up — `primary` is gold *by definition* and ignores `tone`, so writing
 * `:variant`, `:tone` and `:emphasis` separately means a `tone="danger"` sitting
 * on every harmless confirm in the app, doing nothing and claiming otherwise.
 *
 * This was a hand-rolled `<button>` until #752, on the correct observation that
 * `tinted`+`danger`+`solid` painted a lighter red than the `--destructive` it
 * used. That is fixed at the token now — the two reds are one — so the primitive
 * renders exactly what this drew before.
 */
const confirmStyle = computed<Pick<ButtonVariants, "variant" | "tone" | "emphasis">>(() =>
  dialog.value?.danger
    ? { variant: "tinted", tone: "danger", emphasis: "solid" }
    : { variant: "primary" },
);

function ok() {
  _resolve(true);
}
function cancel() {
  _resolve(false);
}
</script>

