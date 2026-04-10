<template>
  <LoadingScreen v-if="!auth.initialized" />
  <template v-else>
    <component :is="layout">
      <RouterView />
    </component>
    <ConfirmDialog />
  </template>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useQueryClient } from "@tanstack/vue-query";
import DefaultLayout from "@/layouts/DefaultLayout.vue";
import AuthLayout from "@/layouts/AuthLayout.vue";
import PlayerLayout from "@/layouts/PlayerLayout.vue";
import ConfirmDialog from "@/components/common/ConfirmDialog.vue";
import LoadingScreen from "@/components/auth/LoadingScreen.vue";
import { useTheme } from "@/composables/useTheme";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/auth";

const auth = useAuthStore();
const router = useRouter();

useTheme().initTheme();

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
  return DefaultLayout;
});
</script>
