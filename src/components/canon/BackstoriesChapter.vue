<template>
  <CanonChapter chapter="backstories" :title="chapter.label" :why="chapter.why" :open="selectedMember !== null" :back-label="chapter.label" @close="emit('close')">
    <ul v-if="party.length > 0" class="flex flex-col rounded-lg border border-border bg-card" data-testid="backstory-ledger">
      <CanonRow v-for="{ member, state } in rows" :id="`canon-backstory-${member.id}`" :key="member.id" :title="member.name" :selected="member.id === selectedId" @select="emit('select', member.id)">
        <span v-if="member.player_name" class="mt-1 block text-label text-muted-foreground" data-testid="backstory-player">played by {{ member.player_name }}</span>
        <template #mark>
          <span class="inline-flex items-center gap-1.5 whitespace-nowrap text-label font-bold" :class="state.tone" :data-state="state.key" data-testid="backstory-mark">
            <span aria-hidden="true" class="size-2 shrink-0 rotate-45 border" :class="state.shape" />
            {{ state.word }}
          </span>
        </template>
      </CanonRow>
    </ul>
    <CanonEmpty v-else title="No characters yet" text="A backstory belongs to a character. Add one to the party and their past can be written here." />

    <template #entry>
      <BackstoryDetail v-if="selectedMember" :key="selectedMember.id" :member="selectedMember" @close="emit('close')" />
    </template>
  </CanonChapter>
</template>

<script setup lang="ts">
/**
 * The Backstories chapter: one row per party member, with what is left to do in their past (threads open, passages not
 * yet told). A backstory is not added or deleted here: it belongs to a character, and its entry is made the first time
 * the character is opened.
 */
import { computed } from "vue";
import BackstoryDetail from "./BackstoryDetail.vue";
import CanonChapter from "./kit/CanonChapter.vue";
import CanonEmpty from "./kit/CanonEmpty.vue";
import CanonRow from "./kit/CanonRow.vue";
import { useCanonEntries } from "@/composables/canon/useCanonEntries";
import { useCampaignLinks } from "@/composables/connections/useConnections";
import { openThreads } from "@/lib/canon/backstoryThreads";
import { chapterOf } from "@/lib/canon/canonParts";
import type { CanonEntry, CanonLorePassage } from "@/types/canon.types";
import type { PartyMember } from "@/types/party.types";

const { party, entries, passages, selectedId = null } = defineProps<{
  /** The whole party: a character spans arcs, so no arc narrows this chapter. */
  party: readonly PartyMember[];
  /** The campaign's backstory entries (a character has one once it is opened). */
  entries: readonly CanonEntry[];
  passages: readonly CanonLorePassage[];
  /** The open character's member id. */
  selectedId?: string | null;
}>();
const emit = defineEmits<{ select: [memberId: string]; close: [] }>();

const chapter = chapterOf("backstories");
const selectedMember = computed(() => party.find((m) => m.id === selectedId) ?? null);

const ofMember = computed(() => {
  const byEntry = new Map(entries.filter((e) => e.party_member_id !== null).map((e) => [e.id, e.party_member_id]));
  const grouped = new Map<string, CanonLorePassage[]>();
  for (const p of passages) {
    const member = byEntry.get(p.entry_id);
    if (member === undefined || member === null) continue;
    grouped.set(member, [...(grouped.get(member) ?? []), p]);
  }
  return grouped;
});
// The open threads of a past are read off the campaign's canon and its links, the same way the entry lists them.
const { data: allEntries } = useCanonEntries();
const { data: links } = useCampaignLinks();
const threadCount = computed(() => {
  const counts = new Map<string, number>();
  for (const e of entries) {
    if (e.party_member_id !== null) counts.set(e.party_member_id, openThreads(e.id, allEntries.value ?? [], links.value ?? []).length);
  }
  return counts;
});
// What is left to do in a past: threads it leaves open first, then passages not yet told, then that every passage has been told (no passages yet says so instead).
const rows = computed(() =>
  party.map((member) => {
    const mine = ofMember.value.get(member.id) ?? [];
    const threads = threadCount.value.get(member.id) ?? 0;
    const untold = mine.filter((p) => p.told_at === null).length;
    const state =
      threads > 0
        ? { key: "threads", word: `${threads} ${threads === 1 ? "thread" : "threads"} open`, tone: "text-tone-info", shape: "border-current bg-[linear-gradient(135deg,currentColor_50%,transparent_50%)]" }
        : untold > 0
          ? { key: "untold", word: `${untold} not yet told`, tone: "text-foreground", shape: "border-[1.5px] border-current bg-transparent" }
          : mine.length === 0
            ? { key: "none", word: "No passages", tone: "text-muted-foreground", shape: "border-[1.5px] border-current bg-transparent" }
            : { key: "told", word: "All told", tone: "text-tone-success", shape: "border-current bg-current" };
    return { member, state };
  }),
);
</script>
