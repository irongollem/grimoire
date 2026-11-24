<template>
  <CanonChapter chapter="backstories" :title="chapter.label" :why="chapter.why" :open="selectedMember !== null" :back-label="chapter.label" @close="emit('close')">
    <ul v-if="party.length > 0" class="flex flex-col rounded-lg border border-border bg-card" data-testid="backstory-ledger">
      <BackstoryRow
        v-for="member in party"
        :key="member.id"
        :member="member"
        :passages="countOf(member.id)"
        :untold="untoldOf(member.id)"
        :threads="threadsOf(member.id)"
        :selected="member.id === selectedId"
        @select="emit('select', member.id)"
      />
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
import BackstoryRow from "./BackstoryRow.vue";
import CanonChapter from "./kit/CanonChapter.vue";
import CanonEmpty from "./kit/CanonEmpty.vue";
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
const threadsOf = (memberId: string) => threadCount.value.get(memberId) ?? 0;
const countOf = (memberId: string) => ofMember.value.get(memberId)?.length ?? 0;
const untoldOf = (memberId: string) => (ofMember.value.get(memberId) ?? []).filter((p) => p.told_at === null).length;
</script>
