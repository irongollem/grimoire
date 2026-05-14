<template>
  <div class="space-y-6">
    <!-- Grant form -->
    <div class="rounded-lg border border-border bg-card p-4 space-y-4">
      <h2 class="font-cinzel text-sm font-semibold tracking-wide text-foreground">Grant Credits</h2>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div class="space-y-1">
          <label class="block font-cinzel text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">User</label>
          <select
            v-model="grantUserId"
            class="w-full bg-muted border border-border rounded px-2.5 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">— select —</option>
            <option
              v-for="user in usersQuery.data.value ?? []"
              :key="user.user_id"
              :value="user.user_id"
            >
              {{ user.email }}
            </option>
          </select>
        </div>
        <div class="space-y-1">
          <label class="block font-cinzel text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Amount</label>
          <input
            v-model.number="grantAmount"
            type="number"
            min="1"
            class="w-full bg-muted border border-border rounded px-2.5 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder="e.g. 10"
          />
        </div>
        <div class="space-y-1">
          <label class="block font-cinzel text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Reason</label>
          <input
            v-model="grantReason"
            type="text"
            class="w-full bg-muted border border-border rounded px-2.5 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder="admin_grant"
          />
        </div>
      </div>
      <div class="flex items-center gap-3">
        <button
          class="px-4 py-1.5 font-cinzel text-xs font-semibold tracking-wider bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
          :disabled="!grantUserId || !grantAmount || usersQuery.grantCredits.isPending.value"
          @click="doGrantCredits"
        >
          {{ usersQuery.grantCredits.isPending.value ? 'Granting…' : 'Grant Credits' }}
        </button>
        <p v-if="grantSuccess" class="font-fell text-xs text-green-500">Granted successfully.</p>
      </div>
    </div>

    <!-- User balances -->
    <div v-if="usersQuery.isPending.value" class="text-muted-foreground font-fell text-sm">
      Loading…
    </div>
    <div v-else class="space-y-2">
      <div
        v-for="user in usersQuery.data.value ?? []"
        :key="user.user_id"
        class="rounded-lg border border-border bg-card px-4 py-3 flex items-center gap-3"
      >
        <div class="flex-1 min-w-0">
          <p class="font-fell text-sm text-foreground truncate">{{ user.email }}</p>
          <p class="font-fell text-xs text-muted-foreground">{{ user.display_name ?? '—' }}</p>
        </div>
        <span
          class="font-cinzel text-xs font-semibold tracking-wide shrink-0"
          :class="user.ai_credits > 0 ? 'text-amber-400' : 'text-muted-foreground'"
        >
          {{ user.ai_credits }} credits
        </span>
      </div>
    </div>

    <!-- AI Usage Stats -->
    <div class="rounded-lg border border-border bg-card p-4 space-y-3">
      <h2 class="font-cinzel text-sm font-semibold tracking-wide text-foreground">AI Usage Stats</h2>

      <div v-if="usageStats.isPending.value" class="text-center py-4">
        <div class="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin mx-auto" />
      </div>

      <template v-else>
        <div class="grid grid-cols-3 gap-2">
          <div class="rounded-md bg-muted/30 border border-border px-3 py-2 text-center">
            <p class="font-cinzel text-base font-bold text-foreground">{{ usageStats.totalGenerations.value }}</p>
            <p class="font-fell text-[11px] text-muted-foreground italic">Total gens</p>
          </div>
          <div class="rounded-md bg-muted/30 border border-border px-3 py-2 text-center">
            <p class="font-cinzel text-base font-bold text-foreground">${{ usageStats.totalEstimatedCostUsd.value.toFixed(2) }}</p>
            <p class="font-fell text-[11px] text-muted-foreground italic">Est. cost (USD)</p>
          </div>
          <div class="rounded-md bg-muted/30 border border-border px-3 py-2 text-center">
            <p class="font-cinzel text-base font-bold text-foreground">{{ usageStats.byokCount.value }}</p>
            <p class="font-fell text-[11px] text-muted-foreground italic">BYOK gens</p>
          </div>
        </div>

        <div v-if="usageStats.modelStats.value.length" class="space-y-1">
          <div
            v-for="stat in usageStats.modelStats.value"
            :key="stat.model"
            class="flex items-center gap-2 rounded-md bg-muted/20 px-2.5 py-1.5"
          >
            <div class="flex-1 min-w-0">
              <span class="font-cinzel text-xs font-semibold text-foreground">{{ stat.model }}</span>
              <span class="font-fell text-[11px] text-muted-foreground italic ml-1">· {{ stat.provider }}</span>
            </div>
            <span class="font-fell text-xs text-muted-foreground shrink-0">{{ stat.count }}×</span>
            <span class="font-cinzel text-xs text-foreground shrink-0 w-16 text-right">
              ${{ stat.estimated_cost_usd.toFixed(3) }}
            </span>
          </div>
        </div>

        <p v-else class="font-fell text-xs text-muted-foreground italic">
          No generation data yet.
        </p>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useAdminUsers } from "@/composables/useAdminUsers";
import { useAiUsageStats } from "@/composables/useAiUsageStats";

const usersQuery = useAdminUsers();
const usageStats = useAiUsageStats();

const grantUserId = ref("");
const grantAmount = ref<number | null>(null);
const grantReason = ref("admin_grant");
const grantSuccess = ref(false);

async function doGrantCredits() {
  if (!grantUserId.value || !grantAmount.value) return;
  await usersQuery.grantCredits.mutateAsync({
    userId: grantUserId.value,
    amount: grantAmount.value,
    reason: grantReason.value || "admin_grant",
  });
  grantSuccess.value = true;
  grantAmount.value = null;
  setTimeout(() => (grantSuccess.value = false), 3000);
}
</script>
