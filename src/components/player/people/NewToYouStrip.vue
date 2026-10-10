<template>
  <HearthSection v-if="items.length" title="New to you">
    <template #end>
      <span class="text-caption font-semibold text-foreground">{{ items.length }}</span>
    </template>

    <ul class="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pt-1 pb-2">
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
import HearthSection from "@/components/player/hearth/HearthSection.vue";
import NewToYouCard from "@/components/player/people/NewToYouCard.vue";
import type {
  NewToYouCover,
  NewToYouKind,
  NewToYouPerson,
} from "@/components/player/people/NewToYouCard.vue";
import { useAbove } from "@/composables/useBreakpoint";

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
</script>
