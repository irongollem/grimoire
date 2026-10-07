<template>
  <!--
    The three prose sections of an NPC's read view. Shared by the desktop tab and
    the phone accordion, which had each carried an identical copy.

    `full` is the record read by id. Until it arrives only the slim list row is
    known, and a row without prose must not read as "nothing written": that would
    flash "No lore recorded" over an NPC who has pages of it (#999). So this waits,
    in a block tall enough that the text arriving does not shift what is below.
  -->
  <div v-if="!full" class="flex min-h-40 items-center justify-center" data-testid="npc-lore-loading">
    <BannerLoader class="h-8" />
  </div>
  <div v-else class="flex flex-col gap-4" data-testid="npc-lore">
    <div v-if="full.appearance" class="flex flex-col gap-1">
      <h3 class="text-label-lg font-bold text-primary uppercase">Appearance</h3>
      <RichTextViewer :content="full.appearance" />
    </div>
    <div v-if="full.personality" class="flex flex-col gap-1">
      <h3 class="text-label-lg font-bold text-primary uppercase">Personality</h3>
      <RichTextViewer :content="full.personality" />
    </div>
    <div v-if="full.backstory" class="flex flex-col gap-1">
      <h3 class="text-label-lg font-bold text-primary uppercase">Backstory</h3>
      <RichTextViewer :content="full.backstory" />
    </div>
    <p
      v-if="!full.appearance && !full.personality && !full.backstory"
      class="text-body text-muted-foreground italic"
    >
      No lore recorded for this NPC.
    </p>
  </div>
</template>

<script setup lang="ts">
import BannerLoader from "@/components/brand/BannerLoader.vue";
import RichTextViewer from "@/components/common/RichTextViewer.vue";
import type { Npc } from "@/types/npc.types";

defineProps<{
  /** The full record; absent while only the list row has arrived. */
  full?: Npc;
}>();
</script>
