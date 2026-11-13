<template>
  <!--
    The strip under a sheet's header in low art (#1179): the status and
    relationship chips, the place, the tags and the alter-ego note, which sat
    under the portrait before. One line, wrapping when it must. Put those in the
    default slot; give `portrait` the record's OWN picture (never a placeholder)
    and a dashed Portrait button ends the line.
  -->
  <div class="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-border pt-2.5 pb-3 text-label">
    <slot />
    <PortraitOnRequest v-if="portrait" :src="portrait" :alt="portraitAlt" />
  </div>
</template>

<script setup lang="ts">
import PortraitOnRequest from "@/components/common/media/PortraitOnRequest.vue";

defineProps<{
  portrait?: string | null;
  portraitAlt?: string;
}>();

defineSlots<{ default?: () => unknown }>();
</script>
