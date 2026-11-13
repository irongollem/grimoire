<template>
  <!--
    The Portrait button of a low-art sheet (#1179). Nothing here is an <img>
    until the click, so the picture is not fetched before anyone asks for it.
    `src` must be the record's OWN picture: a record with only the placeholder
    passes null and gets no button, which is the point of the mode.
  -->
  <template v-if="src">
    <AppButton ref="buttonRef" v-bind="$attrs" variant="dashed" size="xs" @click="open">
      <template #icon><IconImage class="size-3.5" aria-hidden="true" /></template>
      {{ label }}
    </AppButton>
    <ImageLightbox v-if="opened" :src="src" :alt="alt" :origin="origin" @close="opened = false" />
  </template>
</template>

<script setup lang="ts">
import { ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import ImageLightbox from "@/components/common/overlays/ImageLightbox.vue";
import { IconImage } from "@/lib/icons";
import type { ModalOrigin } from "@/lib/modalOrigin";

defineOptions({ inheritAttrs: false });

const { label = "Portrait" } = defineProps<{
  /** The record's own picture, never a placeholder. Falsy renders nothing. */
  src?: string | null;
  alt?: string;
  label?: string;
}>();

const buttonRef = ref<{ $el: HTMLElement } | null>(null);
const opened = ref(false);
const origin = ref<ModalOrigin | null>(null);

function open() {
  // Measured on the click so the picture flies out of the button where it is now.
  const rect = buttonRef.value?.$el.getBoundingClientRect();
  origin.value = rect ? { top: rect.top, left: rect.left, width: rect.width, height: rect.height } : null;
  opened.value = true;
}
</script>
