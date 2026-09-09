<template>
  <article class="flex flex-col gap-3 rounded-xl border border-primary bg-card p-4">
    <div class="flex flex-wrap items-center gap-1.5">
      <span v-if="beat.quest" class="rounded bg-muted px-1.5 py-0.5 text-label uppercase text-muted-foreground">{{ beat.quest.title }}</span>
    </div>
    <h3 class="font-cinzel text-base font-bold text-foreground">Beat · {{ beat.title || "Untitled beat" }}</h3>

    <section v-if="beat.read_aloud" class="rounded-lg border border-primary/30 bg-primary/5 p-4">
      <h4 class="mb-2 font-cinzel text-sm font-bold text-primary">Read aloud</h4>
      <RichTextViewer :content="beat.read_aloud" />
    </section>

    <div class="flex flex-wrap gap-2">
      <AppButton variant="primary" size="sm" :icon="IconCheck" label="Resolve beat" :to="cockpitTarget" />
      <AppButton v-if="beat.read_aloud" variant="subtle" size="sm" :icon="IconDocument" label="Read aloud" @click="focused = true" />
    </div>

    <p class="text-caption text-muted-foreground">
      Staged here by the beat itself. Nothing about the beat changes — it simply has a room surface worth opening now.
    </p>
  </article>

  <AppModal :open="focused" size="md" @close="focused = false">
    <ModalHeader :title="beat.title || 'Untitled beat'" subtitle="Read aloud" closeable @close="focused = false" />
    <div class="max-h-[70vh] overflow-y-auto p-5 text-body leading-relaxed">
      <RichTextViewer v-if="beat.read_aloud" :content="beat.read_aloud" />
    </div>
  </AppModal>
</template>

<script setup lang="ts">
/**
 * Frame 08's beat card — the same beat presentation the run cockpit already
 * uses (`QuestRunBeatCard`'s read-aloud block, styled identically), for the
 * one case where a DM opened a site straight from the Atlas rather than
 * through the cockpit and a beat is still waiting here. "Resolve beat" and
 * the header's "Back to the beat" both go to the same place — the run
 * cockpit, at this beat — because that is genuinely the only place a beat
 * resolves; this card is a reference to it, not a second place that does it.
 *
 * No beat position number ("Beat 4"): `story_order` is a server-computed
 * depth-in-graph walk scoped to player-visible beats
 * (`get_player_visible_quest_beats`), not a cheap client read, and the wrong
 * scope besides (this card may show a hidden or DM-only beat). Per the
 * story's own instruction — "N = position if cheap, else omit" — it's
 * omitted rather than faked.
 *
 * "Read aloud" has no existing action to reuse: the block above already
 * renders the text inline, same as `QuestRunBeatCard`, so this button opens
 * it full-screen for the DM to read from at the table without the rest of
 * the card's chrome competing for attention. Nothing about the beat changes
 * when it's clicked.
 */
import { ref, computed } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import AppModal from "@/components/common/AppModal.vue";
import ModalHeader from "@/components/common/ModalHeader.vue";
import RichTextViewer from "@/components/common/RichTextViewer.vue";
import { IconCheck, IconDocument } from "@/lib/icons";
import { questSurfaceReturnTo } from "@/lib/quests/navigation";
import type { StagedQuestBeat } from "@/composables/quests/useBeatsStagedAt";

const { beat } = defineProps<{ beat: StagedQuestBeat }>();

const cockpitTarget = computed(() => questSurfaceReturnTo(beat.quest_id, beat.id, "run"));
const focused = ref(false);
</script>
