<template>
  <div class="space-y-4">
    <AppInput
      v-model="userSearch"
      type="search"
      size="body"
      tone="muted"
      placeholder="Search by email or name…"
    />

    <div v-if="usersQuery.isPending.value" class="text-muted-foreground text-body">
      Loading users…
    </div>
    <div v-else-if="usersQuery.isError.value" class="text-destructive text-body">
      Failed to load users.
    </div>
    <div v-else class="space-y-2">
      <p v-if="deleteError" class="text-caption-sm text-destructive">{{ deleteError }}</p>
      <div
        v-for="user in filteredUsers"
        :key="user.user_id"
        class="rounded-lg border border-border bg-card px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3"
      >
        <div class="flex-1 min-w-0">
          <p class="text-body text-foreground truncate">{{ user.email }}</p>
          <p class="text-caption text-muted-foreground">
            {{ user.display_name ?? '—' }}
            <span class="mx-1 opacity-40">·</span>
            Joined {{ formatDate(user.created_at) }}
          </p>
        </div>
        <div class="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          <span v-if="user.banned" class="text-label font-semibold px-2 py-0.5 rounded border border-destructive/50 text-destructive">
            Locked
          </span>
          <span v-else-if="user.suspended_at" class="text-label font-semibold px-2 py-0.5 rounded border border-amber-500/50 text-amber-400">
            Frozen
          </span>
          <span class="text-label font-semibold px-2 py-0.5 rounded border"
            :class="planBadgeClass(user.plan_id)">
            {{ user.plan_id }}
          </span>
          <span class="text-caption text-muted-foreground">{{ user.ai_credits }} cr</span>
          <div class="flex gap-1">
            <!-- The current plan is the `active` one; AppButton blocks the click
                 while disabled, so the guard the raw handler carried is gone. -->
            <AppButton
              v-for="pid in PLAN_IDS"
              :key="pid"
              variant="subtle"
              size="xs"
              :active="user.plan_id === pid"
              :label="pid"
              :disabled="user.plan_id === pid || usersQuery.setPlan.isPending.value"
              @click="usersQuery.setPlan.mutate({ userId: user.user_id, planId: pid })"
            />
          </div>

          <!-- Soft freeze (paid actions) -->
          <AppButton
            size="xs"
            :variant="user.suspended_at ? 'tinted' : 'subtle'"
            :tone="user.suspended_at ? 'caution' : undefined"
            :emphasis="user.suspended_at ? 'outline' : undefined"
            :label="user.suspended_at ? 'Unfreeze' : 'Freeze'"
            :disabled="usersQuery.setSuspended.isPending.value"
            @click="toggleFreeze(user)"
          />

          <!-- Hard lock-out (login ban) -->
          <AppButton
            size="xs"
            :variant="user.banned ? 'tinted' : 'destructive'"
            :tone="user.banned ? 'success' : undefined"
            :emphasis="user.banned ? 'outline' : undefined"
            :label="user.banned ? 'Unlock' : 'Lock out'"
            :disabled="usersQuery.setBanned.isPending.value"
            @click="toggleBan(user)"
          />

          <!-- Permanent erasure (#631) -->
          <AppButton
            size="xs"
            variant="tinted"
            tone="danger"
            emphasis="soft"
            label="Delete"
            :disabled="usersQuery.deleteUser.isPending.value"
            @click="deleteUserAccount(user)"
          />
        </div>
      </div>
      <p v-if="filteredUsers.length === 0" class="text-body text-muted-foreground text-center py-8">
        No users match your search.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useAdminUsers, type AdminUser } from "@/composables/useAdminUsers";
import { accountDeletionErrorMessage } from "@/composables/useAccountDeletion";
import { useConfirm } from "@/composables/useConfirm";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import type { PlanId } from "@/types/subscription.types";

const usersQuery = useAdminUsers();
const { confirm } = useConfirm();
const deleteError = ref("");

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
    `Permanently delete ${user.email}? This deletes their auth account immediately: campaigns they own — and everything in them — are erased, and content they created in other campaigns is removed. Billing ledger rows are kept, anonymized, as legally required. This cannot be undone.`,
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

const PLAN_IDS: PlanId[] = ["free", "tester", "pro"];
const userSearch = ref("");

const filteredUsers = computed(() => {
  const q = userSearch.value.trim().toLowerCase();
  if (!q) return usersQuery.data.value ?? [];
  return (usersQuery.data.value ?? []).filter(
    (u) => u.email.toLowerCase().includes(q) || (u.display_name ?? "").toLowerCase().includes(q),
  );
});

function planBadgeClass(planId: string) {
  if (planId === "pro") return "border-amber-400/40 text-amber-400";
  if (planId === "tester") return "border-blue-400/40 text-blue-400";
  return "border-border text-muted-foreground";
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
</script>
