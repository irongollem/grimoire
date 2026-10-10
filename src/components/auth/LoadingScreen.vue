<template>
  <!-- Drawn identically by the static boot splash in index.html, which shows
       until Vue mounts; keep the two in step, escape hatch included. -->
  <div class="loading-screen">
    <BrandLogo class="loading-logo" />
    <BannerLoader class="h-26" />
    <div v-if="stuck" class="loading-stuck">
      <p class="text-body text-muted-foreground">Taking longer than it should.</p>
      <AppButton variant="outline" :loading="reloading" @click="reload">Reload</AppButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import BannerLoader from "@/components/brand/BannerLoader.vue";
import BrandLogo from "@/components/brand/BrandLogo.vue";
import { reloadApp } from "@/composables/useAppUpdate";

/**
 * The way out of a boot that never finishes, after the static splash has
 * handed over to this screen. An installed app has no reload button of its
 * own, so without this a hung boot (an auth refresh that never answers, a
 * campaign read that never settles) could only be escaped by killing the app.
 */
const STUCK_AFTER_MS = 12_000;

const stuck = ref(false);
const reloading = ref(false);
const timer = setTimeout(() => (stuck.value = true), STUCK_AFTER_MS);
onBeforeUnmount(() => clearTimeout(timer));

/** Shows the button busy while reloadApp waits out a worker install in progress. */
function reload() {
  reloading.value = true;
  void reloadApp();
}
</script>

<style scoped>
.loading-screen {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2.5rem;
  background-color: var(--background);
  z-index: 9999;
}

.loading-logo {
  width: min(26rem, 80vw);
}

.loading-stuck {
  position: absolute;
  bottom: max(3rem, env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
}
</style>
