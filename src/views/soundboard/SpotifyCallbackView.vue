<template>
  <div class="flex min-h-screen items-center justify-center bg-background">
    <div class="text-center space-y-3">
      <LoadingSpinner />
      <p class="text-body text-muted-foreground italic">
        {{ error ? error : "Connecting to Spotify…" }}
      </p>
      <p v-if="error" class="mx-auto max-w-md text-caption text-muted-foreground/70">
        Check that <code>{{ callbackUrl }}</code> is registered as a redirect URI
        on the Spotify app this campaign uses.
      </p>
      <RouterLink
        v-if="error"
        to="/soundboard"
        class="text-caption text-gold-400 hover:text-gold-300 transition-colors"
      >
        Back to Soundboard
      </RouterLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter, useRoute } from "vue-router";
import { exchangeCode } from "@/lib/audio/spotifyAuth";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";

const router = useRouter();
const route = useRoute();
const error = ref("");
// Shown on failure — a redirect-URI mismatch is the most common cause and the
// exact string Spotify needs is not obvious from the dashboard.
const callbackUrl = `${window.location.origin}/spotify/callback`;

onMounted(async () => {
  const code = route.query.code as string | undefined;
  const state = route.query.state as string | undefined;
  const errorParam = route.query.error as string | undefined;

  if (errorParam) {
    error.value = `Spotify denied access: ${errorParam}`;
    return;
  }

  if (!code) {
    error.value = "Missing authorisation code.";
    return;
  }

  try {
    await exchangeCode(code, state);
  } catch (e) {
    // Show what Spotify actually said. "Token exchange failed, try again" sent
    // people round the same loop with no idea the fix was in the dashboard.
    error.value = e instanceof Error ? e.message : "Token exchange failed.";
    return;
  }

  router.replace({ name: "soundboard" });
});
</script>
