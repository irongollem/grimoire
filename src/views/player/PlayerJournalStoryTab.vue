<template>
  <ListSkeleton v-if="isLoading" variant="stack" />
  <p v-else-if="error" class="py-12 text-center font-fell text-muted-foreground italic">Your story could not be read just now. Try again in a moment.</p>
  <p v-else-if="!member" class="py-12 text-center font-fell text-muted-foreground italic">Choose a character to read and write their story.</p>
  <div v-else class="flex flex-col gap-4" data-testid="my-story">
    <div class="rounded-lg border border-border bg-card p-4">
      <BackstoryBeforePlay :member="member" :editable="!readOnly" />
    </div>

    <StoryPassage
      v-for="p in passages"
      :key="p.id"
      :passage="p"
      :when="writtenWhen(p.written_at, sessions ?? [])"
      :is-new="p.id === newPassageId"
      :editable="!p.by_dm && !readOnly"
    />

    <form v-if="!readOnly" class="flex flex-col gap-2" data-testid="add-to-story" @submit.prevent="add.mutate({ shareWithParty: share })">
      <div class="flex flex-wrap items-center gap-3">
        <AppButton type="submit" variant="outline" :icon="IconAdd" icon-size="xs" label="Add to my story" :loading="add.isPending.value" />
        <AppCheckbox v-model="share" label="Share with the party" />
      </div>
      <p class="m-0 text-caption text-muted-foreground">When the DM tells you more of your past, it appears here, marked as told by the DM.</p>
    </form>
  </div>
</template>

<script setup lang="ts">
/**
 * The journal's My story tab (#1226 story 10, frame 14): the character's own Backstory field as Before play, then the
 * passages told to this player in the order the story grew, theirs editable and the DM's marked and read-only. The
 * database's own projection decides what arrives, so a passage the DM has not told is never here, nor the fact that it
 * exists. The DM's newest passage is marked New until the player has opened this tab since it was told.
 */
import { computed, ref, watch } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import ListSkeleton from "@/components/common/feedback/ListSkeleton.vue";
import BackstoryBeforePlay from "@/components/canon/BackstoryBeforePlay.vue";
import StoryPassage from "@/components/player/StoryPassage.vue";
import { writtenWhen } from "@/lib/canon/canonBackstory";
import { useMyStory } from "@/composables/canon/useMyStory";
import { useMarkRead, useReadItems } from "@/composables/player/useReadItems";
import { usePlayerSessions } from "@/composables/sessions/usePlayerSessions";
import { IconAdd } from "@/lib/icons";

const { member, backstory, readOnly, isLoading, error, add } = useMyStory();
const { data: sessions } = usePlayerSessions();
const passages = computed(() => backstory.value?.passages ?? []);

// Sharing with the party is on by default: a backstory is party-visible on the sheet today.
const share = ref(true);

// The newest passage the DM told since this tab was last opened is New. The time of that last visit is held while the
// tab is open, because opening it marks it read.
const { readAt } = useReadItems("canon_backstory");
const { mutate: markRead } = useMarkRead();
const lastVisit = ref<{ entryId: string; at: Date | null } | null>(null);
watch(
  [backstory, readAt],
  ([story, reads]) => {
    if (!story || reads === undefined || lastVisit.value !== null) return;
    lastVisit.value = { entryId: story.entry.id, at: reads.get(story.entry.id) ?? null };
    markRead({ entityType: "canon_backstory", entityId: story.entry.id });
  },
  { immediate: true },
);

const newPassageId = computed(() => {
  const visit = lastVisit.value;
  if (visit === null) return null;
  const told = passages.value.flatMap((p) => (p.by_dm && p.told_at !== null ? [{ id: p.id, at: p.told_at }] : []));
  const newest = told.sort((a, b) => a.at.localeCompare(b.at)).at(-1);
  if (newest === undefined) return null;
  return visit.at === null || new Date(newest.at) > visit.at ? newest.id : null;
});
</script>
