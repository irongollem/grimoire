<template>
  <div class="space-y-4">
    <div class="flex items-start gap-4">
      <!-- The pane puts a portrait plate here; the lightbox shows its own portrait. -->
      <slot name="plate" />
    <div class="min-w-0 flex-1">
      <div class="flex items-start justify-between gap-3">
        <h2 class="text-heading font-bold text-foreground" :class="dead && 'line-through decoration-1'">
          {{ displayName }}
        </h2>
        <NpcRatingStars :npc-id="npc.id" size="lg" class="shrink-0 pt-1" />
      </div>
      <div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
        <NpcRelationshipMark :relationship="npc.relationship" />
        <span v-if="status" class="text-caption italic text-muted-foreground">{{ status }}</span>
      </div>
      <p v-if="what" class="mt-1 text-body italic text-muted-foreground">{{ what }}</p>
      <dl v-if="met || place" class="mt-2 space-y-0.5 text-caption text-muted-foreground">
        <div v-if="met" class="flex gap-2">
          <dt class="text-eyebrow font-bold uppercase">Met</dt>
          <dd>{{ met }}</dd>
        </div>
        <div v-if="place" class="flex gap-2">
          <dt class="text-eyebrow font-bold uppercase">Where</dt>
          <dd>{{ place }}</dd>
        </div>
      </dl>
    </div>
    </div>

    <!-- The DM's per-PC relation note shows a skeleton while loading, so players
         don't close the dialog thinking there is no note. -->
    <div v-if="pcNote || pcNoteLoading" class="overflow-hidden rounded-lg border border-primary/20 bg-primary/5">
      <div class="border-b border-primary/20 px-3 py-2">
        <p class="text-label font-semibold text-primary/70">YOUR CONNECTION</p>
      </div>
      <div class="px-3 py-2.5">
        <RichTextViewer v-if="pcNote" :content="pcNote" />
        <div v-else class="h-3 w-2/3 animate-pulse rounded bg-muted/40" />
      </div>
    </div>
    <PlayerNotesWidget entity-type="npc" :entity-id="npc.id" placeholder="Your observations about this character…" />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import PlayerNotesWidget from "@/components/common/PlayerNotesWidget.vue";
import RichTextViewer from "@/components/common/RichTextViewer.vue";
import { formatMetDate } from "@/components/play/people/peopleParty";
import NpcRelationshipMark from "@/components/play/people/NpcRelationshipMark.vue";
import NpcRatingStars from "@/components/play/NpcRatingStars.vue";
import { useMyNpcPcNote } from "@/composables/npcs/useNpcPcNotes";
import { getNpcDisplayName } from "@/lib/npcDisplay";
import { statusWord } from "@/lib/npcs/peopleLedger";
import type { PlayerNpc } from "@/types/npc.types";

/**
 * A person's page for the player: name, rating, how they regard the party, what
 * they are, when and where they were met, the DM's note for this character when
 * there is one, and the player's own notes. The lightbox (phones) and the
 * People page's side pane (tablets and up) both wear it.
 */
const { npc, place = null } = defineProps<{
  npc: PlayerNpc;
  /** The player-visible place, when the caller knows it. */
  place?: string | null;
}>();

const visible = (field: string) => npc.player_visible_fields.includes(field);
const status = computed(() => statusWord(npc.status));
const what = computed(() =>
  [visible("race") ? npc.race : null, visible("occupation") ? npc.occupation : null]
    .filter((part): part is string => !!part)
    .join(" · "),
);
const dead = computed(() => npc.status === "dead");
const displayName = computed(() => (visible("name") ? (getNpcDisplayName(npc) ?? "???") : "???"));
const met = computed(() => (npc.revealed_at ? formatMetDate(npc.revealed_at) : null));

const npcId = computed(() => npc.id);
const { data: pcNote, isLoading: pcNoteLoading } = useMyNpcPcNote(npcId);
</script>
