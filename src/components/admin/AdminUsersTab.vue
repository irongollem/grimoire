<template>
  <div class="space-y-4">
    <input
      v-model="userSearch"
      type="search"
      placeholder="Search by email or name…"
      class="w-full bg-muted border border-border rounded-md px-3 py-2 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
    />

    <div v-if="usersQuery.isPending.value" class="text-muted-foreground font-fell text-sm">
      Loading users…
    </div>
    <div v-else-if="usersQuery.isError.value" class="text-destructive font-fell text-sm">
      Failed to load users.
    </div>
    <div v-else class="space-y-2">
      <div
        v-for="user in filteredUsers"
        :key="user.user_id"
        class="rounded-lg border border-border bg-card px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3"
      >
        <div class="flex-1 min-w-0">
          <p class="font-fell text-sm text-foreground truncate">{{ user.email }}</p>
          <p class="font-fell text-xs text-muted-foreground">
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
          <span class="font-fell text-xs text-muted-foreground">{{ user.ai_credits }} cr</span>
          <div class="flex gap-1">
            <button
              v-for="pid in PLAN_IDS"
              :key="pid"
              class="px-2 py-0.5 text-label font-semibold border rounded transition-colors"
              :class="
                user.plan_id === pid
                  ? 'border-primary/40 text-primary bg-primary/10 cursor-default'
                  : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/40'
              "
              :disabled="user.plan_id === pid || usersQuery.setPlan.isPending.value"
              @click="user.plan_id !== pid && usersQuery.setPlan.mutate({ userId: user.user_id, planId: pid })"
            >
              {{ pid }}
            </button>
          </div>

          <!-- Soft freeze (paid actions) -->
          <button
            class="px-2 py-0.5 text-label font-semibold border rounded transition-colors"
            :class="user.suspended_at
              ? 'border-amber-500/40 text-amber-400 hover:bg-amber-500/10'
              : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/40'"
            :disabled="usersQuery.setSuspended.isPending.value"
            @click="toggleFreeze(user)"
          >
            {{ user.suspended_at ? 'Unfreeze' : 'Freeze' }}
          </button>

          <!-- Hard lock-out (login ban) -->
          <button
            class="px-2 py-0.5 text-label font-semibold border rounded transition-colors"
            :class="user.banned
              ? 'border-elven-green/40 text-elven-green hover:bg-elven-green/10'
              : 'border-destructive/40 text-destructive hover:bg-destructive/10'"
            :disabled="usersQuery.setBanned.isPending.value"
            @click="toggleBan(user)"
          >
            {{ user.banned ? 'Unlock' : 'Lock out' }}
          </button>
        </div>
      </div>
      <p v-if="filteredUsers.length === 0" class="font-fell text-sm text-muted-foreground text-center py-8">
        No users match your search.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useAdminUsers, type AdminUser } from "@/composables/useAdminUsers";
import { useConfirm } from "@/composables/useConfirm";
import type { PlanId } from "@/types/subscription.types";

const usersQuery = useAdminUsers();
const { confirm } = useConfirm();

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
