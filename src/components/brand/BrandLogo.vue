<template>
  <!-- The Dungeon Grimoire lockup (bookmark + wordmark). Two raster masters,
       one for light grounds and one for dark, picked by the ground it sits
       on. Size it with a height or width class on the component. -->
  <img
    :src="isDark ? '/brand/logo-dark.webp' : '/brand/logo-light.webp'"
    alt="Dungeon Grimoire"
    width="960"
    height="222"
    class="block max-w-full select-none"
    draggable="false"
  />
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { useTheme } from "@/composables/useTheme";
import { THEMES } from "@/lib/themes";

const { activeThemeId } = useTheme();
const route = useRoute();
// A darkChrome route (the Hall of the Fallen) paints the bars in the theme's dark twin
// whatever the viewer's mode, so the lockup on them is the dark one too.
const isDark = computed(
  () => route.meta.darkChrome === true || THEMES.find((t) => t.id === activeThemeId.value)?.mode === "dark",
);
</script>
