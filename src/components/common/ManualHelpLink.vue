<template>
  <RouterLink
    :to="{ path: '/rules', query: { tab: 'manual', page } }"
    class="text-muted-foreground/60 hover:text-foreground focus-visible:text-foreground transition-colors p-0.5"
    :title="tooltip ?? 'Open DM Manual entry'"
  ><IconInfo class="h-3 w-3" /></RouterLink>
</template>

<script setup lang="ts">
import { RouterLink } from "vue-router";
import { IconInfo } from "@/lib/icons";

defineProps<{
  page: string;
  tooltip?: string;
}>();
</script>
