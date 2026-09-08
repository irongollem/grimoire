<template>
  <LoadingScreen v-if="showLoading" />
  <template v-else>
    <component :is="layout">
      <RouterView />
    </component>
    <ConfirmDialog />
    <ToastHost />
    <ManualRollPrompt />
    <RollModePicker />
    <FirstRunTour />
    <ImportBundleModal
      v-if="auth.isAuthenticated && bundleImportMounted"
      v-model="bundleImportOpen"
    />
  </template>

  <!-- Pull-to-refresh indicator (touch devices only) -->
  <Transition name="ptr-fade">
    <div
      v-if="pullPx > 0"
      class="ptr-indicator"
      :style="{ '--pull': pullPx + 'px' }"
      :class="{ 'ptr-ready': readyToReload }"
    >
      <span class="ptr-arrow">{{ readyToReload ? '↑' : '↓' }}</span>
      <span class="ptr-label">{{ readyToReload ? 'Release to reload' : 'Pull to reload' }}</span>
    </div>
  </Transition>

  <SpeedInsights />
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useQueryClient } from "@tanstack/vue-query";
import { SpeedInsights } from "@vercel/speed-insights/vue";
import { layoutLoaders } from "@/layouts/layoutLoader";
import ConfirmDialog from "@/components/common/ConfirmDialog.vue";
import ToastHost from "@/components/common/ToastHost.vue";
import ManualRollPrompt from "@/components/common/ManualRollPrompt.vue";
import RollModePicker from "@/components/common/RollModePicker.vue";
import FirstRunTour from "@/components/common/FirstRunTour.vue";
import { pendingBundleFile } from "@/composables/campaign/usePendingBundle";
import { useLazyMount } from "@/composables/useLazyMount";
import LoadingScreen from "@/components/auth/LoadingScreen.vue";
import { useTheme } from "@/composables/useTheme";
import { useAuthStore } from "@/stores/auth";

import { useMediaSession } from "@/composables/soundboard/useMediaSession";
import { useCampaignStore } from "@/stores/campaign";
import { useUiStore } from "@/stores/ui";
import { useCampaignById } from "@/composables/campaign/useCampaigns";
import { usePullToRefresh } from "@/composables/usePullToRefresh";
import { createRealtimeHeal } from "@/lib/realtimeHeal";
import { supabase } from "@/lib/supabase";

const auth = useAuthStore();

// Deferred: the .grimoire import dialog drags useWorldBundle (the whole
// world-bundle serialiser) behind it, and it only ever opens when the OS hands
// us a file or the user picks Import. Most sessions never do either.
const ImportBundleModal = defineAsyncComponent(
  () => import("@/components/campaign/ImportBundleModal.vue"),
);

const bundleImportOpen = ref(false);
const bundleImportMounted = useLazyMount(bundleImportOpen);
watch(pendingBundleFile, (f) => { if (f) bundleImportOpen.value = true; });
const campaignStore = useCampaignStore();
const ui = useUiStore();

// A campaign the current lens does not hold must never become the active one
// (#729). `campaigns_member_select` lets a player read the campaign row of
// every campaign they are in, so before the campaign lists were role-scoped
// the DM slot — and `grimoire_active_campaign` itself — could end up holding a
// campaign this account only plays in, and the DM shell would come up on
// somebody else's game. Fixing the lists stops that being written; this clears
// what a previous build already wrote, on the boot after the update.
//
// `auth.initialize()` loads the membership for exactly the stored campaign id
// before the app mounts, so this is a synchronous check that costs no request
// and leaves no window in which the wrong campaign is briefly live. It acts
// only when the loaded membership is genuinely the one for the active campaign
// and genuinely contradicts the lens: a null membership, a row for some other
// campaign (a `refreshMembership` still in flight) or a mode not yet chosen
// all mean "don't know", and not knowing is never grounds to clear.
watch(
  [() => ui.userMode, () => auth.membership, () => campaignStore.activeCampaignId],
  ([mode, membership, activeId]) => {
    if (mode !== "dm" && mode !== "player") return;
    if (!activeId || membership?.campaign_id !== activeId) return;
    if (membership.role !== mode) campaignStore.clearActiveCampaign();
  },
  { immediate: true },
);

// Eagerly fetch the active campaign so it's hydrated before the app renders.
// Without this, DefaultLayout mounts and CampaignSwitcher/nav queries fire
// before activeCampaign is set, producing a visible "Create your first campaign"
// flash for DMs and missing-data states for players.
// `initialized` only means auth finished *checking* — it is true for a signed-out
// visitor too. `activeCampaignId` outlives the session in localStorage, so gating
// on `initialized` alone had the login screen fetch a campaign that RLS could
// never return: 406, three retries with backoff, and a loading screen held for
// the duration. Anyone returning after their session expired paid ~20s of blank
// page before the login form appeared.
const campaignIdToFetch = computed<string | null>(() => {
  if (!auth.initialized || !auth.isAuthenticated) return null;
  if (campaignStore.activeCampaignId) return campaignStore.activeCampaignId;
  // The fallback membership is whichever campaign was joined first, which is
  // not necessarily one the current lens holds — hydrating it would put the DM
  // shell on a campaign the account merely plays in, the same failure the
  // watcher above undoes.
  const fallback = auth.membership;
  if (!fallback) return null;
  if (ui.userMode && fallback.role !== ui.userMode) return null;
  return fallback.campaign_id;
});

const { data: earlyCampaign, isError: campaignLoadError } = useCampaignById(
  () => campaignIdToFetch.value,
);

// Hold the loading screen until auth is ready AND the active campaign has been
// fetched (if one is expected). This prevents the "Create your first campaign"
// flash that occurs when components mount before activeCampaign is hydrated.
//
// We do NOT gate on `isLoading` here — there is a one-tick window right after
// `auth.initialized` becomes true where TanStack Query has set `enabled = true`
// but hasn't yet set `isFetching = true`. If we gated on `isLoading`, the
// loading screen would briefly vanish during that window, the dashboard would
// mount (showing empty party/quests), and then the loading screen would return
// once fetching starts — causing a remount with a partially-initialised state.
// Instead: keep the screen up as long as a campaign is expected but not loaded,
// and release it on error so a fetch failure doesn't block the app forever.
const showLoading = computed(() => {
  if (import.meta.env.SSR) return false;
  if (!auth.initialized) return true;
  if (campaignIdToFetch.value && !campaignStore.activeCampaign && !campaignLoadError.value) return true;
  return false;
});

watch(
  earlyCampaign,
  (c) => {
    if (!c) return;
    if (!campaignStore.activeCampaignId) campaignStore.activeCampaignId = c.id;
    if (!campaignStore.activeCampaign) campaignStore.switchToCampaign(c);
  },
  { immediate: true },
);
const router = useRouter();
const { pullPx, readyToReload } = usePullToRefresh();

if (!import.meta.env.SSR) useTheme().initTheme();
if (!import.meta.env.SSR) useMediaSession();

// When the Supabase session expires mid-session (refresh token exhausted or
// network failure), onAuthStateChange emits SIGNED_OUT and sets user to null.
// The router guard only runs on navigation, so without this watcher the user
// would stay on the current page with buttons silently failing (401s).
watch(
  () => auth.isAuthenticated,
  (authenticated) => {
    if (!authenticated && route.meta.requiresAuth) {
      router.push({ name: "login", query: { redirect: route.fullPath } });
    }
  },
);

// Nothing in TanStack Query recovers this cache on its own. refetchOnWindowFocus
// is off globally (main.ts) to stop N concurrent queries firing behind the auth
// lock on tab wake, and `networkMode: "always"` — which is there because macOS
// falsely reports offline on tab focus — makes query-core default
// refetchOnReconnect to false as a side effect. So a query that failed while the
// machine was offline stays failed: close the lid for a week and every
// non-realtime view sits on stale or errored data until you navigate.
//
// That is the same event-gap problem createRealtimeHeal already solves for
// Realtime channels, so it governs the query cache too: invalidate when the
// network genuinely returns, or on coming back to a tab that was away long
// enough to have missed something. Its throttle collapses the two signals that
// arrive together on a real wake into one invalidation, which is what keeps this
// from reintroducing the very refetch burst refetchOnWindowFocus was turned off
// to prevent. No channel status is fed in — the wake signals are the whole input.
//
// The wake-up must not race the token refresh (#731). auth-js registers its own
// `visibilitychange` listener at client construction and does the right thing on
// it — `_startAutoRefresh()` plus `_recoverAndRefresh()` — but that work is
// asynchronous, while an `invalidateQueries()` fired from this listener is not.
// Invalidating straight away therefore lost the race every time on a phone: the
// burst went out on an access token that expired while the tab was frozen,
// `_callRefreshToken()` failed against a radio that was not up yet, and because
// that failure is a *retryable fetch* error auth-js kept the session and stayed
// silent — no SIGNED_OUT — while returning `session: null` and caching it under
// REFRESH_FAILURE_COOLDOWN_MS. Every query then resolved with the anon key, RLS
// answered `200 []`, and TanStack cached the emptiness as an answer for exactly
// as long as auth-js refused to retry: both windows are 60s.
//
// So: ask for the session first and only invalidate once it is usable.
// `getSession()`, never `refreshSession()` — see the `autoRefreshToken` note in
// `lib/supabase.ts`. If it is not usable yet there is nothing useful to do here;
// auth-js's ticker keeps trying while the tab is visible, and `main.ts` refetches
// on the TOKEN_REFRESHED that eventually lands.
const queryClient = useQueryClient();

const queryHeal = createRealtimeHeal(
  () => {
    if (!auth.isAuthenticated) return;
    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session?.access_token) return;
      await queryClient.invalidateQueries();
    })();
  },
  { hiddenReconcileMs: 60_000 },
);

onUnmounted(() => queryHeal.detach());

const route = useRoute();

// Async so a DM never ships the player portal and a player never ships the DM
// sidebar/chat. The router preloads the right one during navigation, so by the
// time this renders the chunk is already resolved — see layoutLoader.ts.
const AuthLayout = defineAsyncComponent(layoutLoaders.auth);
const PlayerLayout = defineAsyncComponent(layoutLoaders.player);
const DefaultLayout = defineAsyncComponent(layoutLoaders.default);

const layout = computed(() => {
  if (route.meta.layout === "auth") return AuthLayout;
  if (route.meta.layout === "player") return PlayerLayout;
  return DefaultLayout;
});
</script>

<style scoped>
.ptr-indicator {
  position: fixed;
  top: 0;
  left: 50%;
  transform: translateX(-50%) translateY(calc(var(--pull) - 100%));
  z-index: 9999;
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 1rem;
  border-radius: 0 0 0.625rem 0.625rem;
  background: hsl(var(--primary));
  color: hsl(var(--primary-foreground));
  pointer-events: none;
  white-space: nowrap;
}

.ptr-indicator.ptr-ready {
  background: hsl(var(--primary) / 0.85);
}

.ptr-arrow {
  font-size: 0.875rem;
  transition: transform 0.15s ease;
}

.ptr-ready .ptr-arrow {
  transform: rotate(180deg);
}

.ptr-label {
  font-family: var(--font-cinzel, sans-serif);
  font-size: 0.625rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.ptr-fade-enter-active,
.ptr-fade-leave-active {
  transition: opacity 0.15s ease;
}
.ptr-fade-enter-from,
.ptr-fade-leave-to {
  opacity: 0;
}


</style>
