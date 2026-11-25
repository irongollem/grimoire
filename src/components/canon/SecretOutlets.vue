<template>
  <div class="flex flex-col gap-2" data-testid="secret-outlets">
    <span class="text-eyebrow text-muted-foreground">Where it comes out</span>
    <ul v-if="groups.length > 0" class="flex flex-col gap-2">
      <li v-for="group in groups" :key="group.questId" class="flex flex-col gap-1 border border-border bg-muted/40 p-2" data-testid="outlet-quest">
        <div class="flex items-center gap-1">
          <RouterLink v-if="group.title !== null" :to="`/quests/${group.questId}`" class="min-w-0 flex-1 text-body font-bold hover:underline">{{ group.title }}</RouterLink>
          <span v-else class="min-w-0 flex-1 text-body italic text-muted-foreground">A quest that is gone</span>
          <AppButton
            v-if="group.linkId !== null"
            variant="ghost"
            size="icon-sm"
            :icon="IconClose"
            :aria-label="`Unlink ${group.title ?? 'this quest'}`"
            @click="remove(group.linkId)"
          />
        </div>
        <ul v-if="group.beats.length > 0 || group.clues.length > 0" class="flex flex-col gap-0.5 text-body">
          <li v-for="beat in group.beats" :key="`b-${beat.id}`" data-testid="outlet-beat">
            <RouterLink :to="beatPath(beat)" class="underline">{{ beat.title }}</RouterLink>
            <span class="text-caption text-muted-foreground"> · this beat is the secret</span>
          </li>
          <li v-for="item in group.clues" :key="`c-${item.clue.id}`" data-testid="outlet-clue">
            <RouterLink :to="beatPath(item.beat)" class="underline">{{ item.beat.title }}</RouterLink>
            <span class="text-caption text-muted-foreground"> · clue: {{ item.clue.title }}</span>
          </li>
        </ul>
        <p v-else class="text-caption italic text-muted-foreground" data-testid="outlet-planned">Planned, no beat yet</p>
      </li>
    </ul>
    <p v-else class="text-caption text-muted-foreground" data-testid="outlets-empty">
      Nothing brings it out yet. Tie a beat to it in a quest, place a clue at a beat, or plan it in a quest.
    </p>
    <EntityCombobox :key="picked" v-model="picked" :options="options" placeholder="Plan it in a quest…" />
    <StartQuestFrom :entry="entry" :clues="unplaced" />
  </div>
</template>

<script setup lang="ts">
/**
 * Where a secret comes out (#1258 item 3), grouped by quest: the beats that are the secret and the clues placed at the
 * quest's beats, each linking to the beat. A quest the DM linked by hand with neither reads "Planned, no beat yet".
 * One block where there were four (beats, quests, clues' places and the generic connections). It ends with "Start a quest
 * from this" (#1279 item 32), which offers the clues that lie nowhere yet as the new quest's beats.
 */
import { computed, ref, watch } from "vue";
import StartQuestFrom from "./StartQuestFrom.vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import EntityCombobox from "@/components/common/controls/EntityCombobox.vue";
import { useBeatsByIds, useSecretBeats, type SecretBeat } from "@/composables/canon/useSecretBeats";
import { useCreateEntryQuests, useDeleteEntryQuest } from "@/composables/canon/useCanonEntryQuests";
import { useEntryQuestLinks } from "@/composables/canon/useEntryQuestLinks";
import { useQuests } from "@/composables/quests/useQuests";
import { IconClose } from "@/lib/icons";
import type { CanonClue, CanonEntry } from "@/types/canon.types";

const { entry, clues } = defineProps<{ entry: CanonEntry; clues: readonly CanonClue[] }>();

interface Outlet {
  questId: string;
  title: string | null;
  /** The hand-made link to this quest, when there is one (the one to unlink). */
  linkId: string | null;
  beats: SecretBeat[];
  clues: { clue: CanonClue; beat: SecretBeat }[];
}

const beatPath = (beat: SecretBeat) => `/quests/${beat.quest_id}/beats/${beat.id}`;

const { data: tied } = useSecretBeats(() => entry.id);
const clueBeatIds = computed(() => clues.flatMap((c) => (c.quest_beat_id === null ? [] : [c.quest_beat_id])));
const { data: clueBeats } = useBeatsByIds(clueBeatIds);
const links = useEntryQuestLinks(() => entry.id);
const { data: quests } = useQuests();
const titleById = computed(() => new Map((quests.value ?? []).map((q) => [q.id, q.title])));

const groups = computed<Outlet[]>(() => {
  const byQuest = new Map<string, Outlet>();
  const outlet = (questId: string): Outlet => {
    const found = byQuest.get(questId);
    if (found) return found;
    const made: Outlet = { questId, title: titleById.value.get(questId) ?? null, linkId: null, beats: [], clues: [] };
    byQuest.set(questId, made);
    return made;
  };
  for (const beat of tied.value ?? []) outlet(beat.quest_id).beats.push(beat);
  const beatById = new Map((clueBeats.value ?? []).map((b) => [b.id, b]));
  for (const clue of clues) {
    const beat = clue.quest_beat_id === null ? undefined : beatById.get(clue.quest_beat_id);
    if (beat) outlet(beat.quest_id).clues.push({ clue, beat });
  }
  for (const link of links.value) outlet(link.quest_id).linkId = link.id;
  return [...byQuest.values()].sort((a, b) => (a.title ?? "￿").localeCompare(b.title ?? "￿"));
});

// A quest already shown is not offered again: planning it twice means nothing.
const options = computed(() => {
  const shown = new Set(groups.value.map((g) => g.questId));
  return (quests.value ?? []).filter((q) => !shown.has(q.id)).map((q) => ({ id: q.id, name: q.title }));
});

// The clues that lie nowhere yet: what a quest started from the secret can make beats of. A clue that is a lore passage lies where its passage does.
const unplaced = computed(() => clues.filter((c) => c.location_id === null && c.npc_id === null && c.quest_beat_id === null && c.item_id === null && c.document_id === null && c.passage_id === null));

const picked = ref("");
const { mutate: create } = useCreateEntryQuests();
const { mutate: remove } = useDeleteEntryQuest();

watch(picked, (id) => {
  if (id === "") return;
  create([{ campaign_id: entry.campaign_id, entry_id: entry.id, quest_id: id }]);
  picked.value = "";
});
</script>
