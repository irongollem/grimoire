<template>
  <!--
    The web's side panel. A right-hand sheet from tablet up and a bottom sheet on a
    phone, floating over the graph so the graph never resizes under the reader.
  -->
  <aside
    data-slip
    class="absolute z-20 flex flex-col overflow-y-auto border-border bg-card shadow-xl max-md:inset-x-0 max-md:bottom-0 max-md:max-h-[70%] max-md:border-t md:right-0 md:top-0 md:h-full md:w-80 md:border-l"
    :aria-label="label"
  >
    <slot />
  </aside>
</template>

<script setup lang="ts">
defineProps<{ label: string }>();
</script>
