<template>
  <div class="flex flex-col gap-3" data-testid="arc-contents">
    <section v-for="group in groups" :key="group.key" class="flex flex-col gap-1" :data-testid="`arc-block-${group.key}`">
      <span class="text-eyebrow text-muted-foreground">{{ group.title }}</span>
      <ul v-if="group.lines.length > 0" class="m-0 flex list-none flex-col gap-1 p-0">
        <li v-for="line in group.lines" :key="line.key" class="flex min-w-0 flex-col">
          <span class="flex min-w-0 items-baseline gap-2">
            <RouterLink :to="line.to" class="text-body text-foreground hover:underline">{{ line.title }}</RouterLink>
            <span v-if="line.note" class="text-label text-muted-foreground">{{ line.note }}</span>
          </span>
          <RouterLink v-for="t in line.under" :key="t.id" :to="entryLink(t.id)" class="text-label text-muted-foreground hover:underline">{{ t.title }}</RouterLink>
        </li>
      </ul>
      <p v-else class="m-0 text-caption text-muted-foreground">{{ group.empty }}</p>
    </section>
  </div>
</template>

<script setup lang="ts">
/**
 * What one arc holds (the Arcs chapter's "What is in it"): its forces with their clocks, its secrets with their clue
 * tallies, its open questions, its quests and the backstories in it with their open threads, each line opening where it
 * lives. Read-only: things are filed in an arc from their own sheets.
 */
import { computed } from "vue";
import { RouterLink } from "vue-router";
import { useCanonClues } from "@/composables/canon/useCanonClues";
import { useCanonEntries } from "@/composables/canon/useCanonEntries";
import { useCanonForceData } from "@/composables/canon/useCanonForces";
import { useCampaignLinks } from "@/composables/connections/useConnections";
import { useQuests } from "@/composables/quests/useQuests";
import { openThreads } from "@/lib/canon/backstoryThreads";
import { clockFilled } from "@/lib/canon/canonForces";
import { clueTally } from "@/lib/canon/canonSecrets";
import { QUEST_STATUS_LABELS } from "@/types/quest.types";

const { arcId } = defineProps<{ arcId: string }>();

const { data: entriesData } = useCanonEntries();
const { data: forceData } = useCanonForceData();
const { data: cluesData } = useCanonClues();
const { data: questsData } = useQuests();
const { data: linksData } = useCampaignLinks();

const entryLink = (id: string) => ({ path: "/canon", query: { entry: id } });
const entries = computed(() => entriesData.value ?? []);
const inArc = (part: string) => entries.value.filter((e) => e.part === part && e.arc_id === arcId);
const ticksOf = (forceId: string) => (forceData.value?.ticks ?? []).filter((t) => t.force_id === forceId);
const cluesOf = (secretId: string) => (cluesData.value ?? []).filter((c) => c.secret_id === secretId);

interface Line { key: string; title: string; to: { path: string; query?: Record<string, string> } | string; note?: string; under?: readonly { id: string; title: string }[] }
const groups = computed<{ key: string; title: string; empty: string; lines: Line[] }[]>(() => [
  {
    key: "forces",
    title: "Forces",
    empty: "No force is in this arc.",
    lines: inArc("force").map((f) => ({ key: f.id, title: f.title, to: entryLink(f.id), note: f.clock_size === null ? "no clock" : `${clockFilled(ticksOf(f.id), f.clock_size)} of ${f.clock_size}` })),
  },
  {
    key: "secrets",
    title: "Secrets",
    empty: "No secret is in this arc.",
    lines: inArc("secret").map((s) => ({ key: s.id, title: s.title, to: entryLink(s.id), note: clueTally(cluesOf(s.id)) })),
  },
  {
    key: "questions",
    title: "Open questions",
    empty: "No question is open in this arc.",
    lines: inArc("question").filter((q) => q.closed_as === null).map((q) => ({ key: q.id, title: q.title, to: entryLink(q.id) })),
  },
  {
    key: "quests",
    title: "Quests",
    empty: "No quest is part of this arc.",
    lines: (questsData.value ?? []).filter((q) => q.arc_id === arcId).map((q) => ({ key: q.id, title: q.title, to: `/quests/${q.id}`, note: QUEST_STATUS_LABELS[q.status] })),
  },
  {
    key: "backstories",
    title: "Backstory threads",
    empty: "No backstory is in this arc.",
    lines: inArc("backstory").map((b) => ({ key: b.id, title: b.title, to: entryLink(b.id), under: openThreads(b.id, entries.value, linksData.value ?? []) })),
  },
]);
</script>
