<script setup lang="ts">
import { computed } from "vue";
import { activeThemeId, darkTwinStyle } from "@/lib/themeRuntime";

// The page is a dark desk whatever the viewer's theme, so the app's own controls on it (buttons, the logo) take the
// theme's dark twin, exactly as the Hall of the Fallen's bars do. The desk colour is set inline because the theme's
// own background rule would otherwise paint its paper over it.
const style = computed(() => ({
  ...darkTwinStyle(activeThemeId.value),
  backgroundColor: "#1c1612",
  backgroundImage: "none",
}));
</script>

<template>
  <!-- The shell for pages anyone may open without an account (the Open Book, #1085): no sidebar, no campaign, no
       terms gate. The page owns its whole viewport. -->
  <div class="min-h-dvh text-foreground" :style="style">
    <slot />
  </div>
</template>
