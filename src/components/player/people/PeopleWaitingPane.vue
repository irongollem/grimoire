<template>
  <aside
    class="torn hearth-card flex flex-col items-center justify-center gap-5 rounded-lg px-8 py-10 text-center"
    aria-label="Selected person"
  >
    <!-- The waiting deck: three card backs, fanned. Decoration, so low art drops it (#1179). -->
    <div v-if="count > 0 && !lowArt" class="relative h-44 w-52" aria-hidden="true">
      <img :src="NPC_CARD_BACK" alt="" class="absolute top-4 left-5 h-40 w-27 -rotate-[11deg] rounded-md object-cover" />
      <img :src="NPC_CARD_BACK" alt="" class="absolute top-4 left-20 h-40 w-27 rotate-[9deg] rounded-md object-cover" />
      <img :src="NPC_CARD_BACK" alt="" class="absolute top-1 left-12.5 h-40 w-27 rounded-md object-cover" />
    </div>
    <div class="flex max-w-sm flex-col gap-2">
      <h2 class="m-0 text-heading font-bold text-foreground">{{ title }}</h2>
      <p class="m-0 text-body text-muted-foreground">{{ body }}</p>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useLowArt } from "@/composables/useLowArt";
import { NPC_CARD_BACK } from "@/components/player/people/NewToYouCard.vue";

/**
 * What stands beside the ledger, from lg up, while nobody is selected. The pane
 * never disappears there: an empty right half beside a 28rem column is what the
 * page looked like before, and the layout must not jump when the first card is
 * turned. With people waiting in New to you it shows the deck and says where to
 * start; with none, everyone met is filtered out of the ledger.
 */
const { count } = defineProps<{
  /** People still waiting in New to you. */
  count: number;
}>();

const { lowArt } = useLowArt();

const title = computed(() =>
  count > 0 ? `${count} ${count === 1 ? "person" : "people"} to meet` : "No one matches your filters",
);
const body = computed(() =>
  count > 0
    ? "Turn a card in New to you and they open here, with everything your character has learned about them."
    : "Clear the filters to see everyone in your ledger.",
);
</script>
