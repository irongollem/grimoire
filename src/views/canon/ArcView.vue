<template>
  <PageHeader :title="arc ? arc.name : 'Arc'" description="One arc of the story, gathered from the canon. Nothing is edited here; every line opens where it is.">
    <template #actions>
      <AppButton to="/canon" variant="ghost" size="md" :icon="IconChevronLeft" label="The whole canon" />
    </template>
    <div class="flex max-w-3xl flex-col gap-4 px-4 pb-8 pt-4 md:px-6" data-testid="canon-arc">
      <ListSkeleton v-if="isLoading" variant="rows" :count="4" />
      <p v-else-if="isError" role="alert" class="text-body text-destructive">Could not load this arc.</p>
      <EmptyState v-else-if="arc === null" title="This arc is gone" description="It may have been deleted. The canon lists the arcs there are.">
        <template #action>
          <AppButton to="/canon" variant="outline" size="md" label="The whole canon" />
        </template>
      </EmptyState>
      <template v-else>
        <section class="flex flex-col gap-1.5 border border-border bg-card p-3" data-testid="arc-shape">
          <span class="text-label font-bold text-foreground">{{ STATUS_LABEL[arc.status] }}</span>
          <p v-if="arc.summary" class="m-0 text-body text-foreground">{{ arc.summary }}</p>
          <p v-if="arc.question" class="m-0 text-body text-foreground" data-testid="arc-question"><span class="text-eyebrow text-muted-foreground">The question it asks</span><br>{{ arc.question }}</p>
          <p v-if="arc.stakes" class="m-0 text-body text-foreground" data-testid="arc-stakes"><span class="text-eyebrow text-muted-foreground">What is at stake</span><br>{{ arc.stakes }}</p>
          <p v-if="theme" class="m-0 text-body text-foreground" data-testid="arc-theme">
            <span class="text-eyebrow text-muted-foreground">Theme</span><br>
            <RouterLink :to="entryLink(theme.id)" class="hover:underline">{{ theme.title }}</RouterLink>
          </p>
          <p v-if="arc.status === 'ended' && arc.ending" class="m-0 text-body text-foreground" data-testid="arc-ending"><span class="text-eyebrow text-muted-foreground">How it ended</span><br>{{ arc.ending }}</p>
        </section>

        <ArcBlock title="Forces" empty="No force is in this arc." :count="forces.length" block="forces">
          <li v-for="f in forces" :key="f.id" class="flex min-w-0 items-baseline gap-2">
            <RouterLink :to="entryLink(f.id)" class="text-body font-semibold text-foreground hover:underline">{{ f.title }}</RouterLink>
            <span class="text-label text-muted-foreground">{{ f.clock_size === null ? "no clock" : `${clockFilled(ticksOf(f.id), f.clock_size)} of ${f.clock_size}` }}</span>
          </li>
        </ArcBlock>

        <ArcBlock title="Secrets" empty="No secret is in this arc." :count="secrets.length" block="secrets">
          <li v-for="s in secrets" :key="s.id" class="flex min-w-0 items-baseline gap-2">
            <RouterLink :to="entryLink(s.id)" class="text-body text-foreground hover:underline">{{ s.title }}</RouterLink>
            <span class="text-label text-muted-foreground">{{ clueTally(cluesOf(s.id)) }}</span>
          </li>
        </ArcBlock>

        <ArcBlock title="Open questions" empty="No question is open in this arc." :count="questions.length" block="questions">
          <li v-for="q in questions" :key="q.id" class="min-w-0">
            <RouterLink :to="entryLink(q.id)" class="text-body text-foreground hover:underline">{{ q.title }}</RouterLink>
          </li>
        </ArcBlock>

        <ArcBlock title="Quests" empty="No quest is part of this arc." :count="arcQuests.length" block="quests">
          <li v-for="q in arcQuests" :key="q.id" class="flex min-w-0 items-baseline gap-2">
            <RouterLink :to="`/quests/${q.id}`" class="text-body text-foreground hover:underline">{{ q.title }}</RouterLink>
            <span class="text-label text-muted-foreground">{{ QUEST_STATUS_LABELS[q.status] }}</span>
          </li>
        </ArcBlock>

        <ArcBlock title="Backstory threads" empty="No backstory is in this arc." :count="backstories.length" block="backstories">
          <li v-for="b in backstories" :key="b.entry.id" class="flex min-w-0 flex-col">
            <RouterLink :to="entryLink(b.entry.id)" class="text-body font-semibold text-foreground hover:underline">{{ b.entry.title }}</RouterLink>
            <RouterLink v-for="t in b.threads" :key="t.id" :to="entryLink(t.id)" class="text-label text-muted-foreground hover:underline">{{ t.title }}</RouterLink>
          </li>
        </ArcBlock>
      </template>
    </div>
  </PageHeader>
</template>

<script setup lang="ts">
/**
 * One arc (#1258 item 7): its question, stakes and theme, and everything the canon and the quests hold in it, each line
 * opening where it lives. Read-only: an arc is shaped in the Arcs panel and its things are filed in it from their own sheets.
 */
import { computed } from "vue";
import { RouterLink, useRoute } from "vue-router";
import AppButton from "@/components/common/controls/AppButton.vue";
import EmptyState from "@/components/common/feedback/EmptyState.vue";
import ListSkeleton from "@/components/common/feedback/ListSkeleton.vue";
import PageHeader from "@/components/common/list/PageHeader.vue";
import ArcBlock from "@/components/canon/ArcBlock.vue";
import { useCanonArcs } from "@/composables/canon/useCanonArcs";
import { useCanonClues } from "@/composables/canon/useCanonClues";
import { useCanonEntries } from "@/composables/canon/useCanonEntries";
import { useCanonForceData } from "@/composables/canon/useCanonForces";
import { useCampaignLinks } from "@/composables/connections/useConnections";
import { useQuests } from "@/composables/quests/useQuests";
import { clockFilled } from "@/lib/canon/canonForces";
import { clueTally } from "@/lib/canon/canonSecrets";
import { openThreads } from "@/lib/canon/backstoryThreads";
import { IconChevronLeft } from "@/lib/icons";
import { QUEST_STATUS_LABELS } from "@/types/quest.types";

const route = useRoute();
const arcId = computed(() => (typeof route.params.id === "string" ? route.params.id : ""));

const { data: arcs, isLoading: arcsLoading, isError: arcsError } = useCanonArcs();
const { data: entriesData, isLoading: entriesLoading, isError: entriesError } = useCanonEntries();
const { data: forceData } = useCanonForceData();
const { data: cluesData } = useCanonClues();
const { data: questsData } = useQuests();
const { data: linksData } = useCampaignLinks();

const isLoading = computed(() => arcsLoading.value || entriesLoading.value);
const isError = computed(() => arcsError.value || entriesError.value);

const STATUS_LABEL = { planned: "Planned", running: "Running", ended: "Ended" } as const;
const entryLink = (id: string) => ({ path: "/canon", query: { entry: id } });

const arc = computed(() => (arcs.value ?? []).find((a) => a.id === arcId.value) ?? null);
const entries = computed(() => entriesData.value ?? []);
const theme = computed(() => (arc.value?.theme_id ? entries.value.find((e) => e.id === arc.value?.theme_id) ?? null : null));
const inArc = (part: string) => entries.value.filter((e) => e.part === part && e.arc_id === arcId.value);

const forces = computed(() => inArc("force"));
const secrets = computed(() => inArc("secret"));
const questions = computed(() => inArc("question").filter((q) => q.closed_as === null));
const arcQuests = computed(() => (questsData.value ?? []).filter((q) => q.arc_id === arcId.value));
const backstories = computed(() => inArc("backstory").map((entry) => ({ entry, threads: openThreads(entry.id, entries.value, linksData.value ?? []) })));

const ticksOf = (forceId: string) => (forceData.value?.ticks ?? []).filter((t) => t.force_id === forceId);
const cluesOf = (secretId: string) => (cluesData.value ?? []).filter((c) => c.secret_id === secretId);
</script>
