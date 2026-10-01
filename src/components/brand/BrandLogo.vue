<template>
  <!-- The Dungeon Grimoire lockup (bookmark + wordmark). Two raster masters,
       one for light grounds and one for dark, picked by the active theme's
       mode. Size it with a height or width class on the component. -->
  <img
    :src="isDark ? '/brand/logo-dark.webp' : '/brand/logo-light.webp'"
    alt="Dungeon Grimoire"
    width="960"
    height="222"
    class="block h-auto max-w-full select-none"
    draggable="false"
  />
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useTheme } from "@/composables/useTheme";
import { THEMES } from "@/lib/themes";

const { activeThemeId } = useTheme();
const isDark = computed(() => THEMES.find((t) => t.id === activeThemeId.value)?.mode === "dark");
</script>
