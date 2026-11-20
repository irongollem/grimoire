<template>
  <!-- A closed AI table is opened again by an admin with a reason (#1021, `admin_reopen_table`): the refusals that
       closed it stop counting from now on. Shown for every account, since an admin may reopen before anyone is shut out. -->
  <div class="flex items-center gap-1" data-testid="admin-table-reopen">
    <AppButton
      v-if="!asking"
      size="xs"
      variant="subtle"
      label="Reopen AI table"
      tooltip="Clear the refused-message strikes that closed this account's AI table. Asks for a reason, which is logged."
      @click="asking = true"
    />
    <form v-else class="flex items-center gap-1" @submit.prevent="submit">
      <AppInput v-model="reason" size="xs" placeholder="Why reopen it?" aria-label="Reason for reopening the AI table" class="w-48" />
      <AppButton type="submit" size="xs" variant="subtle" label="Reopen" :disabled="reopen.isPending.value" />
      <AppButton size="xs" variant="subtle" label="Cancel" @click="cancel" />
    </form>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import { useReopenTable } from "@/composables/admin/useAdminUsers";
import { useToast } from "@/composables/useToast";

const { userId } = defineProps<{ userId: string }>();

const reopen = useReopenTable();
const toast = useToast();
const asking = ref(false);
const reason = ref("");

function cancel(): void {
  asking.value = false;
  reason.value = "";
}

async function submit(): Promise<void> {
  if (reason.value.trim() === "") {
    toast.error("Say why the table is being reopened.");
    return;
  }
  try {
    await reopen.mutateAsync({ userId, reason: reason.value });
    toast.success("AI table reopened.");
    cancel();
  } catch (error) {
    toast.error(toast.fromError(error, "The table could not be reopened."));
  }
}
</script>
