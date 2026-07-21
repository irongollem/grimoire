<template>
  <div class="space-y-6">
    <!-- ── Your AI usage — moved to top ─────────────────────────────────────── -->
    <AiUsageStatsPanel />

    <!-- ── Anti-abuse velocity guard config ─────────────────────────────────── -->
    <AbuseGuardConfig />

    <!-- ── User lookup ──────────────────────────────────────────────────────── -->
    <div class="rounded-lg border border-border bg-card p-4 space-y-4">
      <div>
        <h2 class="font-cinzel text-sm font-semibold tracking-wide text-foreground">User Lookup</h2>
        <p class="text-caption text-muted-foreground italic mt-0.5">
          Search a user to see their name, credit balance, and ledger. Other users stay hidden.
        </p>
      </div>

      <div class="flex items-stretch gap-2">
        <EntityCombobox
          v-model="selectedUserId"
          :options="userOptions"
          placeholder="Search by email or name…"
        >
          <template #option="{ opt }">
            <span class="flex-1 min-w-0">
              <span class="text-body text-foreground">{{ opt.email }}</span>
              <span v-if="opt.display_name" class="font-fell text-[0.6875rem] text-muted-foreground italic ml-1">· {{ opt.display_name }}</span>
            </span>
          </template>
        </EntityCombobox>
      </div>

      <p v-if="usersQuery.isPending.value" class="text-body text-muted-foreground">Loading users…</p>

      <!-- Selected user detail -->
      <div v-else-if="selectedUser" class="space-y-4 border-t border-border pt-4">
        <!-- Name + balance -->
        <div class="flex items-center gap-3">
          <div class="flex-1 min-w-0">
            <p class="text-body text-foreground truncate">{{ selectedUser.email }}</p>
            <p class="text-caption text-muted-foreground">
              {{ selectedUser.display_name ?? '—' }} · {{ selectedUser.plan_id }}
            </p>
          </div>
          <span
            class="font-cinzel text-sm font-bold tracking-wide shrink-0"
            :class="ledger.balance.value > 0 ? 'text-amber-400' : 'text-muted-foreground'"
          >
            {{ ledger.balance.value }} credits
          </span>
        </div>

        <!-- Grant (scoped to the selected user) -->
        <div class="flex flex-wrap items-end gap-2">
          <div class="space-y-1">
            <label class="block text-eyebrow font-semibold text-muted-foreground">Grant amount</label>
            <input
              v-model.number="grantAmount"
              type="number"
              min="1"
              class="w-28 bg-muted border border-border rounded px-2.5 py-1.5 text-body text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="e.g. 10"
            />
          </div>
          <div class="space-y-1 flex-1 min-w-32">
            <label class="block text-eyebrow font-semibold text-muted-foreground">Reason</label>
            <input
              v-model="grantReason"
              type="text"
              class="w-full bg-muted border border-border rounded px-2.5 py-1.5 text-body text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="admin_grant"
            />
          </div>
          <button
            class="px-4 py-1.5 text-label-lg font-semibold bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
            :disabled="!grantAmount || usersQuery.grantCredits.isPending.value"
            @click="doGrantCredits"
          >
            {{ usersQuery.grantCredits.isPending.value ? 'Granting…' : 'Grant' }}
          </button>
          <p v-if="grantSuccess" class="text-caption text-green-500 self-center">Granted.</p>
        </div>

        <!-- Ledger summary -->
        <div class="grid grid-cols-3 gap-2">
          <div class="rounded-md bg-muted/30 border border-border px-3 py-2 text-center">
            <p class="font-cinzel text-sm font-bold text-foreground">{{ ledger.generationCount.value }}</p>
            <p class="font-fell text-[0.6875rem] text-muted-foreground italic">Generations</p>
          </div>
          <div class="rounded-md bg-muted/30 border border-border px-3 py-2 text-center">
            <p class="font-cinzel text-sm font-bold text-foreground">${{ ledger.estimatedCostUsd.value.toFixed(2) }}</p>
            <p class="font-fell text-[0.6875rem] text-muted-foreground italic">Est. cost (USD)</p>
          </div>
          <div class="rounded-md bg-muted/30 border border-border px-3 py-2 text-center">
            <p class="font-cinzel text-sm font-bold text-foreground">+{{ ledger.granted.value }} / −{{ ledger.spent.value }}</p>
            <p class="font-fell text-[0.6875rem] text-muted-foreground italic">Granted / Spent</p>
          </div>
        </div>

        <!-- Ledger rows -->
        <div v-if="ledger.isPending.value" class="text-center py-3">
          <div class="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin mx-auto" />
        </div>
        <div v-else-if="ledger.rows.value.length" class="space-y-1">
          <div class="flex items-center gap-2 px-2.5 pb-0.5">
            <span class="text-eyebrow text-muted-foreground shrink-0 w-28">When</span>
            <span class="flex-1 text-eyebrow text-muted-foreground">Reason / model</span>
            <span class="text-eyebrow text-muted-foreground shrink-0 w-16 text-right">Δ</span>
            <span class="text-eyebrow text-muted-foreground shrink-0 w-16 text-right">Bal</span>
          </div>
          <div
            v-for="row in ledger.rows.value"
            :key="row.id"
            class="flex items-center gap-2 rounded-md bg-muted/20 px-2.5 py-1.5"
          >
            <span class="font-fell text-[0.6875rem] text-muted-foreground shrink-0 w-28">{{ formatWhen(row.created_at) }}</span>
            <div class="flex-1 min-w-0">
              <span class="font-cinzel text-xs font-semibold text-foreground">{{ row.reason }}</span>
              <span v-if="row.model" class="font-fell text-[0.6875rem] text-muted-foreground italic ml-1">
                · {{ row.model }}<template v-if="row.is_byok"> · BYOK</template>
              </span>
            </div>
            <span
              class="font-cinzel text-xs shrink-0 w-16 text-right"
              :class="row.delta > 0 ? 'text-green-500' : row.delta < 0 ? 'text-destructive' : 'text-muted-foreground'"
            >
              {{ row.delta > 0 ? '+' : '' }}{{ row.delta }}
            </span>
            <span class="font-cinzel text-xs text-foreground shrink-0 w-16 text-right">{{ row.running_balance }}</span>
          </div>
        </div>
        <p v-else class="text-caption text-muted-foreground italic">No ledger activity yet.</p>

        <!-- Per-pack refund eligibility + execution -->
        <CreditPackRefundList :user-id="selectedUserId" />
      </div>

      <p v-else class="text-caption text-muted-foreground italic">No user selected.</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useAdminUsers } from "@/composables/useAdminUsers";
import { useUserLedger } from "@/composables/useUserLedger";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import AiUsageStatsPanel from "@/components/common/AiUsageStatsPanel.vue";
import CreditPackRefundList from "@/components/admin/CreditPackRefundList.vue";
import AbuseGuardConfig from "@/components/admin/AbuseGuardConfig.vue";

const usersQuery = useAdminUsers();

const selectedUserId = ref("");
const ledger = useUserLedger(selectedUserId);

// EntityCombobox filters on `name`, so fold email + display name into it for search.
const userOptions = computed(() =>
  (usersQuery.data.value ?? []).map((u) => ({
    id: u.user_id,
    name: `${u.email}${u.display_name ? ` ${u.display_name}` : ""}`,
    email: u.email,
    display_name: u.display_name,
  })),
);

const selectedUser = computed(() =>
  selectedUserId.value
    ? (usersQuery.data.value ?? []).find((u) => u.user_id === selectedUserId.value) ?? null
    : null,
);

const grantAmount = ref<number | null>(null);
const grantReason = ref("admin_grant");
const grantSuccess = ref(false);

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

async function doGrantCredits() {
  if (!selectedUserId.value || !grantAmount.value) return;
  await usersQuery.grantCredits.mutateAsync({
    userId: selectedUserId.value,
    amount: grantAmount.value,
    reason: grantReason.value || "admin_grant",
  });
  grantSuccess.value = true;
  grantAmount.value = null;
  await ledger.refetch();
  setTimeout(() => (grantSuccess.value = false), 3000);
}
</script>
