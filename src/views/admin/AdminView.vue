<template>
  <div class="flex flex-col h-full min-h-0 overflow-hidden">
    <!-- Header -->
    <div class="px-4 pt-4 pb-3 md:px-6 md:pt-6 shrink-0">
      <h1 class="font-cinzel text-xl md:text-3xl font-bold text-foreground tracking-wide">
        Admin Panel
      </h1>
      <p class="font-fell text-sm md:text-base text-muted-foreground italic mt-0.5">
        Plans, subscriptions, invites &amp; AI management
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

      <!-- ── Invites tab ────────────────────────────────────────────────── -->
      <template v-else-if="activeTab === 'invites'">
        <!-- New Invite Link -->
        <div class="rounded-lg border border-border bg-card p-4 space-y-3">
          <h2 class="font-cinzel text-sm font-semibold tracking-wide text-foreground">New Invite Link</h2>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input
              v-model="newLabel"
              type="text"
              placeholder="Label (e.g. For John)"
              class="sm:col-span-2 rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <input
              v-model.number="newMaxUses"
              type="number"
              min="1"
              placeholder="Uses (default 1)"
              class="rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div class="flex items-center gap-1.5">
            <button
              v-for="opt in planOptions"
              :key="opt.value"
              type="button"
              class="px-3 py-1 rounded-md font-cinzel text-[11px] font-semibold tracking-wider border transition-colors"
              :class="newGrantedPlan === opt.value
                ? opt.activeClass
                : 'border-border text-muted-foreground hover:text-foreground'"
              @click="newGrantedPlan = opt.value"
            >
              {{ opt.label }}
            </button>
          </div>
          <div class="flex items-center gap-2">
            <input
              v-model="newExpiry"
              type="datetime-local"
              class="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground font-cinzel text-xs tracking-wide hover:opacity-90 transition-opacity disabled:opacity-50"
              :disabled="createInvite.isPending.value"
              @click="handleCreate"
            >
              <Plus class="h-3.5 w-3.5" />
              Generate
            </button>
          </div>
        </div>

        <!-- Active Links -->
        <div class="rounded-lg border border-border bg-card p-4 space-y-3">
          <h2 class="font-cinzel text-sm font-semibold tracking-wide text-foreground">Active Links</h2>

          <div v-if="invitesQuery.isPending.value" class="text-center py-4">
            <div class="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin mx-auto" />
          </div>

          <div
            v-for="invite in invites"
            :key="invite.id"
            class="rounded-md border border-border bg-muted/30 p-3 space-y-2"
          >
            <div class="flex items-start justify-between gap-2">
              <div>
                <div class="flex items-center gap-2">
                  <p v-if="invite.label" class="font-cinzel text-xs font-semibold text-foreground">
                    {{ invite.label }}
                  </p>
                  <span
                    v-if="invite.granted_plan !== 'free'"
                    class="px-1.5 py-0.5 rounded font-cinzel text-[10px] font-semibold tracking-wider uppercase"
                    :class="invite.granted_plan === 'admin'
                      ? 'bg-primary/10 text-primary'
                      : 'bg-amber-500/10 text-amber-400'"
                  >{{ invite.granted_plan }}</span>
                </div>
                <p class="font-fell text-xs text-muted-foreground italic">
                  {{ invite.use_count }}{{ invite.max_uses ? `/${invite.max_uses}` : '' }} uses
                  <span v-if="invite.expires_at"> · expires {{ formatDate(invite.expires_at) }}</span>
                  <span v-if="isExpired(invite)" class="text-destructive"> · expired</span>
                </p>
              </div>
              <button
                class="shrink-0 p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                :disabled="deleteInvite.isPending.value"
                @click="deleteInvite.mutate(invite.id)"
              >
                <Trash2 class="h-3.5 w-3.5" />
              </button>
            </div>
            <div class="flex items-center gap-2 rounded bg-background px-2 py-1.5">
              <code class="flex-1 text-[11px] text-muted-foreground truncate font-mono">
                {{ signupUrl(invite.token) }}
              </code>
              <button
                class="shrink-0 flex items-center gap-1 px-2 py-0.5 rounded text-xs font-cinzel tracking-wide transition-colors"
                :class="copiedId === invite.id
                  ? 'bg-green-500/20 text-green-400'
                  : 'border border-border text-foreground hover:bg-muted'"
                @click="copyInvite(invite)"
              >
                <Check v-if="copiedId === invite.id" class="h-3 w-3" />
                <Copy v-else class="h-3 w-3" />
                {{ copiedId === invite.id ? 'Copied!' : 'Copy' }}
              </button>
            </div>
          </div>

          <p v-if="!invitesQuery.isPending.value && invites.length === 0" class="font-fell text-xs text-muted-foreground italic">
            No active invite links.
          </p>
        </div>
      </template>

      <!-- ── Content tab ───────────────────────────────────────────────── -->
      <template v-else-if="activeTab === 'content'">
        <!-- SRD Art Defaults -->
        <div class="rounded-lg border border-border bg-card p-4 space-y-3">
          <h2 class="font-cinzel text-sm font-semibold tracking-wide text-foreground">SRD Art Defaults</h2>
          <p class="font-fell text-xs text-muted-foreground italic">
            Publish your uploaded SRD art as community defaults. Other DMs will see your images
            for any SRD content they haven't personalised. Re-running is safe — it updates
            existing defaults with your latest images.
          </p>
          <div v-if="statsQuery.data.value" class="font-fell text-xs text-foreground">
            Currently published:
            <span class="font-semibold">{{ statsQuery.data.value.monsters }}</span> monsters ·
            <span class="font-semibold">{{ statsQuery.data.value.spells }}</span> spells ·
            <span class="font-semibold">{{ statsQuery.data.value.items }}</span> items
          </div>
          <div v-if="publishResult" class="font-fell text-xs text-green-500">
            Done — {{ publishResult.monsters }} monsters · {{ publishResult.spells }} spells ·
            {{ publishResult.items }} items published.
          </div>
          <button
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground font-cinzel text-xs tracking-wide hover:opacity-90 transition-opacity disabled:opacity-50"
            :disabled="bulkPublish.isPending.value"
            @click="handlePublishArt"
          >
            <Upload class="h-3.5 w-3.5" />
            {{ bulkPublish.isPending.value ? 'Publishing…' : 'Publish all my SRD art' }}
          </button>
        </div>
      </template>

      <!-- ── Prompts tab ──────────────────────────────────────────────── -->
      <template v-else-if="activeTab === 'prompts'">
        <div v-if="promptsQuery.isPending.value" class="text-muted-foreground font-fell text-sm">
          Loading prompts…
        </div>
        <div v-else-if="promptsQuery.isError.value" class="text-destructive font-fell text-sm">
          Failed to load prompts.
        </div>
        <div v-else class="space-y-4">
          <div
            v-for="prompt in promptsQuery.prompts.value ?? []"
            :key="prompt.generator_type"
            class="rounded-lg border border-border bg-card p-4 space-y-3"
          >
            <div class="flex items-center justify-between">
              <div>
                <h2 class="font-cinzel text-sm font-semibold tracking-wide text-foreground">
                  {{ prompt.label }}
                </h2>
                <span class="font-cinzel text-[10px] tracking-widest text-muted-foreground uppercase">
                  {{ prompt.generator_type }}
                </span>
              </div>
              <button
                class="px-3 py-1.5 font-cinzel text-xs font-semibold tracking-wider bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
                :disabled="promptSaving[prompt.generator_type]"
                @click="savePrompt(prompt)"
              >
                {{ promptSaving[prompt.generator_type] ? 'Saving…' : 'Save' }}
              </button>
            </div>
            <textarea
              v-model="draftPrompts[prompt.generator_type]"
              rows="12"
              class="w-full bg-muted border border-border rounded px-2.5 py-2 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-y"
            />
          </div>
        </div>
      </template>

      <!-- ── Pricing tab ───────────────────────────────────────────────── -->
      <template v-else-if="activeTab === 'pricing'">
        <!-- Credit packs -->
        <div class="rounded-lg border border-border bg-card p-4 space-y-3">
          <div>
            <h2 class="font-cinzel text-sm font-semibold tracking-wide text-foreground">Credit Packs</h2>
            <p class="font-fell text-xs text-muted-foreground italic mt-0.5">
              How many credits each pack contains and the display price. Changing the EUR price here is cosmetic only — update the Stripe product separately to change what's actually charged.
            </p>
          </div>
          <div v-if="pricingQuery.packs.isPending.value" class="text-muted-foreground font-fell text-sm">Loading…</div>
          <div v-else-if="pricingQuery.packs.isError.value" class="text-destructive font-fell text-sm">Failed to load packs.</div>
          <table v-else class="w-full text-sm">
            <thead>
              <tr class="border-b border-border">
                <th class="text-left pb-2 font-cinzel text-[10px] tracking-wider text-muted-foreground uppercase">Pack</th>
                <th class="text-right pb-2 font-cinzel text-[10px] tracking-wider text-muted-foreground uppercase w-28">Credits</th>
                <th class="text-right pb-2 font-cinzel text-[10px] tracking-wider text-muted-foreground uppercase w-28">EUR (display)</th>
                <th class="w-16" />
              </tr>
            </thead>
            <tbody class="divide-y divide-border">
              <tr v-for="pack in pricingQuery.packs.data.value" :key="pack.pack_id">
                <td class="py-2 font-fell text-foreground">{{ pack.label }}</td>
                <td class="py-2 text-right">
                  <input
                    v-model.number="draftPacks[pack.pack_id].credits"
                    type="number" min="1"
                    class="w-24 bg-muted border border-border rounded px-2 py-1 font-fell text-sm text-foreground text-right focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </td>
                <td class="py-2 text-right">
                  <input
                    v-model.number="draftPacks[pack.pack_id].eur_display"
                    type="number" min="0" step="0.01"
                    class="w-24 bg-muted border border-border rounded px-2 py-1 font-fell text-sm text-foreground text-right focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </td>
                <td class="py-2 pl-2 text-right">
                  <button
                    class="px-2.5 py-1 font-cinzel text-[10px] font-semibold tracking-wider bg-primary text-primary-foreground rounded hover:opacity-90 disabled:opacity-50 transition-opacity"
                    :disabled="packSaving[pack.pack_id]"
                    @click="savePack(pack)"
                  >
                    {{ packSaving[pack.pack_id] ? '…' : 'Save' }}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Generation costs -->
        <div class="rounded-lg border border-border bg-card p-4 space-y-3">
          <div>
            <h2 class="font-cinzel text-sm font-semibold tracking-wide text-foreground">Generation Costs</h2>
            <p class="font-fell text-xs text-muted-foreground italic mt-0.5">
              Credits deducted per generation when not using BYOK (server-side mode).
            </p>
          </div>
          <div v-if="pricingQuery.generationCosts.isPending.value" class="text-muted-foreground font-fell text-sm">Loading…</div>
          <div v-else-if="pricingQuery.generationCosts.isError.value" class="text-destructive font-fell text-sm">Failed to load costs.</div>
          <table v-else class="w-full text-sm">
            <thead>
              <tr class="border-b border-border">
                <th class="text-left pb-2 font-cinzel text-[10px] tracking-wider text-muted-foreground uppercase">Generator</th>
                <th class="text-right pb-2 font-cinzel text-[10px] tracking-wider text-muted-foreground uppercase w-32">Credits</th>
                <th class="w-16" />
              </tr>
            </thead>
            <tbody class="divide-y divide-border">
              <tr v-for="gen in pricingQuery.generationCosts.data.value" :key="gen.generation_type">
                <td class="py-2">
                  <p class="font-fell text-foreground">{{ gen.label }}</p>
                  <p class="font-cinzel text-[10px] text-muted-foreground tracking-wider">{{ gen.generation_type }}</p>
                </td>
                <td class="py-2 text-right">
                  <input
                    v-model.number="draftGenCosts[gen.generation_type]"
                    type="number" min="0"
                    class="w-24 bg-muted border border-border rounded px-2 py-1 font-fell text-sm text-foreground text-right focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </td>
                <td class="py-2 pl-2 text-right">
                  <button
                    class="px-2.5 py-1 font-cinzel text-[10px] font-semibold tracking-wider bg-primary text-primary-foreground rounded hover:opacity-90 disabled:opacity-50 transition-opacity"
                    :disabled="genCostSaving[gen.generation_type]"
                    @click="saveGenCost(gen)"
                  >
                    {{ genCostSaving[gen.generation_type] ? '…' : 'Save' }}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
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
      </template>

    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { LayoutGrid, Users, Coins, FileText, UserPlus, Plus, Trash2, Copy, Check, Upload, Library, Tag } from "lucide-vue-next";
import { useAdminPlans } from "@/composables/useAdminPlans";
import { useAdminUsers } from "@/composables/useAdminUsers";
import { useAdminPrompts } from "@/composables/useAdminPrompts";
import { useAdminPricing } from "@/composables/useAdminPricing";
import type { CreditPackConfig, GenerationCreditCost } from "@/composables/useAdminPricing";
import type { AiSystemPrompt } from "@/composables/useAdminPrompts";
import type { Plan, QuotaResource, PlanId } from "@/types/subscription.types";
import { useAppInvites, useCreateAppInvite, useDeleteAppInvite } from "@/composables/useAppInvites";
import type { AppInvite, GrantedPlan } from "@/composables/useAppInvites";
import { useBulkPublishSrdArtDefaults, useSrdArtDefaultStats, useSyncSrdSpellArtToSharedTable } from "@/composables/useSrdArtDefaults";
import type { SrdArtDefaultStats } from "@/composables/useSrdArtDefaults";
import { useBulkMarkSrdMonsterArtAsCanonical, useSyncSrdArtToSharedTable } from "@/composables/useSrdMonsterArt";
import { useBulkMarkSrdSpellArtAsCanonical } from "@/composables/useSrdSpellArt";
import { useAiUsageStats } from "@/composables/useAiUsageStats";

const route = useRoute();
const router = useRouter();

type TabId = "plans" | "users" | "invites" | "content" | "pricing" | "credits" | "prompts";
const VALID_TABS = new Set<string>(["plans", "users", "invites", "content", "pricing", "credits", "prompts"]);
const TABS = [
  { id: "plans"   as TabId, label: "Plans",   icon: LayoutGrid },
  { id: "users"   as TabId, label: "Users",   icon: Users },
  { id: "invites" as TabId, label: "Invites", icon: UserPlus },
  { id: "content" as TabId, label: "Content", icon: Library },
  { id: "pricing" as TabId, label: "Pricing", icon: Tag },
  { id: "credits" as TabId, label: "Credits", icon: Coins },
  { id: "prompts" as TabId, label: "Prompts", icon: FileText },
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

// ── Invites ────────────────────────────────────────────────────────────────
const invitesQuery = useAppInvites();
const createInvite = useCreateAppInvite();
const deleteInvite = useDeleteAppInvite();
const statsQuery = useSrdArtDefaultStats();
const bulkPublish = useBulkPublishSrdArtDefaults();
const bulkMarkMonsters = useBulkMarkSrdMonsterArtAsCanonical();
const bulkMarkSpells   = useBulkMarkSrdSpellArtAsCanonical();
const syncArtToShared  = useSyncSrdArtToSharedTable();
const syncSpellArt     = useSyncSrdSpellArtToSharedTable();
const publishResult = ref<SrdArtDefaultStats | null>(null);

const invites = computed(() => invitesQuery.data.value ?? []);

const newLabel = ref("");
const newExpiry = ref("");
const newMaxUses = ref<number | null>(1);
const newGrantedPlan = ref<GrantedPlan>("free");

const planOptions: { value: GrantedPlan; label: string; activeClass: string }[] = [
  { value: "free",   label: "Free",   activeClass: "border-border bg-muted text-foreground" },
  { value: "tester", label: "Tester", activeClass: "border-amber-500/50 bg-amber-500/10 text-amber-400" },
  { value: "admin",  label: "Admin",  activeClass: "border-primary/50 bg-primary/10 text-primary" },
];
const copiedId = ref<string | null>(null);

function signupUrl(token: string) {
  return `${window.location.origin}/signup?token=${token}`;
}

function isExpired(invite: AppInvite) {
  return !!invite.expires_at && new Date(invite.expires_at) < new Date();
}

function handleCreate() {
  const payload: Parameters<typeof createInvite.mutate>[0] = {};
  if (newLabel.value.trim()) payload.label = newLabel.value.trim();
  if (newExpiry.value) payload.expires_at = new Date(newExpiry.value).toISOString();
  payload.max_uses = newMaxUses.value ?? 1;
  payload.granted_plan = newGrantedPlan.value;
  createInvite.mutate(payload, {
    onSuccess: () => {
      newLabel.value = "";
      newExpiry.value = "";
      newMaxUses.value = 1;
      newGrantedPlan.value = "free";
    },
  });
}

async function handlePublishArt() {
  publishResult.value = null;
  const [monsterCount, spellArtCount, contentResult] = await Promise.all([
    bulkMarkMonsters.mutateAsync(),
    bulkMarkSpells.mutateAsync(),
    bulkPublish.mutateAsync(),
  ]);
  await Promise.all([
    syncArtToShared.mutateAsync(),
    syncSpellArt.mutateAsync(),
  ]);
  publishResult.value = { monsters: monsterCount, spells: contentResult.spells + spellArtCount, items: contentResult.items };
  statsQuery.refetch();
}

async function copyInvite(invite: AppInvite) {
  await navigator.clipboard.writeText(signupUrl(invite.token));
  copiedId.value = invite.id;
  setTimeout(() => { copiedId.value = null; }, 2000);
}

// ── Prompts ────────────────────────────────────────────────────────────────
const promptsQuery = useAdminPrompts();
const draftPrompts = reactive<Record<string, string>>({});
const promptSaving = reactive<Record<string, boolean>>({});

watch(
  () => promptsQuery.prompts.value,
  (list) => {
    if (!list) return;
    for (const p of list) {
      if (!(p.generator_type in draftPrompts)) {
        draftPrompts[p.generator_type] = p.content;
      }
    }
  },
  { immediate: true },
);

async function savePrompt(prompt: AiSystemPrompt) {
  promptSaving[prompt.generator_type] = true;
  try {
    await promptsQuery.updatePrompt.mutateAsync({
      generator_type: prompt.generator_type,
      content: draftPrompts[prompt.generator_type] ?? prompt.content,
    });
  } finally {
    promptSaving[prompt.generator_type] = false;
  }
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

// ── AI Usage Stats ─────────────────────────────────────────────────────────
const usageStats = useAiUsageStats();

// ── Pricing ────────────────────────────────────────────────────────────────
const pricingQuery = useAdminPricing();

type PackDraft = { credits: number; eur_display: number };
const draftPacks = reactive<Record<string, PackDraft>>({});
const packSaving = reactive<Record<string, boolean>>({});

watch(
  () => pricingQuery.packs.data.value,
  (packs) => {
    if (!packs) return;
    for (const p of packs) {
      if (!(p.pack_id in draftPacks)) {
        draftPacks[p.pack_id] = { credits: p.credits, eur_display: p.eur_display };
      }
    }
  },
  { immediate: true },
);

async function savePack(pack: CreditPackConfig) {
  packSaving[pack.pack_id] = true;
  try {
    await pricingQuery.updatePack.mutateAsync({
      pack_id: pack.pack_id,
      credits: draftPacks[pack.pack_id].credits,
      eur_display: draftPacks[pack.pack_id].eur_display,
    });
  } finally {
    packSaving[pack.pack_id] = false;
  }
}

const draftGenCosts = reactive<Record<string, number>>({});
const genCostSaving = reactive<Record<string, boolean>>({});

watch(
  () => pricingQuery.generationCosts.data.value,
  (costs) => {
    if (!costs) return;
    for (const c of costs) {
      if (!(c.generation_type in draftGenCosts)) {
        draftGenCosts[c.generation_type] = c.credit_cost;
      }
    }
  },
  { immediate: true },
);

async function saveGenCost(gen: GenerationCreditCost) {
  genCostSaving[gen.generation_type] = true;
  try {
    await pricingQuery.updateGenerationCost.mutateAsync({
      generation_type: gen.generation_type,
      credit_cost: draftGenCosts[gen.generation_type],
    });
  } finally {
    genCostSaving[gen.generation_type] = false;
  }
}
</script>
