<template>
  <!-- Drawn identically by the static boot splash in index.html, which shows
       until Vue mounts; keep the two in step. -->
  <div class="loading-screen">
    <BrandLogo class="loading-logo" />
    <BannerLoader :width="44" />
  </div>
</template>

<script setup lang="ts">
import BannerLoader from "@/components/brand/BannerLoader.vue";
import BrandLogo from "@/components/brand/BrandLogo.vue";
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
</style>
