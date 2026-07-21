<template>
  <div class="flex min-h-screen items-center justify-center bg-background">
    <div class="text-center space-y-3">
      <LoadingSpinner />
      <p class="text-body text-muted-foreground italic">
        {{ error ? error : "Connecting to Spotify…" }}
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
import { exchangeCode } from "@/lib/spotifyAuth";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";

const router = useRouter();
const route = useRoute();
const error = ref("");

onMounted(async () => {
  const code = route.query.code as string | undefined;
  const errorParam = route.query.error as string | undefined;

  if (errorParam) {
    error.value = `Spotify denied access: ${errorParam}`;
    return;
  }

  if (!code) {
    error.value = "Missing authorisation code.";
    return;
  }

  const tokens = await exchangeCode(code);
  if (!tokens) {
    error.value = "Token exchange failed. Please try again.";
    return;
  }

  router.replace({ name: "soundboard" });
});
</script>
