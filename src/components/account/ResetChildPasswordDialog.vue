<template>
  <AppModal :open="open" size="sm" @close="close">
    <ModalHeader
      title="Reset password"
      :subtitle="`A new sign-in password for ${child.displayName}`"
      :icon="IconKey"
      closeable
      @close="close"
    />
    <form class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-4" @submit.prevent="submit">
      <div class="space-y-1.5">
        <label class="text-body text-foreground" for="reset-child-password">New password</label>
        <AppInput
          id="reset-child-password"
          v-model="password"
          type="password"
          tone="default"
          size="body"
          autocomplete="new-password"
          placeholder="At least 8 characters"
        />
      </div>
      <div class="space-y-1.5">
        <label class="text-body text-foreground" for="reset-child-password-confirm">Confirm password</label>
        <AppInput
          id="reset-child-password-confirm"
          v-model="confirmPassword"
          type="password"
          tone="default"
          size="body"
          autocomplete="new-password"
        />
      </div>
      <p v-if="error" class="text-caption text-destructive">{{ error }}</p>

      <div class="flex justify-end gap-3 pt-2">
        <AppButton variant="subtle" size="md" type="button" label="Cancel" @click="close" />
        <AppButton
          type="submit"
          variant="primary"
          size="md"
          :loading="resetPassword.isPending.value"
          :disabled="!canSubmit"
          label="Reset password"
        />
      </div>
    </form>
  </AppModal>
</template>

<script setup lang="ts">
/** The small dialog "Reset password" opens from a child's card (#919). */
import { computed, ref, watch } from "vue";
import AppModal from "@/components/common/AppModal.vue";
import ModalHeader from "@/components/common/ModalHeader.vue";
import AppInput from "@/components/common/AppInput.vue";
import AppButton from "@/components/common/AppButton.vue";
import { useToast } from "@/composables/useToast";
import { IconKey } from "@/lib/icons";
import {
  childAccountErrorMessage,
  useResetChildPassword,
  type FamilyChild,
} from "@/composables/account/useFamily";

const open = defineModel<boolean>({ required: true });
const { child } = defineProps<{ child: FamilyChild }>();

const password = ref("");
const confirmPassword = ref("");
const error = ref<string | null>(null);
const resetPassword = useResetChildPassword();
const { success } = useToast();

const canSubmit = computed(
  () => password.value.length >= 8 && password.value === confirmPassword.value,
);

watch(open, (isOpen) => {
  if (!isOpen) return;
  password.value = "";
  confirmPassword.value = "";
  error.value = null;
});

function close() {
  open.value = false;
}

async function submit() {
  if (!canSubmit.value) return;
  error.value = null;
  try {
    await resetPassword.mutateAsync({ childUserId: child.child_user_id, password: password.value });
    success(`Password reset for ${child.displayName}.`);
    close();
  } catch (err) {
    error.value = childAccountErrorMessage(err instanceof Error ? err.message : String(err));
  }
}
</script>
