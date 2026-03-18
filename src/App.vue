<template>
  <component :is="layout">
    <RouterView />
  </component>
  <ConfirmDialog />
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import DefaultLayout from "@/layouts/DefaultLayout.vue";
import AuthLayout from "@/layouts/AuthLayout.vue";
import PlayerLayout from "@/layouts/PlayerLayout.vue";
import ConfirmDialog from "@/components/common/ConfirmDialog.vue";
import { useTheme } from "@/composables/useTheme";

useTheme().initTheme();

const route = useRoute();

const layout = computed(() => {
  if (route.meta.layout === "auth") return AuthLayout;
  if (route.meta.layout === "player") return PlayerLayout;
  return DefaultLayout;
});
</script>
