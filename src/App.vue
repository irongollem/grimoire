<template>
  <LoadingScreen v-if="showLoading" />
  <template v-else>
    <component :is="layout">
      <RouterView />
    </component>
    <ConfirmDialog />
    <ToastHost />
    <ManualRollPrompt />
    <ImportBundleModal v-if="auth.isAuthenticated" v-model="bundleImportOpen" />
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
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useQueryClient } from "@tanstack/vue-query";
import DefaultLayout from "@/layouts/DefaultLayout.vue";
import AuthLayout from "@/layouts/AuthLayout.vue";
import PlayerLayout from "@/layouts/PlayerLayout.vue";
import ConfirmDialog from "@/components/common/ConfirmDialog.vue";
import ToastHost from "@/components/common/ToastHost.vue";
import ManualRollPrompt from "@/components/common/ManualRollPrompt.vue";
import ImportBundleModal from "@/components/campaign/ImportBundleModal.vue";
import { pendingBundleFile } from "@/composables/usePendingBundle";
import LoadingScreen from "@/components/auth/LoadingScreen.vue";
import { useTheme } from "@/composables/useTheme";
import { useAuthStore } from "@/stores/auth";

import { useMediaSession } from "@/composables/useMediaSession";
import { useCampaignStore } from "@/stores/campaign";
import { useCampaignById } from "@/composables/useCampaigns";
import { usePullToRefresh } from "@/composables/usePullToRefresh";

const auth = useAuthStore();

const bundleImportOpen = ref(false);
watch(pendingBundleFile, (f) => { if (f) bundleImportOpen.value = true; });
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

// refetchOnWindowFocus is disabled globally (main.ts) to prevent TanStack Query
// from firing N concurrent queries behind the auth lock on tab wake.
// Instead we manually invalidate after a long absence so components get fresh
// data. singleTabLock (supabase.ts) queues auth and DB operations in order
// without a timeout, so autoRefreshToken finishes before queries run — no
// AbortError storms, no explicit session warm-up needed here.
const queryClient = useQueryClient();
let lastHidden = Date.now();

function onVisibilityChange() {
  if (document.visibilityState === "hidden") {
    lastHidden = Date.now();
    return;
  }
  const awayMs = Date.now() - lastHidden;
  if (awayMs < 60_000) return;
  if (!auth.isAuthenticated) return;
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
