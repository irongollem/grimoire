<template>
  <li class="flex flex-col gap-2 border-b border-border px-4 py-3 last:border-b-0 sm:flex-row sm:items-start sm:gap-3" :data-review="review" data-testid="table-fact">
    <div class="flex min-w-0 flex-1 flex-col gap-1">
      <p class="m-0 text-body" :class="review === 'struck' || review === 'corrected' ? 'text-muted-foreground line-through decoration-1' : 'text-foreground'">{{ fact.body }}</p>
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-muted-foreground">
        <template v-if="review === 'struck'">
          <span class="font-semibold text-destructive" data-testid="table-fact-struck">Struck</span>
          <span>It never happened: the Narrator will not use it again.</span>
        </template>
        <template v-else>
          <span v-if="about.length > 0">About</span>
          <AppButton v-for="item in about" :key="`${item.kind}:${item.id}`" :to="item.to" variant="link" size="inline" :label="item.label" />
          <span v-if="!fact.known_to_player" class="font-semibold text-foreground">Filed hidden: not yet told</span>
          <span v-if="review === 'kept' && fact.kept_at" class="font-semibold text-tone-success">Kept {{ day(fact.kept_at) }}</span>
          <span v-if="review === 'kept' && fact.source === 'correction'">Your version</span>
          <span v-if="review === 'corrected'">Corrected: your version follows</span>
          <AppButton v-if="truthId" :to="`/canon?entry=${truthId}`" variant="link" size="inline" label="Now a truth" />
        </template>
      </div>
    </div>

    <div v-if="review === 'struck'" class="flex shrink-0 items-center">
      <AppButton variant="link" size="inline" label="Undo" @click="emit('undo')" />
    </div>
    <div v-else-if="review !== 'corrected' && fact.source === 'table'" class="flex shrink-0 items-center gap-1">
      <AppButton v-if="review === 'new'" variant="tinted" tone="success" size="sm" label="Keep" @click="emit('keep')" />
      <AppButton variant="outline" size="sm" label="Edit" @click="emit('edit')" />
      <AppButton variant="tinted" tone="danger" size="sm" label="Strike" @click="emit('strike')" />
      <OverflowMenu v-if="!truthId" variant="ghost" size="icon-sm" :label="`More actions for this fact`" :items="MENU" @select="emit('truth')" />
    </div>
  </li>
</template>

<script setup lang="ts">
/**
 * One line the Narrator put on record (frame 03): the sentence, what it is about, and the DM's three answers. Keep says
 * it stands, Edit files a correction that overtakes it, Strike says it never happened (and offers Undo here, where the
 * struck line stays on screen). The menu holds Make it a truth, until the fact has become one: then the row says "Now a truth" and links to it. Nothing here writes; the section does.
 */
import AppButton from "@/components/common/controls/AppButton.vue";
import OverflowMenu, { type OverflowMenuEntry } from "@/components/common/overlays/OverflowMenu.vue";
import type { StoryFact } from "@/lib/table/solo/storyRecord";
import type { FactReview } from "@/lib/canon/canonTableFacts";

defineProps<{
  fact: StoryFact;
  /** The truth this fact already became, when it has; the fact then links to it and is not offered Make it a truth again. */
  truthId?: string | null;
  review: FactReview;
  /** What the fact is about, already named and routed. */
  about: readonly { kind: string; id: string; label: string; to: string }[];
}>();
const emit = defineEmits<{ keep: []; edit: []; strike: []; undo: []; truth: [] }>();

const MENU: OverflowMenuEntry[] = [{ key: "truth", label: "Make it a truth" }];

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
</script>
