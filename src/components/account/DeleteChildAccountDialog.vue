<template>
  <AppModal :open="open" size="sm" role="alertdialog" @close="close">
    <ModalHeader
      title="Delete account"
      :subtitle="`Permanently delete ${child.displayName}'s account`"
      :icon="IconDelete"
      tone="danger"
      closeable
      @close="close"
    />
    <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-4">
      <p class="text-body text-muted-foreground">
        This also withdraws your consent for this account and permanently deletes their
        characters, notes and everything else they created. There is no undo.
      </p>
      <ConfirmByNameInput v-model="typedName" :name="child.displayName" :disabled="deleting" />
      <p v-if="error" class="text-caption text-destructive">{{ error }}</p>
    </div>
    <div class="flex shrink-0 justify-end gap-3 px-5 pb-5">
      <AppButton variant="subtle" size="md" label="Cancel" :disabled="deleting" @click="close" />
      <AppButton
        variant="destructive"
        size="md"
        :loading="deleting"
        :disabled="typedName !== child.displayName"
        label="Delete account"
        @click="submit"
      />
    </div>
  </AppModal>
</template>

<script setup lang="ts">
/** The typed-name delete confirmation opened from a child's card (#919). */
import { ref, watch } from "vue";
import AppModal from "@/components/common/overlays/AppModal.vue";
import ModalHeader from "@/components/common/overlays/ModalHeader.vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import ConfirmByNameInput from "@/components/common/controls/ConfirmByNameInput.vue";
import { useToast } from "@/composables/useToast";
import { IconDelete } from "@/lib/icons";
import { useAccountDeletion } from "@/composables/account/useAccountDeletion";
import { useFamily, type FamilyChild } from "@/composables/account/useFamily";

const open = defineModel<boolean>({ required: true });
const { child } = defineProps<{ child: FamilyChild }>();

const typedName = ref("");
// `useAccountDeletion`'s own `error` ref already carries human copy for the
// codes this action can return (including the child-specific `not_your_child`
// and `has_child_accounts`) — reused rather than re-mapped here.
const { deleting, error, deleteAccount } = useAccountDeletion();
const { invalidate } = useFamily();
const { success } = useToast();

watch(open, (isOpen) => {
  if (!isOpen) return;
  typedName.value = "";
  error.value = null;
});

function close() {
  if (deleting.value) return;
  open.value = false;
}

async function submit() {
  if (typedName.value !== child.displayName) return;
  const ok = await deleteAccount(child.child_user_id);
  if (!ok) return;
  await invalidate();
  success(`${child.displayName}'s account was deleted.`);
  open.value = false;
}
</script>
