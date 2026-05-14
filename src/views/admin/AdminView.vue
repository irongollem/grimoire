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

      <!-- ── Users tab ────────────────────────────────────────────────────── -->
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
              <IconAdd class="h-3.5 w-3.5" />
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
                <IconDelete class="h-3.5 w-3.5" />
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
                <IconCheck v-if="copiedId === invite.id" class="h-3 w-3" />
                <IconCopy v-else class="h-3 w-3" />
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
        <!-- SRD Art Repair -->
        <SrdArtRepairPanel />
        <SrdArtRepairPanel mode="spell" />

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
            <IconUpload class="h-3.5 w-3.5" />
            {{ bulkPublish.isPending.value ? 'Publishing…' : 'Publish all my SRD art' }}
          </button>
        </div>

        <!-- Placeholder Art Focal Points -->
        <div class="rounded-lg border border-border bg-card p-4 space-y-4">
          <div>
            <h2 class="font-cinzel text-sm font-semibold tracking-wide text-foreground">Placeholder Art</h2>
            <p class="font-fell text-xs text-muted-foreground italic mt-0.5">
              Click anywhere on a placeholder image to set where the focus point should be. This corrects
              cases where smartcrop picks the wrong area (e.g. torso instead of face).
              Changes take effect immediately for users whose smartcrop cache hasn't run yet,
              and on next page load for those who have.
            </p>
          </div>

          <div v-if="placeholderFpQuery.isPending.value" class="text-muted-foreground font-fell text-sm">
            Loading…
          </div>
          <div v-else class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            <div
              v-for="entity in PLACEHOLDER_ENTITIES"
              :key="entity.type"
              class="flex flex-col gap-1.5"
            >
              <p class="font-cinzel text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                {{ entity.label }}
              </p>

              <!-- Clickable image with crosshair overlay -->
              <div
                class="relative rounded-md overflow-hidden border border-border cursor-crosshair bg-muted"
                :class="entity.aspect"
                @click="handlePlaceholderFpClick($event, entity.type)"
              >
                <img
                  :src="`/assets/placeholders/${entity.type}.webp`"
                  :alt="entity.label"
                  class="w-full h-full object-cover"
                />
                <!-- Current focal point crosshair -->
                <div
                  v-if="placeholderFocalPoints[entity.type]"
                  class="absolute w-4 h-4 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                  :style="{
                    left: `${placeholderFocalPoints[entity.type].x}%`,
                    top: `${placeholderFocalPoints[entity.type].y}%`,
                  }"
                >
                  <div class="absolute inset-0 rounded-full bg-primary/80 border-2 border-white shadow" />
                </div>
                <!-- Saved flash -->
                <div
                  v-if="placeholderFpSaved === entity.type"
                  class="absolute inset-0 flex items-center justify-center bg-black/40"
                >
                  <IconCheck class="h-6 w-6 text-white" />
                </div>
              </div>

              <!-- Coordinates -->
              <p
                v-if="placeholderFocalPoints[entity.type]"
                class="font-cinzel text-[9px] text-muted-foreground/60 tracking-wider text-center"
              >
                {{ placeholderFocalPoints[entity.type].x }}%, {{ placeholderFocalPoints[entity.type].y }}%
              </p>
            </div>
          </div>
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
        <!-- Promo codes toggle -->
        <div class="rounded-lg border border-border bg-card p-4">
          <div class="flex items-center justify-between gap-4">
            <div>
              <h2 class="font-cinzel text-sm font-semibold tracking-wide text-foreground">Promotion Codes</h2>
              <p class="font-fell text-xs text-muted-foreground italic mt-0.5">
                When enabled, a promo code field appears on the Stripe checkout page. Disable when no active promotion is running so users don't wonder if they're missing out.
              </p>
            </div>
            <button
              class="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-transparent transition-colors focus:outline-none"
              :class="checkoutConfig.data.value?.promo_codes_enabled ? 'bg-primary' : 'bg-muted'"
              :disabled="checkoutConfig.update.isPending.value"
              @click="checkoutConfig.update.mutate(!checkoutConfig.data.value?.promo_codes_enabled)"
            >
              <span
                class="inline-block h-4 w-4 rounded-full bg-white shadow transition-transform"
                :class="checkoutConfig.data.value?.promo_codes_enabled ? 'translate-x-5' : 'translate-x-0.5'"
              />
            </button>
          </div>
        </div>

        <!-- Credit packs -->
        <div class="rounded-lg border border-border bg-card p-4 space-y-3">
          <div>
            <h2 class="font-cinzel text-sm font-semibold tracking-wide text-foreground">Credit Packs</h2>
            <p class="font-fell text-xs text-muted-foreground italic mt-0.5">
              Enter the Stripe Price ID and click Save — price data is fetched from Stripe and cached. Credits field controls how many credits the buyer receives.
            </p>
          </div>
          <div v-if="pricingQuery.packs.isPending.value" class="text-muted-foreground font-fell text-sm">Loading…</div>
          <div v-else-if="pricingQuery.packs.isError.value" class="text-destructive font-fell text-sm">Failed to load packs.</div>
          <table v-else class="w-full text-sm">
            <thead>
              <tr class="border-b border-border">
                <th class="text-left pb-2 font-cinzel text-[10px] tracking-wider text-muted-foreground uppercase">Pack</th>
                <th class="text-right pb-2 font-cinzel text-[10px] tracking-wider text-muted-foreground uppercase w-20">Credits</th>
                <th class="text-right pb-2 pl-3 font-cinzel text-[10px] tracking-wider text-muted-foreground uppercase w-24">Price</th>
                <th class="pb-2 pl-3 font-cinzel text-[10px] tracking-wider text-muted-foreground uppercase">Stripe Price ID</th>
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
                    class="w-16 bg-muted border border-border rounded px-2 py-1 font-fell text-sm text-foreground text-right focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </td>
                <td class="py-2 pl-3 text-right font-fell text-xs text-muted-foreground whitespace-nowrap">
                  {{ pack.stripe_unit_amount && pack.stripe_currency
                    ? new Intl.NumberFormat(undefined, { style: 'currency', currency: pack.stripe_currency.toUpperCase() }).format(pack.stripe_unit_amount / 100)
                    : '—' }}
                </td>
                <td class="py-2 pl-3">
                  <input
                    v-model="draftPacks[pack.pack_id].stripe_price_id"
                    type="text"
                    placeholder="price_…"
                    class="w-full bg-muted border border-border rounded px-2 py-1 font-mono text-xs placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
                    :class="draftPacks[pack.pack_id].stripe_price_id ? 'text-green-400' : 'text-amber-400'"
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

        <!-- Subscription prices -->
        <div class="rounded-lg border border-border bg-card p-4 space-y-3">
          <div>
            <h2 class="font-cinzel text-sm font-semibold tracking-wide text-foreground">Subscription Prices</h2>
            <p class="font-fell text-xs text-muted-foreground italic mt-0.5">
              Enter Stripe Price IDs for each paid plan and click Sync — amounts are fetched from Stripe and cached.
            </p>
          </div>
          <div v-if="plansQuery.isPending.value" class="text-muted-foreground font-fell text-sm">Loading…</div>
          <div v-else-if="plansQuery.isError.value" class="text-destructive font-fell text-sm">Failed to load plans.</div>
          <template v-else>
            <div
              v-for="plan in (plansQuery.data.value ?? []).filter(p => p.id !== 'free')"
              :key="plan.id"
              class="border border-border rounded-md p-3 space-y-3"
            >
              <div class="flex items-center justify-between">
                <h3 class="font-cinzel text-xs font-semibold tracking-wide text-foreground capitalize">{{ plan.name }}</h3>
                <button
                  class="px-2.5 py-1 font-cinzel text-[10px] font-semibold tracking-wider bg-primary text-primary-foreground rounded hover:opacity-90 disabled:opacity-50 transition-opacity"
                  :disabled="planPriceSyncing[plan.id]"
                  @click="syncPlanPrices(plan.id)"
                >
                  {{ planPriceSyncing[plan.id] ? 'Saving…' : 'Save' }}
                </button>
              </div>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div class="space-y-1">
                  <label class="block font-cinzel text-[10px] tracking-wider text-muted-foreground uppercase">Monthly Price ID</label>
                  <div class="flex items-center gap-2">
                    <input
                      v-model="draftPlanPrices[plan.id].monthlyPriceId"
                      type="text"
                      placeholder="price_…"
                      class="flex-1 bg-muted border border-border rounded px-2 py-1 font-mono text-xs placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
                      :class="draftPlanPrices[plan.id].monthlyPriceId ? 'text-green-400' : 'text-amber-400'"
                    />
                    <span v-if="plan.stripe_monthly_unit_amount && plan.stripe_currency" class="font-fell text-xs text-muted-foreground whitespace-nowrap">
                      {{ new Intl.NumberFormat(undefined, { style: 'currency', currency: plan.stripe_currency.toUpperCase() }).format(plan.stripe_monthly_unit_amount / 100) }}/mo
                    </span>
                  </div>
                </div>
                <div class="space-y-1">
                  <label class="block font-cinzel text-[10px] tracking-wider text-muted-foreground uppercase">Annual Price ID</label>
                  <div class="flex items-center gap-2">
                    <input
                      v-model="draftPlanPrices[plan.id].annualPriceId"
                      type="text"
                      placeholder="price_…"
                      class="flex-1 bg-muted border border-border rounded px-2 py-1 font-mono text-xs placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
                      :class="draftPlanPrices[plan.id].annualPriceId ? 'text-green-400' : 'text-amber-400'"
                    />
                    <span v-if="plan.stripe_annual_unit_amount && plan.stripe_currency" class="font-fell text-xs text-muted-foreground whitespace-nowrap">
                      {{ new Intl.NumberFormat(undefined, { style: 'currency', currency: plan.stripe_currency.toUpperCase() }).format(plan.stripe_annual_unit_amount / 100) }}/yr
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </template>
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
                <th class="text-right pb-2 pl-4 font-cinzel text-[10px] tracking-wider text-muted-foreground uppercase">Calibration</th>
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
                <td class="py-2 pl-4 text-right">
                  <span v-if="calibrationQuery.isPending.value" class="font-fell text-[10px] text-muted-foreground/40">…</span>
                  <span v-else-if="!calibrationHints[gen.generation_type]" class="font-fell text-[10px] text-muted-foreground/30">—</span>
                  <!-- No suggestion yet (< 20 samples) — show raw cost as informational -->
                  <span
                    v-else-if="calibrationHints[gen.generation_type].suggested_cost === null"
                    class="font-cinzel text-[10px] text-muted-foreground/50 tracking-wide whitespace-nowrap"
                    :title="`${calibrationHints[gen.generation_type].sample_size} samples (need 20 for suggestion)`"
                  >~${{ (calibrationHints[gen.generation_type].avg_actual_usd_cents / 100).toFixed(4) }}</span>
                  <!-- Well calibrated — green -->
                  <span
                    v-else-if="calibrationStatus(calibrationHints[gen.generation_type]) === 'ok'"
                    class="font-cinzel text-[10px] text-green-500 tracking-wide"
                    :title="`avg actual: $${(calibrationHints[gen.generation_type].avg_actual_usd_cents / 100).toFixed(4)} (${calibrationHints[gen.generation_type].sample_size} samples)`"
                  >✓</span>
                  <!-- Under-charging: current cost < API cost — red, raise price -->
                  <span
                    v-else-if="calibrationStatus(calibrationHints[gen.generation_type]) === 'under'"
                    class="font-cinzel text-[10px] text-red-500 tracking-wide whitespace-nowrap font-semibold"
                    :title="`Under-charging — avg actual: $${(calibrationHints[gen.generation_type].avg_actual_usd_cents / 100).toFixed(4)} (${calibrationHints[gen.generation_type].sample_size} samples)`"
                  >↑ {{ calibrationHints[gen.generation_type].suggested_cost }}</span>
                  <!-- Over-charging: steep margin — blue -->
                  <span
                    v-else
                    class="font-cinzel text-[10px] text-sky-400 tracking-wide whitespace-nowrap"
                    :title="`Steep margin — avg actual: $${(calibrationHints[gen.generation_type].avg_actual_usd_cents / 100).toFixed(4)} (${calibrationHints[gen.generation_type].sample_size} samples)`"
                  >↓ {{ calibrationHints[gen.generation_type].suggested_cost }}</span>
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

      <!-- ── Providers tab ───────────────────────────────────────────────── -->
      <template v-else-if="activeTab === 'providers'">
        <div class="rounded-lg border border-border bg-card p-4 space-y-1">
          <h2 class="font-cinzel text-sm font-semibold tracking-wide text-foreground">AI Providers</h2>
          <p class="font-fell text-xs text-muted-foreground italic">
            Platform key, model selection, credit multipliers, and API cost rates — all per provider.
            Keys are encrypted at rest. Multipliers are relative to the OpenAI 1× baseline.
            Save model costs to mark them verified; compare estimated totals to provider invoices monthly.
          </p>
        </div>

        <div v-if="providersQuery.isPending.value" class="text-muted-foreground font-fell text-sm">Loading…</div>
        <div v-else-if="providersQuery.isError.value" class="text-destructive font-fell text-sm">Failed to load provider config.</div>
        <div v-else class="space-y-4">
          <div
            v-for="row in providersQuery.data.value"
            :key="row.provider"
            class="rounded-lg border border-border bg-card p-4 space-y-4"
          >
            <!-- Header -->
            <div class="flex items-center justify-between">
              <h3 class="font-cinzel text-sm font-semibold tracking-wide text-foreground">
                {{ PROVIDER_LABELS[row.provider] ?? row.provider }}
              </h3>
              <button
                class="px-3 py-1.5 font-cinzel text-xs font-semibold tracking-wider bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
                :disabled="providerSaving[row.provider]"
                @click="saveProvider(row.provider)"
              >
                {{ providerSaving[row.provider] ? 'Saving…' : 'Save config' }}
              </button>
            </div>

            <!-- Platform API Key -->
            <div class="p-3 rounded-md bg-muted/40 border border-border space-y-2">
              <div class="flex items-center justify-between">
                <span class="font-cinzel text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Platform API Key</span>
                <div class="flex items-center gap-2">
                  <span v-if="isKeySet(row.provider as KeyProvider)" class="font-cinzel text-[10px] tracking-widest text-emerald-500 uppercase">
                    Set · {{ new Date(keyUpdatedAt(row.provider as KeyProvider)!).toLocaleDateString() }}
                  </span>
                  <span v-else class="font-cinzel text-[10px] tracking-widest text-muted-foreground/60 uppercase">Not configured</span>
                  <button
                    v-if="isKeySet(row.provider as KeyProvider)"
                    class="px-2 py-0.5 font-cinzel text-[9px] font-semibold tracking-wider text-destructive border border-destructive/40 rounded hover:bg-destructive/10 disabled:opacity-50 transition-colors"
                    :disabled="keyClearing[row.provider as KeyProvider]"
                    @click="doClrKey(row.provider as KeyProvider)"
                  >
                    {{ keyClearing[row.provider as KeyProvider] ? '…' : 'Clear' }}
                  </button>
                </div>
              </div>
              <div class="flex gap-2">
                <div class="relative flex-1">
                  <input
                    v-model="keyDrafts[row.provider as KeyProvider]"
                    :type="keyVisible[row.provider as KeyProvider] ? 'text' : 'password'"
                    :placeholder="isKeySet(row.provider as KeyProvider) ? '•••••••• (leave blank to keep current)' : (PROVIDERS.find(p => p.id === row.provider)?.hint ?? '…')"
                    class="w-full bg-background border border-border rounded px-2.5 py-1.5 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring pr-9"
                    autocomplete="off"
                  />
                  <button
                    type="button"
                    class="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    @click="keyVisible[row.provider as KeyProvider] = !keyVisible[row.provider as KeyProvider]"
                  >
                    <component :is="keyVisible[row.provider as KeyProvider] ? IconHide : IconReveal" class="h-3.5 w-3.5" />
                  </button>
                </div>
                <button
                  class="shrink-0 px-3 py-1.5 font-cinzel text-xs font-semibold tracking-wider bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
                  :disabled="keySaving[row.provider as KeyProvider] || !keyDrafts[row.provider as KeyProvider]?.trim()"
                  @click="saveKey(row.provider as KeyProvider)"
                >
                  {{ keySaving[row.provider as KeyProvider] ? 'Saving…' : 'Set Key' }}
                </button>
              </div>
            </div>

            <!-- Model config + pricing: only shown once a key is set -->
            <template v-if="isKeySet(row.provider as KeyProvider)">

            <!-- Model config: text / image / audio -->
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <!-- Text generation -->
              <div class="space-y-2 p-3 rounded-md bg-muted/40 border border-border">
                <div class="flex items-center justify-between">
                  <span class="font-cinzel text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Text</span>
                  <template v-if="draftProviders[row.provider]?.text_model !== null">
                    <button
                      type="button"
                      class="relative inline-flex h-4 w-7 shrink-0 rounded-full border-2 border-transparent transition-colors"
                      :class="draftProviders[row.provider]?.text_enabled ? 'bg-emerald-500' : 'bg-muted-foreground/40'"
                      @click="draftProviders[row.provider].text_enabled = !draftProviders[row.provider].text_enabled"
                    >
                      <span
                        class="pointer-events-none inline-block h-3 w-3 rounded-full bg-white shadow transition-transform"
                        :class="draftProviders[row.provider]?.text_enabled ? 'translate-x-3' : 'translate-x-0'"
                      />
                    </button>
                  </template>
                  <span v-else class="font-cinzel text-[10px] tracking-wider text-muted-foreground/50 uppercase">N/A</span>
                </div>
                <template v-if="draftProviders[row.provider]?.text_model !== null">
                  <div class="space-y-1">
                    <label class="block font-cinzel text-[10px] tracking-wider text-muted-foreground">Model</label>
                    <input
                      v-model="draftProviders[row.provider].text_model"
                      :list="`text-models-${row.provider}`"
                      type="text"
                      class="w-full bg-background border border-border rounded px-2.5 py-1.5 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                      placeholder="e.g. gpt-4o-mini"
                    />
                    <datalist :id="`text-models-${row.provider}`">
                      <option v-for="m in providerModelOptions[row.provider]" :key="m" :value="m" />
                    </datalist>
                  </div>
                  <div class="space-y-1">
                    <label class="block font-cinzel text-[10px] tracking-wider text-muted-foreground">Multiplier</label>
                    <input
                      v-model.number="draftProviders[row.provider].text_multiplier"
                      type="number" step="0.1" min="0.1"
                      class="w-full bg-background border border-border rounded px-2.5 py-1.5 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                      placeholder="1.0"
                    />
                  </div>
                </template>
              </div>

              <!-- Image generation -->
              <div class="space-y-2 p-3 rounded-md bg-muted/40 border border-border">
                <div class="flex items-center justify-between">
                  <span class="font-cinzel text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Image</span>
                  <template v-if="draftProviders[row.provider]?.image_model !== null">
                    <button
                      type="button"
                      class="relative inline-flex h-4 w-7 shrink-0 rounded-full border-2 border-transparent transition-colors"
                      :class="draftProviders[row.provider]?.image_enabled ? 'bg-emerald-500' : 'bg-muted-foreground/40'"
                      @click="draftProviders[row.provider].image_enabled = !draftProviders[row.provider].image_enabled"
                    >
                      <span
                        class="pointer-events-none inline-block h-3 w-3 rounded-full bg-white shadow transition-transform"
                        :class="draftProviders[row.provider]?.image_enabled ? 'translate-x-3' : 'translate-x-0'"
                      />
                    </button>
                  </template>
                  <span v-else class="font-cinzel text-[10px] tracking-wider text-muted-foreground/50 uppercase">N/A</span>
                </div>
                <template v-if="draftProviders[row.provider]?.image_model !== null">
                  <div class="space-y-1">
                    <label class="block font-cinzel text-[10px] tracking-wider text-muted-foreground">Model</label>
                    <input
                      v-model="draftProviders[row.provider].image_model"
                      :list="`image-models-${row.provider}`"
                      type="text"
                      class="w-full bg-background border border-border rounded px-2.5 py-1.5 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                      placeholder="e.g. gpt-image-1.5"
                    />
                    <datalist :id="`image-models-${row.provider}`">
                      <option v-for="m in providerModelOptions[row.provider]" :key="m" :value="m" />
                    </datalist>
                  </div>
                  <div class="space-y-1">
                    <label class="block font-cinzel text-[10px] tracking-wider text-muted-foreground">Multiplier</label>
                    <input
                      v-model.number="draftProviders[row.provider].image_multiplier"
                      type="number" step="0.1" min="0.1"
                      class="w-full bg-background border border-border rounded px-2.5 py-1.5 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                      placeholder="1.0"
                    />
                  </div>
                </template>
              </div>

              <!-- Audio generation -->
              <div class="space-y-2 p-3 rounded-md bg-muted/40 border border-border">
                <div class="flex items-center justify-between">
                  <span class="font-cinzel text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Audio</span>
                  <template v-if="draftProviders[row.provider]?.audio_model !== null && draftProviders[row.provider]?.audio_model !== undefined">
                    <button
                      type="button"
                      class="relative inline-flex h-4 w-7 shrink-0 rounded-full border-2 border-transparent transition-colors"
                      :class="draftProviders[row.provider]?.audio_enabled ? 'bg-emerald-500' : 'bg-muted-foreground/40'"
                      @click="draftProviders[row.provider].audio_enabled = !draftProviders[row.provider].audio_enabled"
                    >
                      <span
                        class="pointer-events-none inline-block h-3 w-3 rounded-full bg-white shadow transition-transform"
                        :class="draftProviders[row.provider]?.audio_enabled ? 'translate-x-3' : 'translate-x-0'"
                      />
                    </button>
                  </template>
                  <span v-else class="font-cinzel text-[10px] tracking-wider text-muted-foreground/50 uppercase">N/A</span>
                </div>
                <template v-if="draftProviders[row.provider]?.audio_model !== null && draftProviders[row.provider]?.audio_model !== undefined">
                  <div class="space-y-1">
                    <label class="block font-cinzel text-[10px] tracking-wider text-muted-foreground">Model</label>
                    <input
                      v-model="draftProviders[row.provider].audio_model"
                      :list="`audio-models-${row.provider}`"
                      type="text"
                      class="w-full bg-background border border-border rounded px-2.5 py-1.5 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                      placeholder="e.g. lyria-3-clip-preview"
                    />
                    <datalist :id="`audio-models-${row.provider}`">
                      <option v-for="m in providerModelOptions[row.provider]" :key="m" :value="m" />
                    </datalist>
                  </div>
                  <div class="space-y-1">
                    <label class="block font-cinzel text-[10px] tracking-wider text-muted-foreground">Multiplier</label>
                    <input
                      v-model.number="draftProviders[row.provider].audio_multiplier"
                      type="number" step="0.1" min="0.1"
                      class="w-full bg-background border border-border rounded px-2.5 py-1.5 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                      placeholder="1.0"
                    />
                  </div>
                </template>
              </div>
            </div>

            <!-- Model API Costs -->
            <div v-if="modelsByProvider[row.provider]?.length" class="border-t border-border pt-4 space-y-2">
              <span class="font-cinzel text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Model API Costs</span>
              <div class="space-y-1.5">
                <div
                  v-for="m in modelsByProvider[row.provider]"
                  :key="m.model"
                  class="flex flex-wrap items-center gap-x-3 gap-y-1.5 p-2 rounded bg-muted/30"
                >
                  <!-- Model name + type badge -->
                  <span class="font-mono text-xs text-foreground truncate w-36 shrink-0">{{ m.model }}</span>
                  <span
                    class="font-cinzel text-[9px] tracking-wider px-1.5 py-0.5 rounded shrink-0"
                    :class="{
                      'text-sky-400 bg-sky-400/10':    m.model_type === 'text',
                      'text-violet-400 bg-violet-400/10': m.model_type === 'image',
                      'text-amber-400 bg-amber-400/10':  m.model_type === 'audio',
                    }"
                  >{{ m.model_type.toUpperCase() }}</span>

                  <!-- Cost fields -->
                  <template v-if="m.model_type === 'text'">
                    <div class="flex items-center gap-1 shrink-0">
                      <span class="font-cinzel text-[9px] text-muted-foreground">TXT-IN $</span>
                      <input
                        v-model.number="draftModelPricing[m.model].input_cost_per_million_tokens"
                        type="number" step="0.001" min="0"
                        class="w-16 bg-background border border-border rounded px-1.5 py-0.5 font-mono text-xs text-foreground text-right focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                      <span class="font-cinzel text-[9px] text-muted-foreground">/M</span>
                    </div>
                    <div class="flex items-center gap-1 shrink-0">
                      <span class="font-cinzel text-[9px] text-muted-foreground">OUT $</span>
                      <input
                        v-model.number="draftModelPricing[m.model].output_cost_per_million_tokens"
                        type="number" step="0.001" min="0"
                        class="w-16 bg-background border border-border rounded px-1.5 py-0.5 font-mono text-xs text-foreground text-right focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                      <span class="font-cinzel text-[9px] text-muted-foreground">/M</span>
                    </div>
                  </template>
                  <template v-else-if="m.model_type === 'image'">
                    <div class="flex items-center gap-1 shrink-0">
                      <span class="font-cinzel text-[9px] text-muted-foreground">TXT-IN $</span>
                      <input
                        v-model.number="draftModelPricing[m.model].input_cost_per_million_tokens"
                        type="number" step="0.001" min="0"
                        class="w-14 bg-background border border-border rounded px-1.5 py-0.5 font-mono text-xs text-foreground text-right focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                      <span class="font-cinzel text-[9px] text-muted-foreground">/M</span>
                    </div>
                    <div class="flex items-center gap-1 shrink-0">
                      <span class="font-cinzel text-[9px] text-muted-foreground">IMG-IN $</span>
                      <input
                        v-model.number="draftModelPricing[m.model].image_input_cost_per_million_tokens"
                        type="number" step="0.001" min="0"
                        class="w-14 bg-background border border-border rounded px-1.5 py-0.5 font-mono text-xs text-foreground text-right focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                      <span class="font-cinzel text-[9px] text-muted-foreground">/M</span>
                    </div>
                    <div class="flex items-center gap-1 shrink-0">
                      <span class="font-cinzel text-[9px] text-muted-foreground">IMG-OUT $</span>
                      <input
                        v-model.number="draftModelPricing[m.model].image_output_cost_per_million_tokens"
                        type="number" step="0.001" min="0"
                        class="w-14 bg-background border border-border rounded px-1.5 py-0.5 font-mono text-xs text-foreground text-right focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                      <span class="font-cinzel text-[9px] text-muted-foreground">/M</span>
                    </div>
                  </template>
                  <template v-else>
                    <!-- audio: flat per-generation cost -->
                    <div class="flex items-center gap-1 shrink-0">
                      <span class="font-cinzel text-[9px] text-muted-foreground">PER GEN $</span>
                      <input
                        v-model.number="draftModelPricing[m.model].cost_per_image_usd"
                        type="number" step="0.001" min="0"
                        class="w-20 bg-background border border-border rounded px-1.5 py-0.5 font-mono text-xs text-foreground text-right focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    </div>
                    <span class="font-cinzel text-[9px] text-amber-400/60 shrink-0">est.</span>
                  </template>

                  <!-- Usage (all-time) -->
                  <span class="flex-1 text-right font-fell text-[10px] text-muted-foreground/50 whitespace-nowrap min-w-24">
                    <template v-if="modelStatsByModel[m.model]">
                      {{ modelStatsByModel[m.model].count }} gen · ~${{ modelStatsByModel[m.model].estimated_cost_usd.toFixed(2) }}
                    </template>
                    <template v-else>no usage yet</template>
                  </span>

                  <!-- Last verified -->
                  <span class="font-cinzel text-[9px] text-muted-foreground/40 shrink-0 text-right w-16">
                    {{ draftModelPricing[m.model]?.last_verified_at ? new Date(draftModelPricing[m.model].last_verified_at!).toLocaleDateString() : 'never' }}
                  </span>

                  <!-- Save (marks verified) -->
                  <button
                    class="px-2 py-0.5 font-cinzel text-[9px] font-semibold tracking-wider bg-primary text-primary-foreground rounded hover:opacity-90 disabled:opacity-50 transition-opacity shrink-0"
                    :disabled="modelPricingSaving[m.model]"
                    @click="saveModelPricing(m.model, row.provider, m.model_type)"
                  >
                    {{ modelPricingSaving[m.model] ? '…' : 'Save' }}
                  </button>
                </div>
              </div>
            </div>

            </template><!-- /isKeySet -->

          </div>
        </div>
      </template>

    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { IconAdd, IconAddUser, IconCheck, IconCoins, IconCopy, IconDelete, IconDocument, IconGridView, IconHide, IconLibrary, IconParty, IconReveal, IconSettings, IconTag, IconUpload } from '@/lib/icons';
import { useAdminPlans } from "@/composables/useAdminPlans";
import { useAdminUsers } from "@/composables/useAdminUsers";
import { useAdminPrompts } from "@/composables/useAdminPrompts";
import { useAdminPricing } from "@/composables/useAdminPricing";
import { useCheckoutConfig } from "@/composables/useCheckoutConfig";
import type { CreditPackConfig, GenerationCreditCost } from "@/composables/useAdminPricing";
import type { AiSystemPrompt } from "@/composables/useAdminPrompts";
import type { Plan, QuotaResource, PlanId } from "@/types/subscription.types";
import { useAppInvites, useCreateAppInvite, useDeleteAppInvite } from "@/composables/useAppInvites";
import type { AppInvite, GrantedPlan } from "@/composables/useAppInvites";
import { useBulkPublishSrdArtDefaults, useSrdArtDefaultStats, useSyncSrdSpellArtToSharedTable } from "@/composables/useSrdArtDefaults";
import type { SrdArtDefaultStats } from "@/composables/useSrdArtDefaults";
import { useBulkMarkSrdMonsterArtAsCanonical, useSyncSrdArtToSharedTable } from "@/composables/useSrdMonsterArt";
import SrdArtRepairPanel from "@/components/admin/SrdArtRepairPanel.vue";
import { useBulkMarkSrdSpellArtAsCanonical } from "@/composables/useSrdSpellArt";
import { useAiUsageStats } from "@/composables/useAiUsageStats";
import { useAdminKeys, PROVIDERS } from "@/composables/useAdminKeys";
import type { KeyProvider } from "@/composables/useAdminKeys";
import { useAdminProviders, PROVIDER_LABELS } from "@/composables/useAdminProviders";
import type { ProviderConfig } from "@/composables/useAdminProviders";
import { useAdminCalibration } from "@/composables/useAdminCalibration";
import type { CalibrationHint } from "@/composables/useAdminCalibration";
import { useAdminModelPricing } from "@/composables/useAdminModelPricing";
import { useProviderModels } from "@/composables/useProviderModels";
import type { ModelStat } from "@/composables/useAiUsageStats";
import { useAdminPlaceholderFocalPoints } from "@/composables/useAdminPlaceholderFocalPoints";

const route = useRoute();
const router = useRouter();

type TabId = "plans" | "users" | "invites" | "content" | "pricing" | "credits" | "prompts" | "providers";
const VALID_TABS = new Set<string>(["plans", "users", "invites", "content", "pricing", "credits", "prompts", "providers"]);
const TABS = [
  { id: "plans"     as TabId, label: "Plans",     icon: IconGridView },
  { id: "users"     as TabId, label: "Users",     icon: IconParty },
  { id: "invites"   as TabId, label: "Invites",   icon: IconAddUser },
  { id: "content"   as TabId, label: "Content",   icon: IconLibrary },
  { id: "pricing"   as TabId, label: "Pricing",   icon: IconTag },
  { id: "credits"   as TabId, label: "Credits",   icon: IconCoins },
  { id: "prompts"   as TabId, label: "Prompts",   icon: IconDocument },
  { id: "providers" as TabId, label: "Providers", icon: IconSettings },
];

const activeTab = computed<TabId>(() => {
  const q = route.query.tab;
  // 'keys' tab was merged into 'providers'
  if (q === "keys") return "providers";
  return VALID_TABS.has(q as string) ? (q as TabId) : "plans";
});

function setTab(id: TabId) {
  router.replace({ query: { ...route.query, tab: id } });
}

// ── Plans ──────────────────────────────────────────────────────────────────
const { LABELS, updateQuotas, syncPlanPrices: syncPlanPricesMutation, ...plansQuery } = useAdminPlans();

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

type PlanPriceDraft = { monthlyPriceId: string; annualPriceId: string };
const draftPlanPrices = reactive<Record<string, PlanPriceDraft>>({});
const planPriceSyncing = reactive<Record<string, boolean>>({});

watch(
  () => plansQuery.data.value,
  (plans) => {
    if (!plans) return;
    for (const plan of plans) {
      if (plan.id !== "free" && !(plan.id in draftPlanPrices)) {
        draftPlanPrices[plan.id] = {
          monthlyPriceId: plan.stripe_price_id ?? "",
          annualPriceId: plan.stripe_annual_price_id ?? "",
        };
      }
    }
  },
  { immediate: true },
);

async function syncPlanPrices(planId: string) {
  planPriceSyncing[planId] = true;
  const draft = draftPlanPrices[planId];
  try {
    await syncPlanPricesMutation.mutateAsync({
      planId,
      monthlyPriceId: draft.monthlyPriceId.trim() || undefined,
      annualPriceId: draft.annualPriceId.trim() || undefined,
    });
  } finally {
    planPriceSyncing[planId] = false;
  }
}

// ── Users ──────────────────────────────────────────────────────────────────────
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

// ── Platform API Keys ──────────────────────────────────────────────────────
const { keysQuery, setKey, clearKey } = useAdminKeys();
const keyDrafts = reactive<Record<KeyProvider, string>>({} as Record<KeyProvider, string>);
const keyVisible = reactive<Record<KeyProvider, boolean>>({} as Record<KeyProvider, boolean>);
const keySaving = reactive<Record<KeyProvider, boolean>>({} as Record<KeyProvider, boolean>);
const keyClearing = reactive<Record<KeyProvider, boolean>>({} as Record<KeyProvider, boolean>);

function isKeySet(provider: KeyProvider): boolean {
  return !!(keysQuery.data.value ?? []).find((r) => r.provider === provider);
}
function keyUpdatedAt(provider: KeyProvider): string | null {
  const row = (keysQuery.data.value ?? []).find((r) => r.provider === provider);
  return row?.updated_at ?? null;
}

async function saveKey(provider: KeyProvider) {
  const val = keyDrafts[provider]?.trim();
  if (!val) return;
  keySaving[provider] = true;
  try {
    await setKey.mutateAsync({ provider, plaintext: val });
    keyDrafts[provider] = "";
  } finally {
    keySaving[provider] = false;
  }
}

async function doClrKey(provider: KeyProvider) {
  keyClearing[provider] = true;
  try {
    await clearKey.mutateAsync(provider);
  } finally {
    keyClearing[provider] = false;
  }
}

// ── AI Usage Stats ─────────────────────────────────────────────────────────
const usageStats = useAiUsageStats();

// ── Pricing ────────────────────────────────────────────────────────────────
const pricingQuery = useAdminPricing();
const calibrationQuery = useAdminCalibration();

const CALIBRATION_THRESHOLD = 0.20;

const calibrationHints = computed(() => {
  const map: Record<string, CalibrationHint> = {};
  for (const h of calibrationQuery.data.value ?? []) {
    map[h.generation_type] = h;
  }
  return map;
});

type CalibrationStatus = "ok" | "under" | "over";

function calibrationStatus(hint: CalibrationHint): CalibrationStatus {
  if (hint.suggested_cost === null) return "ok";
  const deviation = (hint.current_cost - hint.suggested_cost) / hint.suggested_cost;
  if (deviation < 0) return "under";                    // any loss is red, no buffer
  if (deviation > CALIBRATION_THRESHOLD) return "over"; // steep margin only flagged past threshold
  return "ok";
}
const checkoutConfig = useCheckoutConfig();

type PackDraft = { credits: number; stripe_price_id: string };
const draftPacks = reactive<Record<string, PackDraft>>({});
const packSaving = reactive<Record<string, boolean>>({});

watch(
  () => pricingQuery.packs.data.value,
  (packs) => {
    if (!packs) return;
    for (const p of packs) {
      if (!(p.pack_id in draftPacks)) {
        draftPacks[p.pack_id] = { credits: p.credits, stripe_price_id: p.stripe_price_id ?? "" };
      }
    }
  },
  { immediate: true },
);

async function savePack(pack: CreditPackConfig) {
  packSaving[pack.pack_id] = true;
  const draft = draftPacks[pack.pack_id];
  try {
    const priceId = draft.stripe_price_id.trim();
    if (priceId) {
      await pricingQuery.syncStripePrice.mutateAsync({
        packId: pack.pack_id,
        stripePriceId: priceId,
        credits: draft.credits,
      });
    } else {
      await pricingQuery.updatePack.mutateAsync({
        pack_id: pack.pack_id,
        credits: draft.credits,
      });
    }
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

// ── Provider Config ────────────────────────────────────────────────────────
const { query: providersQuery, update: updateProvider } = useAdminProviders();

type ProviderDraft = Omit<ProviderConfig, "updated_at">;
const draftProviders = reactive<Record<string, ProviderDraft>>({});
const providerSaving = reactive<Record<string, boolean>>({});

watch(
  () => providersQuery.data.value,
  (rows) => {
    if (!rows) return;
    for (const r of rows) {
      if (!(r.provider in draftProviders)) {
        draftProviders[r.provider] = {
          provider:         r.provider,
          text_model:       r.text_model,
          image_model:      r.image_model,
          audio_model:      r.audio_model,
          text_multiplier:  r.text_multiplier,
          image_multiplier: r.image_multiplier,
          audio_multiplier: r.audio_multiplier,
          text_enabled:     r.text_enabled,
          image_enabled:    r.image_enabled,
          audio_enabled:    r.audio_enabled,
        };
      }
    }
  },
  { immediate: true },
);

async function saveProvider(provider: string) {
  providerSaving[provider] = true;
  try {
    await updateProvider.mutateAsync(draftProviders[provider]);
  } finally {
    providerSaving[provider] = false;
  }
}

// ── Provider Models (for model picker datalists) ───────────────────────────
const onProvidersTab = computed(() => activeTab.value === "providers");
const openaiModelList    = useProviderModels("openai",    onProvidersTab);
const anthropicModelList = useProviderModels("anthropic", onProvidersTab);
const geminiModelList    = useProviderModels("gemini",    onProvidersTab);

const providerModelOptions = computed<Record<string, string[]>>(() => ({
  openai:    openaiModelList.data.value    ?? [],
  anthropic: anthropicModelList.data.value ?? [],
  gemini:    geminiModelList.data.value    ?? [],
  falai:     [],
}));

// ── Model Pricing ──────────────────────────────────────────────────────────
const modelPricingQuery = useAdminModelPricing();

type ModelPricingDraft = {
  input_cost_per_million_tokens: number | null;
  output_cost_per_million_tokens: number | null;
  image_input_cost_per_million_tokens: number | null;
  image_output_cost_per_million_tokens: number | null;
  cost_per_image_usd: number | null;
  last_verified_at: string | null;
};
const draftModelPricing = reactive<Record<string, ModelPricingDraft>>({});
const modelPricingSaving = reactive<Record<string, boolean>>({});

// Merge provider config models + existing pricing data into drafts.
// Source of truth for which models appear: what's currently SET in provider_config.
watch(
  [() => providersQuery.data.value, () => modelPricingQuery.query.data.value],
  ([providers, pricingRows]) => {
    const pricingByModel = new Map((pricingRows ?? []).map((r) => [r.model, r]));
    for (const p of providers ?? []) {
      const entries = [
        [p.text_model,  "text"],
        [p.image_model, "image"],
        [p.audio_model, "audio"],
      ] as const;
      for (const [model, _type] of entries) {
        if (!model || model in draftModelPricing) continue;
        const pricing = pricingByModel.get(model);
        draftModelPricing[model] = {
          input_cost_per_million_tokens:        pricing?.input_cost_per_million_tokens        ?? null,
          output_cost_per_million_tokens:       pricing?.output_cost_per_million_tokens       ?? null,
          image_input_cost_per_million_tokens:  pricing?.image_input_cost_per_million_tokens  ?? null,
          image_output_cost_per_million_tokens: pricing?.image_output_cost_per_million_tokens ?? null,
          cost_per_image_usd:                   pricing?.cost_per_image_usd                   ?? null,
          last_verified_at:                     pricing?.last_verified_at                     ?? null,
        };
      }
    }
  },
  { immediate: true },
);

interface ModelConfigItem { model: string; model_type: "text" | "image" | "audio" }

// Derived from currently configured models in provider_config (not from ai_model_pricing).
// Each set model appears here; cost fields are empty until the admin saves pricing for it.
const modelsByProvider = computed(() => {
  const map: Record<string, ModelConfigItem[]> = {};
  for (const [provider, draft] of Object.entries(draftProviders)) {
    if (!draft) continue;
    const items: ModelConfigItem[] = [];
    if (draft.text_model)  items.push({ model: draft.text_model,  model_type: "text" });
    if (draft.image_model) items.push({ model: draft.image_model, model_type: "image" });
    if (draft.audio_model) items.push({ model: draft.audio_model, model_type: "audio" });
    if (items.length) map[provider] = items;
  }
  return map;
});

async function saveModelPricing(model: string, provider: string, model_type: "text" | "image" | "audio") {
  modelPricingSaving[model] = true;
  try {
    await modelPricingQuery.upsert.mutateAsync({
      model,
      provider,
      model_type,
      ...draftModelPricing[model],
      last_verified_at: new Date().toISOString(),
    });
    draftModelPricing[model].last_verified_at = new Date().toISOString();
  } finally {
    modelPricingSaving[model] = false;
  }
}

const modelStatsByModel = computed(() => {
  const map: Record<string, ModelStat> = {};
  for (const s of usageStats.modelStats.value) {
    map[s.model] = s;
  }
  return map;
});

// ── Placeholder Focal Points ────────────────────────────────────────────────
const PLACEHOLDER_ENTITIES = [
  { type: "background",     label: "Background",      aspect: "aspect-3/4" },
  { type: "character",      label: "Character",       aspect: "aspect-3/4" },
  { type: "companion",      label: "Companion",       aspect: "aspect-3/4" },
  { type: "deity",          label: "Deity",           aspect: "aspect-3/4" },
  { type: "dungeonfeature", label: "Dungeon Feature", aspect: "aspect-square" },
  { type: "enigma",         label: "Puzzle (Enigma)", aspect: "aspect-square" },
  { type: "faction",        label: "Faction",         aspect: "aspect-square" },
  { type: "item",           label: "Item",            aspect: "aspect-3/4" },
  { type: "location",       label: "Location",        aspect: "aspect-3/4" },
  { type: "monster",        label: "Monster",         aspect: "aspect-3/4" },
  { type: "npc",            label: "NPC",             aspect: "aspect-3/4" },
  { type: "species",        label: "Species",         aspect: "aspect-square" },
  { type: "spell",          label: "Spell",           aspect: "aspect-3/4" },
  { type: "trap",           label: "Trap",            aspect: "aspect-square" },
] as const;

const { query: placeholderFpQuery, mutation: placeholderFpMutation } = useAdminPlaceholderFocalPoints();
const placeholderFocalPoints = computed(() => placeholderFpQuery.data.value ?? {});
const placeholderFpSaved = ref<string | null>(null);

function handlePlaceholderFpClick(event: MouseEvent, entityType: string) {
  const el = event.currentTarget as HTMLElement;
  const rect = el.getBoundingClientRect();
  const x = Math.round(((event.clientX - rect.left) / rect.width) * 100);
  const y = Math.round(((event.clientY - rect.top) / rect.height) * 100);
  placeholderFpMutation.mutate(
    { entityType, fp: { x, y } },
    {
      onSuccess: () => {
        placeholderFpSaved.value = entityType;
        setTimeout(() => { placeholderFpSaved.value = null; }, 1200);
      },
    },
  );
}
</script>
