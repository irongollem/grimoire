<template>
  <HearthSection v-if="items.length" title="New to you">
    <template #end>
      <!-- A mouse cannot scroll a strip sideways (#1191), so a fine pointer gets
           arrows; touch swipes and needs none. Only while the strip overflows. -->
      <span v-if="overflows" class="hidden items-center gap-1 pointer-fine:flex">
        <AppButton
          variant="subtle"
          size="icon-sm"
          :icon="IconChevronLeft"
          aria-label="Earlier cards"
          :disabled="arrivedState.left"
          @click="page(-1)"
        />
        <AppButton
          variant="subtle"
          size="icon-sm"
          :icon="IconChevronRight"
          aria-label="Later cards"
          :disabled="arrivedState.right"
          @click="page(1)"
        />
      </span>
      <span class="text-caption font-semibold text-foreground">{{ items.length }}</span>
    </template>

    <ul ref="strip" class="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pt-1 pb-2">
      <li v-for="item in items" :key="item.id" class="shrink-0 snap-start">
        <NewToYouCard
          :kind="item.kind"
          :person="item.person"
          :cover="item.cover"
          :place="item.place"
          :size="isMd ? 'md' : 'sm'"
          @turned="emit('turned', item.id)"
          @open="emit('open', item.id)"
        />
      </li>
    </ul>
    <p class="px-1 text-caption italic text-muted-foreground">Tap a card to turn it over.</p>
  </HearthSection>
</template>

<script setup lang="ts">
import { onMounted, onUpdated, ref, useTemplateRef } from "vue";
import { useResizeObserver, useScroll } from "@vueuse/core";
import AppButton from "@/components/common/controls/AppButton.vue";
import HearthSection from "@/components/player/hearth/HearthSection.vue";
import NewToYouCard from "@/components/player/people/NewToYouCard.vue";
import type {
  NewToYouCover,
  NewToYouKind,
  NewToYouPerson,
} from "@/components/player/people/NewToYouCard.vue";
import { useAbove } from "@/composables/useBreakpoint";
import { IconChevronLeft, IconChevronRight } from "@/lib/icons";
import { prefersReducedMotion } from "@/lib/motion";

export interface NewToYouItem {
  id: string;
  kind: NewToYouKind;
  person: NewToYouPerson;
  cover?: NewToYouCover;
  place?: string | null;
}

/** The "New to you" strip: cards waiting to be turned, at the top of People. */
defineProps<{ items: NewToYouItem[] }>();

const emit = defineEmits<{ turned: [id: string]; open: [id: string] }>();

const isMd = useAbove("md");

const strip = useTemplateRef<HTMLElement>("strip");
const { arrivedState } = useScroll(strip);

// Measured after every render (cards come and go) and whenever the strip resizes.
const overflows = ref(false);
function measure() {
  const el = strip.value;
  overflows.value = !!el && el.scrollWidth > el.clientWidth + 1;
}
useResizeObserver(strip, measure);
onMounted(measure);
onUpdated(measure);

/** One strip's width at a time, less a card's worth so the last one seen stays in view. */
function page(direction: 1 | -1) {
  const el = strip.value;
  if (!el) return;
  el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: prefersReducedMotion() ? "auto" : "smooth" });
}
</script>
