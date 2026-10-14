<template>
  <div class="space-y-4">
    <AccountRetentionPanel :users="allUsers" />

    <div class="space-y-3">
      <div class="flex flex-wrap gap-2">
        <AppButton
          size="sm"
          variant="subtle"
          :active="ui.adminUsersSegment === 'all'"
          :label="`All ${allUsers.length}`"
          @click="ui.adminUsersSegment = 'all'"
        />
        <AppButton
          v-for="seg in SEGMENT_ORDER"
          :key="seg"
          size="sm"
          variant="subtle"
          :active="ui.adminUsersSegment === seg"
          :label="`${SEGMENT_INFO[seg].label} ${counts[seg]}`"
          :title="SEGMENT_INFO[seg].description"
          @click="ui.adminUsersSegment = seg"
        />
      </div>

      <AppInput
        v-model="ui.adminUsersSearch"
        type="search"
        size="body"
        tone="muted"
        placeholder="Search by email or name…"
      />
      <div class="flex flex-wrap gap-2 items-center">
        <SegmentedControl v-model="ui.adminUsersRetention" :options="RETENTION_OPTIONS" size="sm" wrap />
        <AppButton
          v-if="ui.adminUsersHasActiveFilters"
          variant="subtle"
          size="sm"
          label="Clear"
          @click="ui.resetAdminUsersFilters()"
        />
      </div>
    </div>

    <OutreachTemplateEditor v-model="template" @save="saveOutreachTemplate" @reset="template = resetOutreachTemplate()" />

    <ListSkeleton v-if="usersQuery.isPending.value" variant="rows" :count="6" />
    <div v-else-if="usersQuery.isError.value" class="text-destructive text-body">
      Failed to load users.
    </div>
    <div v-else class="space-y-2">
      <p v-if="deleteError" class="text-caption-sm text-destructive">{{ deleteError }}</p>
      <AdminUserRow
        v-for="user in filteredUsers"
        :key="user.user_id"
        :user="user"
        :template="template"
        :now="now"
        :busy="busy"
        @set-plan="(u, planId) => usersQuery.setPlan.mutate({ userId: u.user_id, planId })"
        @toggle-freeze="toggleFreeze"
        @toggle-ban="toggleBan"
        @delete="deleteUserAccount"
      />
      <p v-if="filteredUsers.length === 0" class="text-body text-muted-foreground text-center py-8">
        No users match your filters.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useAdminUsers, type AdminUser } from "@/composables/admin/useAdminUsers";
import { accountDeletionErrorMessage } from "@/composables/account/useAccountDeletion";
import { useConfirm } from "@/composables/useConfirm";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import SegmentedControl from "@/components/common/controls/SegmentedControl.vue";
import ListSkeleton from "@/components/common/feedback/ListSkeleton.vue";
import AccountRetentionPanel from "@/components/admin/AccountRetentionPanel.vue";
import AdminUserRow from "@/components/admin/AdminUserRow.vue";
import OutreachTemplateEditor from "@/components/admin/OutreachTemplateEditor.vue";
import { useAdminUiStore } from "@/stores/ui/admin";
import { accountSegment, countBySegment, SEGMENT_INFO, SEGMENT_ORDER } from "@/lib/admin/accountSegments";
import {
  loadOutreachTemplate,
  resetOutreachTemplate,
  saveOutreachTemplate,
} from "@/lib/admin/outreachEmail";

const usersQuery = useAdminUsers();
const ui = useAdminUiStore();
const { confirm } = useConfirm();
const deleteError = ref("");
const template = ref(loadOutreachTemplate());
const now = new Date();

const RETENTION_OPTIONS = [
  { value: "all", label: "Any status" },
  { value: "notice_due", label: "Notice due" },
  { value: "notice_sent", label: "Notice sent" },
  { value: "deletable", label: "Ready to delete" },
] as const;

const allUsers = computed(() => usersQuery.data.value ?? []);
const counts = computed(() => countBySegment(allUsers.value, now));

const busy = computed(() => ({
  plan: usersQuery.setPlan.isPending.value,
  freeze: usersQuery.setSuspended.isPending.value,
  ban: usersQuery.setBanned.isPending.value,
  delete: usersQuery.deleteUser.isPending.value,
}));

const filteredUsers = computed(() => {
  const q = ui.adminUsersSearch.trim().toLowerCase();
  return allUsers.value.filter((u) => {
    if (ui.adminUsersSegment !== "all" && accountSegment(u, now) !== ui.adminUsersSegment) return false;
    if (ui.adminUsersRetention !== "all" && u.retention_state !== ui.adminUsersRetention) return false;
    if (!q) return true;
    return u.email.toLowerCase().includes(q) || (u.display_name ?? "").toLowerCase().includes(q);
  });
});

async function toggleFreeze(user: AdminUser) {
  const suspend = !user.suspended_at;
  // Unfreezing is restorative — no confirm needed.
  if (suspend) {
    const ok = await confirm(
      `Freeze ${user.email}? Paid actions (AI generation, purchases) will be blocked; they can still sign in.`,
      { title: "Freeze account", confirmLabel: "Freeze", danger: true },
    );
    if (!ok) return;
  }
  usersQuery.setSuspended.mutate({
    userId: user.user_id,
    suspended: suspend,
    reason: suspend ? "manual (admin)" : undefined,
  });
}

async function toggleBan(user: AdminUser) {
  const ban = !user.banned;
  const ok = await confirm(
    ban
      ? `Lock out ${user.email}? They will be signed out and unable to log in.`
      : `Unlock ${user.email}? They will be able to log in again.`,
    { title: ban ? "Lock out account" : "Unlock account", confirmLabel: ban ? "Lock out" : "Unlock", danger: ban },
  );
  if (!ok) return;
  usersQuery.setBanned.mutate({ userId: user.user_id, banned: ban });
}

async function deleteUserAccount(user: AdminUser) {
  const ok = await confirm(
    `Permanently delete ${user.email}? This deletes their auth account immediately: campaigns they own, and everything in them, are erased, and content they created in other campaigns is removed. Billing ledger rows are kept, anonymized, as legally required. This cannot be undone.`,
    { title: "Delete account", confirmLabel: "Delete permanently", danger: true },
  );
  if (!ok) return;
  deleteError.value = "";
  try {
    await usersQuery.deleteUser.mutateAsync(user.user_id);
  } catch (err) {
    const code = err instanceof Error ? err.message : String(err);
    deleteError.value = accountDeletionErrorMessage(code);
  }
}
</script>
