<template>
  <div class="flex flex-col h-full min-h-0 overflow-hidden">
    <!-- Header -->
    <div class="px-4 pt-4 pb-3 md:px-6 md:pt-6 shrink-0">
      <h1 class="font-cinzel text-xl md:text-3xl font-bold text-foreground tracking-wide">
        Admin Panel
      </h1>
      <p class="font-fell text-sm md:text-base text-muted-foreground italic mt-0.5">
        Plans, subscriptions &amp; credit management
      </p>
      <div class="gold-divider mt-3" />
    </div>

    <!-- Tabs bar -->
    <div class="px-4 md:px-6 shrink-0 flex gap-1 border-b border-border overflow-x-auto">
      <button
        v-for="tab in TABS"
        :key="tab.id"
        class="flex items-center gap-1.5 px-4 py-2.5 font-cinzel text-xs font-semibold tracking-wider border-b-2 -mb-px transition-colors shrink-0"
        :class="
          activeTab === tab.id
            ? 'border-primary text-primary'
            : 'border-transparent text-muted-foreground hover:text-foreground'
        "
        @click="setTab(tab.id)"
      >
        <component :is="tab.icon" class="h-3.5 w-3.5" />
        {{ tab.label }}
      </button>
    </div>

    <!-- Tab body -->
    <div class="flex-1 min-h-0 overflow-y-auto px-4 md:px-6 py-5 space-y-6">

      <!-- ── Plans tab ─────────────────────────────────────────────────── -->
      <template v-if="activeTab === 'plans'">
        <div v-if="plansQuery.isPending.value" class="text-muted-foreground font-fell text-sm">
          Loading plans…
        </div>
        <div v-else-if="plansQuery.isError.value" class="text-destructive font-fell text-sm">
          Failed to load plans.
        </div>
        <template v-else>
          <div
            v-for="plan in plansQuery.data.value"
            :key="plan.id"
            class="rounded-lg border border-border bg-card p-4 space-y-4"
          >
            <div class="flex items-center justify-between">
              <div>
                <h2 class="font-cinzel text-sm font-semibold tracking-wide text-foreground capitalize">
                  {{ plan.name }}
                </h2>
                <span class="font-cinzel text-[10px] tracking-widest text-muted-foreground uppercase">
                  {{ plan.id }}
                </span>
              </div>
              <span
                v-if="plan.id !== 'free'"
                class="font-cinzel text-xs font-semibold tracking-wider text-amber-400 border border-amber-400/40 px-2 py-0.5 rounded"
              >
                Unlimited
              </span>
              <button
                v-else
                class="px-3 py-1.5 font-cinzel text-xs font-semibold tracking-wider bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
                :disabled="planSaving[plan.id]"
                @click="savePlanQuotas(plan)"
              >
                {{ planSaving[plan.id] ? 'Saving…' : 'Save' }}
              </button>
            </div>

            <!-- Free plan: editable quota inputs -->
            <div v-if="plan.id === 'free'" class="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div v-for="resource in QUOTA_RESOURCES" :key="resource" class="space-y-1">
                <label class="block font-cinzel text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                  {{ LABELS[resource] }}
                </label>
                <input
                  v-model.number="draftQuotas[plan.id][resource]"
                  type="number"
                  min="0"
                  class="w-full bg-muted border border-border rounded px-2.5 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            </div>

            <!-- Tester / Pro: read-only ∞ grid -->
            <div v-else class="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div v-for="resource in QUOTA_RESOURCES" :key="resource" class="space-y-1">
                <p class="font-cinzel text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                  {{ LABELS[resource] }}
                </p>
                <p class="font-fell text-sm text-foreground">∞</p>
              </div>
            </div>
          </div>
        </template>
      </template>

      <!-- ── Users tab ─────────────────────────────────────────────────── -->
      <template v-else-if="activeTab === 'users'">
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
            <div class="flex items-center gap-2 shrink-0">
              <span class="font-cinzel text-[10px] font-semibold tracking-wider px-2 py-0.5 rounded border"
                :class="planBadgeClass(user.plan_id)">
                {{ user.plan_id }}
              </span>
              <span class="font-fell text-xs text-muted-foreground">{{ user.ai_credits }} cr</span>
              <div class="flex gap-1">
                <button
                  v-for="pid in PLAN_IDS"
                  :key="pid"
                  class="px-2 py-0.5 font-cinzel text-[10px] font-semibold tracking-wider border rounded transition-colors"
                  :class="
                    user.plan_id === pid
                      ? 'border-primary/40 text-primary bg-primary/10 cursor-default'
                      : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/40'
                  "
                  :disabled="user.plan_id === pid || setPlanMutation.isPending.value"
                  @click="user.plan_id !== pid && setPlanMutation.mutate({ userId: user.user_id, planId: pid })"
                >
                  {{ pid }}
                </button>
              </div>
            </div>
          </div>
          <p v-if="filteredUsers.length === 0" class="font-fell text-sm text-muted-foreground text-center py-8">
            No users match your search.
          </p>
        </div>
      </template>

      <!-- ── Credits tab ───────────────────────────────────────────────── -->
      <template v-else-if="activeTab === 'credits'">
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
              :disabled="!grantUserId || !grantAmount || grantCreditsMutation.isPending.value"
              @click="doGrantCredits"
            >
              {{ grantCreditsMutation.isPending.value ? 'Granting…' : 'Grant Credits' }}
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
      </template>

    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { LayoutGrid, Users, Coins } from "lucide-vue-next";
import { useAdminPlans } from "@/composables/useAdminPlans";
import { useAdminUsers } from "@/composables/useAdminUsers";
import type { Plan, QuotaResource, PlanId } from "@/types/subscription.types";

const route = useRoute();
const router = useRouter();

type TabId = "plans" | "users" | "credits";
const VALID_TABS = new Set<string>(["plans", "users", "credits"]);
const TABS = [
  { id: "plans" as TabId, label: "Plans", icon: LayoutGrid },
  { id: "users" as TabId, label: "Users", icon: Users },
  { id: "credits" as TabId, label: "Credits", icon: Coins },
];

const activeTab = computed<TabId>(() => {
  const q = route.query.tab;
  return VALID_TABS.has(q as string) ? (q as TabId) : "plans";
});

function setTab(id: TabId) {
  router.replace({ query: { ...route.query, tab: id } });
}

// ── Plans ──────────────────────────────────────────────────────────────────
const { LABELS, updateQuotas, ...plansQuery } = useAdminPlans();

const QUOTA_RESOURCES: QuotaResource[] = [
  "campaigns",
  "npcs",
  "monsters",
  "encounters",
  "scriptorium_documents",
  "notes",
];

type QuotaDraft = Record<string, Record<QuotaResource, number>>;
const draftQuotas = reactive<QuotaDraft>({});
const planSaving = reactive<Record<string, boolean>>({});

watch(
  () => plansQuery.data.value,
  (plans) => {
    if (!plans) return;
    for (const plan of plans) {
      if (plan.id === "free") {
        draftQuotas[plan.id] = { ...defaultQuotaRecord(), ...plan.quotas } as Record<QuotaResource, number>;
      }
    }
  },
  { immediate: true },
);

function defaultQuotaRecord(): Record<QuotaResource, number> {
  return { campaigns: 0, npcs: 0, monsters: 0, encounters: 0, scriptorium_documents: 0, notes: 0 };
}

async function savePlanQuotas(plan: Plan) {
  planSaving[plan.id] = true;
  try {
    await updateQuotas.mutateAsync({ planId: plan.id, quotas: draftQuotas[plan.id] });
  } finally {
    planSaving[plan.id] = false;
  }
}

// ── Users ──────────────────────────────────────────────────────────────────
const { setPlan: setPlanMutation, grantCredits: grantCreditsMutation, ...usersQuery } = useAdminUsers();

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

// ── Credits ────────────────────────────────────────────────────────────────
const grantUserId = ref("");
const grantAmount = ref<number | null>(null);
const grantReason = ref("admin_grant");
const grantSuccess = ref(false);

async function doGrantCredits() {
  if (!grantUserId.value || !grantAmount.value) return;
  await grantCreditsMutation.mutateAsync({
    userId: grantUserId.value,
    amount: grantAmount.value,
    reason: grantReason.value || "admin_grant",
  });
  grantSuccess.value = true;
  grantAmount.value = null;
  setTimeout(() => (grantSuccess.value = false), 3000);
}
</script>
