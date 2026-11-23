<template>
  <section id="canon-backstories" class="flex scroll-mt-4 flex-col gap-3" aria-labelledby="canon-backstories-heading">
    <CanonRubric id="canon-backstories-heading" numeral="VIII" title="Backstories" />
    <p class="m-0 text-caption text-muted-foreground">Each character's past is told in passages. The player writes theirs and keeps adding to it; you add what they have not been told, and tell it when the story gets there.</p>

    <CanonPartFind part="backstories" noun="character" :count="party.length" :arc-label="arcLabel" />

    <ul v-if="shown.length > 0" class="flex flex-col border border-border bg-card" data-testid="backstory-ledger">
      <BackstoryRow
        v-for="member in shown"
        :key="member.id"
        :member="member"
        :passages="countOf(member.id)"
        :untold="untoldOf(member.id)"
        :threads="threadsOf(member.id)"
        :selected="member.id === selectedId"
        @select="emit('select', member.id)"
      />
    </ul>
    <EmptyState v-else-if="party.length > 0" class="border border-dashed border-border bg-card" title="No character matches" description="Nobody here has those letters in their name." />
    <EmptyState
      v-else-if="arcLabel !== null"
      class="border border-dashed border-border bg-card"
      title="No backstories in this arc"
      :description="`Nothing of this part is in ${arcLabel}.`"
    />
    <EmptyState
      v-else
      class="border border-dashed border-border bg-card"
      title="No characters yet"
      description="A backstory belongs to a character. Add one to the party and their past can be written here."
    />
  </section>
</template>

<script setup lang="ts">
/** Part VIII (frame 14): one row per party member, with how many passages their past holds, how many are still untold and how many threads it leaves open. */
import { computed } from "vue";
import EmptyState from "@/components/common/feedback/EmptyState.vue";
import BackstoryRow from "./BackstoryRow.vue";
import CanonPartFind from "./CanonPartFind.vue";
import CanonRubric from "./CanonRubric.vue";
import { useCanonEntries } from "@/composables/canon/useCanonEntries";
import { useCampaignLinks } from "@/composables/connections/useConnections";
import { openThreads } from "@/lib/canon/backstoryThreads";
import { matchesQuery } from "@/lib/canon/canonNarrow";
import { useCanonUiStore } from "@/stores/ui/canon";
import type { CanonEntry, CanonLorePassage } from "@/types/canon.types";
import type { PartyMember } from "@/types/party.types";

const { party, entries, passages, selectedId = null, arcLabel = null } = defineProps<{
  /** The characters of the page's arc: those whose backstory is in it (the whole party when none is chosen). */
  party: readonly PartyMember[];
  /** The campaign's backstory entries (a character has one once it is opened). */
  entries: readonly CanonEntry[];
  passages: readonly CanonLorePassage[];
  selectedId?: string | null;
  /** The name of the arc narrowing this part, or null. */
  arcLabel?: string | null;
}>();
const emit = defineEmits<{ select: [memberId: string] }>();

const store = useCanonUiStore();
const shown = computed(() => party.filter((m) => matchesQuery(m.name, store.partQuery.backstories)));

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
// The open threads of a past are read off the campaign's canon and its links, the same way the detail lists them.
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
