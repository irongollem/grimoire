<template>
  <LoadingScreen v-if="showLoading" />
  <template v-else>
    <component :is="layout">
      <RouterView />
    </component>
    <ConfirmDialog />
    <ManualRollPrompt />
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
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useQueryClient } from "@tanstack/vue-query";
import DefaultLayout from "@/layouts/DefaultLayout.vue";
import AuthLayout from "@/layouts/AuthLayout.vue";
import PlayerLayout from "@/layouts/PlayerLayout.vue";
import MarketingLayout from "@/layouts/MarketingLayout.vue";
import ConfirmDialog from "@/components/common/ConfirmDialog.vue";
import ManualRollPrompt from "@/components/common/ManualRollPrompt.vue";
import LoadingScreen from "@/components/auth/LoadingScreen.vue";
import { useTheme } from "@/composables/useTheme";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/auth";
import { useCampaignStore } from "@/stores/campaign";
import { useCampaignById } from "@/composables/useCampaigns";
import { usePullToRefresh } from "@/composables/usePullToRefresh";

const auth = useAuthStore();
const campaignStore = useCampaignStore();

// Eagerly fetch the active campaign so it's hydrated before the app renders.
// Without this, DefaultLayout mounts and CampaignSwitcher/nav queries fire
// before activeCampaign is set, producing a visible "Create your first campaign"
// flash for DMs and missing-data states for players.
const campaignIdToFetch = computed<string | null>(() => {
  if (!auth.initialized) return null;
  return (
    campaignStore.activeCampaignId ??
    auth.membership?.campaign_id ??
    null
  );
});

const { data: earlyCampaign, isLoading: campaignFetching } = useCampaignById(
  () => campaignIdToFetch.value,
);

// Hold the loading screen until auth is ready AND the active campaign has been
// fetched (if one is expected). This prevents the "Create your first campaign"
// flash that occurs when components mount before activeCampaign is hydrated.
const showLoading = computed(() => {
  if (import.meta.env.SSR) return false;
  return (
    !auth.initialized ||
    (!!campaignIdToFetch.value &&
      !campaignStore.activeCampaign &&
      campaignFetching.value)
  );
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

// refetchOnWindowFocus is disabled globally (main.ts) to prevent TanStack Query
// from independently queuing DB calls behind the navigator.locks auth refresh on
// tab wake — which caused infinite spinners with no network activity.
//
// Instead we manually invalidate queries here, after confirming the session is
// warm. For long absences we race the warm-up against a timeout: if the auth lock
// is stuck (network down / hanging refresh), we reload the page rather than let
// the user sit on a frozen screen.
const queryClient = useQueryClient();
let lastHidden = Date.now();

async function onVisibilityChange() {
  if (document.visibilityState === "hidden") {
    lastHidden = Date.now();
    return;
  }

  const awayMs = Date.now() - lastHidden;
  if (awayMs < 60_000) {
    // Short absence — staleTime (60s) handles freshness, no forced invalidation.
    // Calling invalidateQueries() here would burst N concurrent Supabase calls,
    // all serializing through navigator.locks, blocking any subsequent navigation.
    return;
  }

  // Long absence — the JWT may have expired. Warm the session first so that
  // every query fires with a valid token instead of queuing behind the lock.
  const TIMEOUT_MS = 8_000;
  const timedOut = await Promise.race([
    supabase.auth.getSession().then(() => false),
    new Promise<true>((resolve) => setTimeout(() => resolve(true), TIMEOUT_MS)),
  ]);

  if (timedOut) {
    window.location.reload();
    return;
  }

  queryClient.invalidateQueries();
}

onMounted(() =>
  document.addEventListener("visibilitychange", onVisibilityChange),
);
onUnmounted(() =>
  document.removeEventListener("visibilitychange", onVisibilityChange),
);

const route = useRoute();

const layout = computed(() => {
  if (route.meta.layout === "auth") return AuthLayout;
  if (route.meta.layout === "player") return PlayerLayout;
  if (route.meta.layout === "marketing") return MarketingLayout;
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
  gap: 6px;
  padding: 6px 16px;
  border-radius: 0 0 10px 10px;
  background: hsl(var(--primary));
  color: hsl(var(--primary-foreground));
  pointer-events: none;
  white-space: nowrap;
}

.ptr-indicator.ptr-ready {
  background: hsl(var(--primary) / 0.85);
}

.ptr-arrow {
  font-size: 14px;
  transition: transform 0.15s ease;
}

.ptr-ready .ptr-arrow {
  transform: rotate(180deg);
}

.ptr-label {
  font-family: var(--font-cinzel, sans-serif);
  font-size: 10px;
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
