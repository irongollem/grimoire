<template>
  <section class="flex flex-col gap-2 rounded-lg border border-border bg-card p-3" aria-label="The canon behind this quest" data-testid="quest-canon">
    <span class="text-eyebrow text-muted-foreground">The canon behind this quest</span>
    <div v-for="group in groups" :key="group.part" class="flex flex-col gap-1" :data-testid="`quest-canon-${group.part}`">
      <span class="text-label font-bold text-foreground">{{ group.title }}</span>
      <ul class="flex flex-col gap-1">
        <li v-for="row in group.rows" :key="row.linkId" class="flex min-w-0 items-center gap-1" data-testid="quest-canon-row">
          <RouterLink :to="{ path: '/canon', query: { entry: row.entryId } }" class="min-w-0 truncate text-body text-foreground hover:underline">{{ row.name }}</RouterLink>
          <span v-if="row.fact !== null" class="shrink-0 text-label text-muted-foreground" data-testid="quest-canon-fact">{{ row.fact }}</span>
          <AppButton class="ml-auto" variant="ghost" size="icon-sm" :icon="IconClose" :aria-label="`Unlink ${row.name}`" @click="remove(row.linkId)" />
        </li>
      </ul>
    </div>
    <p v-if="groups.length === 0" class="text-caption text-muted-foreground">No canon is tied to this quest yet.</p>
    <EntityCombobox :key="picked" v-model="picked" :options="options" placeholder="Link canon…" />
  </section>
</template>

<script setup lang="ts">
/** The reading half of QuestCanon: what the DM tied to this quest, with the same Link and Unlink the entries have. */
import { computed, ref, watch } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import EntityCombobox from "@/components/common/controls/EntityCombobox.vue";
import { useCanonClues } from "@/composables/canon/useCanonClues";
import { useCanonEntries } from "@/composables/canon/useCanonEntries";
import { useCreateEntryQuests, useDeleteEntryQuest } from "@/composables/canon/useCanonEntryQuests";
import { useCanonForceData } from "@/composables/canon/useCanonForces";
import { useParty } from "@/composables/party/useParty";
import { IconClose } from "@/lib/icons";
import { questCanonGroups, questCanonOptions } from "./questCanonRows";

const { questId, campaignId } = defineProps<{ questId: string; campaignId: string }>();

const { data: entries } = useCanonEntries();
const { data: forceData } = useCanonForceData();
const { data: clues } = useCanonClues();
const { data: party } = useParty();

const characterNames = computed(() => new Map((party.value ?? []).map((m) => [m.id, m.name])));
const input = computed(() => ({
  questId,
  links: forceData.value?.quests ?? [],
  entries: entries.value ?? [],
  ticks: forceData.value?.ticks ?? [],
  clues: clues.value ?? [],
  characterNames: characterNames.value,
}));
const groups = computed(() => questCanonGroups(input.value));
const options = computed(() => questCanonOptions(input.value));

const picked = ref("");
const { mutate: create } = useCreateEntryQuests();
const { mutate: remove } = useDeleteEntryQuest();

watch(picked, (id) => {
  if (id === "") return;
  create([{ campaign_id: campaignId, entry_id: id, quest_id: questId }]);
  picked.value = "";
});
</script>
