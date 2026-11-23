<template>
  <PageHeader title="Tonight" description="What is waiting at the table, gathered from the canon. Mark a clue found, tell a passage or tick a clock right here; every name opens where it is edited.">
    <template #actions>
      <AppButton to="/canon" variant="ghost" size="md" :icon="IconChevronLeft" label="The whole canon" />
    </template>
    <div class="flex max-w-3xl flex-col gap-4 px-4 pb-8 pt-4 md:px-6" data-testid="canon-tonight">
      <ListSkeleton v-if="isLoading || campaign === null" variant="rows" :count="4" />
      <p v-else-if="isError" role="alert" class="text-body text-destructive">Could not load Tonight.</p>
      <EmptyState v-else-if="nothing" title="Nothing is waiting" description="No lore to tell, no clue to find, no force to watch, no thread left open and no loose end.">
        <template #action>
          <AppButton to="/canon" variant="outline" size="md" label="The whole canon" />
        </template>
      </EmptyState>
      <template v-else-if="plan">
        <div class="flex flex-col gap-1" data-testid="tonight-scope">
          <SegmentedControl v-model="scope" :options="SCOPE_OPTIONS" />
          <p v-if="scopeEmpty" class="m-0 text-label text-muted-foreground" data-testid="scope-empty">{{ scopeEmptyText }}</p>
        </div>
        <TonightBlock v-if="plan.lore.length > 0" block="lore" title="Lore to tell">
          <TonightGroups :groups="plan.lore" :item-key="(i) => i.passageId">
            <template #default="{ item }">
              <span class="text-body leading-snug text-foreground">{{ item.passageTitle || "An untitled passage" }}</span>
              <RouterLink :to="{ path: '/canon', query: { entry: item.entryId } }" class="text-label text-muted-foreground underline-offset-2 hover:underline">From: {{ item.entryTitle }}</RouterLink>
              <AppButton variant="primary" size="sm" label="Tell" class="self-start" data-testid="tonight-tell" @click="tellPassage(item)" />
            </template>
          </TonightGroups>
        </TonightBlock>

        <TonightBlock v-if="plan.clues.length > 0" block="clues" title="Clues to find">
          <TonightGroups :groups="plan.clues" :item-key="(i) => i.clueId">
            <template #default="{ item }">
              <span class="text-body leading-snug text-foreground">{{ item.title }}</span>
              <RouterLink :to="{ path: '/canon', query: { entry: item.secretId } }" class="text-label text-muted-foreground underline-offset-2 hover:underline">Clue to: {{ item.secretTitle }}</RouterLink>
              <AppButton variant="primary" size="sm" label="Found" class="self-start" data-testid="tonight-found" @click="setFound({ id: item.clueId }, true)" />
            </template>
          </TonightGroups>
        </TonightBlock>

        <TonightBlock v-if="plan.forces.length > 0" block="forces" title="What moves next">
          <ul class="m-0 flex list-none flex-col gap-2 p-0">
            <li v-for="force in plan.forces" :key="force.entryId" class="flex min-w-0 flex-col" data-testid="tonight-force">
              <RouterLink :to="{ path: '/canon', query: { entry: force.entryId } }" class="text-body font-semibold text-foreground underline-offset-2 hover:underline">{{ force.title }}</RouterLink>
              <span class="text-label text-muted-foreground">{{ force.nextStep ?? "No next step written" }}</span>
              <span v-if="force.clock" class="text-label text-muted-foreground">
                {{ force.clock.filled }} of {{ force.clock.size }}<template v-if="force.clock.full"> · The clock is full</template>
              </span>
              <AppButton v-if="force.clock" variant="outline" size="sm" label="Tick" class="self-start" :disabled="force.clock.full" data-testid="tonight-tick" @click="tickForce(force.entryId)" />
            </li>
          </ul>
        </TonightBlock>

        <TonightBlock v-if="plan.threads.length > 0" block="threads" title="Threads left open">
          <ul class="m-0 flex list-none flex-col gap-2 p-0">
            <li v-for="who in plan.threads" :key="who.memberId" class="flex min-w-0 flex-col" data-testid="tonight-thread">
              <RouterLink :to="{ path: '/canon', query: { backstory: who.memberId } }" class="text-body font-semibold text-foreground underline-offset-2 hover:underline">{{ who.name }}</RouterLink>
              <span v-for="thread in who.threads" :key="thread" class="text-label text-muted-foreground">{{ thread }}</span>
              <span v-if="who.untoldPassages > 0" class="text-label text-muted-foreground">
                {{ who.untoldPassages }} {{ who.untoldPassages === 1 ? "passage" : "passages" }} not yet told
              </span>
            </li>
          </ul>
        </TonightBlock>

        <TonightBlock v-if="plan.tableUnreviewed > 0" block="table" title="The table added">
          <p class="m-0 text-body text-foreground">
            {{ plan.tableUnreviewed }} {{ plan.tableUnreviewed === 1 ? "line" : "lines" }} to review.
            <RouterLink :to="{ path: '/canon', query: { section: 'table' } }" class="text-muted-foreground underline-offset-2 hover:underline">What the table added</RouterLink>
          </p>
        </TonightBlock>
        <TonightLooseEnds v-if="ends.length > 0" :ends="ends" />
      </template>
    </div>
  </PageHeader>
</template>

<script setup lang="ts">
/**
 * Tonight (#1255 item 14): what the DM needs for the next session, gathered from the canon and read-only. It reads what the
 * Canon page already reads (all under the canon query root, so the campaign doorbell keeps it fresh), stores nothing, and
 * every line links to where it is edited. A route under the DM shell: the lens fence keeps players out of it.
 */
import { computed } from "vue";
import { RouterLink } from "vue-router";
import AppButton from "@/components/common/controls/AppButton.vue";
import SegmentedControl from "@/components/common/controls/SegmentedControl.vue";
import EmptyState from "@/components/common/feedback/EmptyState.vue";
import ListSkeleton from "@/components/common/feedback/ListSkeleton.vue";
import PageHeader from "@/components/common/list/PageHeader.vue";
import TonightBlock from "@/components/canon/tonight/TonightBlock.vue";
import TonightGroups from "@/components/canon/tonight/TonightGroups.vue";
import TonightLooseEnds from "@/components/canon/tonight/TonightLooseEnds.vue";
import { useCanonArcs } from "@/composables/canon/useCanonArcs";
import { useCampaignBeatQuests } from "@/composables/canon/useCampaignBeatQuests";
import { useCanonClues, useSetClueFound } from "@/composables/canon/useCanonClues";
import { useCanonEntries } from "@/composables/canon/useCanonEntries";
import { useCanonForceData, useTickForce } from "@/composables/canon/useCanonForces";
import { useTellPassage } from "@/composables/canon/useCanonPassageEdits";
import { useCanonPassages } from "@/composables/canon/useCanonPassages";
import { useTableFacts } from "@/composables/canon/useTableFacts";
import { useCampaignLinks } from "@/composables/connections/useConnections";
import { useAllLocations } from "@/composables/locations/useLocations";
import { useParty } from "@/composables/party/useParty";
import { useQuests } from "@/composables/quests/useQuests";
import { useCampaignSessions } from "@/composables/sessions/useCampaignSessions";
import { activeQuestBeatIds, looseEnds, nothingTonight, scopeHidAll, scopeTonight, tonight, TONIGHT_SCOPES, type TonightLore, type TonightScope } from "@/lib/canon/canonTonight";
import { IconChevronLeft } from "@/lib/icons";
import { useCampaignStore } from "@/stores/campaign";
import { useCanonUiStore } from "@/stores/ui/canon";

const campaign = computed(() => useCampaignStore().activeCampaign);
const entries = useCanonEntries();
const clues = useCanonClues();
const passages = useCanonPassages();
const forces = useCanonForceData();
const party = useParty();
const links = useCampaignLinks();
const record = useTableFacts();
const arcs = useCanonArcs();
const quests = useQuests();
const beatQuests = useCampaignBeatQuests();
const locations = useAllLocations();
const sessions = useCampaignSessions();
const reads = [entries, clues, passages, forces, party, links, record.facts, arcs, quests, beatQuests, locations, sessions];

const isLoading = computed(() => reads.some((r) => r.isLoading.value));
const isError = computed(() => reads.some((r) => r.isError.value));

const ui = useCanonUiStore();
const scope = computed<TonightScope>({ get: () => ui.tonightScope, set: (v) => (ui.tonightScope = v) });
const SCOPE_OPTIONS = TONIGHT_SCOPES.map((s) => ({ value: s.id, label: s.label }));

// Only built once every read has answered: a read still missing would show as "nothing waiting".
const full = computed(() => {
  if (isLoading.value || isError.value || campaign.value === null) return null;
  return tonight({
    entries: entries.data.value ?? [],
    passages: passages.data.value ?? [],
    clues: clues.data.value ?? [],
    steps: forces.data.value?.steps ?? [],
    ticks: forces.data.value?.ticks ?? [],
    party: party.data.value ?? [],
    links: links.data.value ?? [],
    facts: record.facts.data.value ?? [],
  });
});
const plan = computed(() =>
  full.value === null
    ? null
    : scopeTonight(full.value, scope.value, {
        currentLocationId: campaign.value?.current_location_id ?? null,
        locations: locations.data.value ?? [],
        activeBeatIds: activeQuestBeatIds(beatQuests.data.value ?? [], quests.data.value ?? []),
      }),
);
const ends = computed(() =>
  full.value === null
    ? []
    : looseEnds({
        entries: entries.data.value ?? [],
        clues: clues.data.value ?? [],
        steps: forces.data.value?.steps ?? [],
        entryQuests: forces.data.value?.quests ?? [],
        links: links.data.value ?? [],
        arcs: arcs.data.value ?? [],
        quests: quests.data.value ?? [],
        sessions: sessions.data.value ?? [],
      }),
);
// The page is empty only when the whole canon has nothing; a scope that hides what exists says so under its control instead.
const nothing = computed(() => full.value !== null && nothingTonight(full.value) && ends.value.length === 0);
const scopeEmpty = computed(() => full.value !== null && plan.value !== null && scopeHidAll(full.value, plan.value));
const scopeEmptyText = computed(() =>
  scope.value === "party"
    ? campaign.value?.current_location_id
      ? "No lore or clue is placed where the party is. Choose Everything to see the rest."
      : "The party has no place set, so nothing is placed where they are. Choose Everything to see the rest."
    : "No lore or clue is placed at a beat of an active quest. Choose Everything to see the rest.",
);

// The same writers the entry pages use, so each stamps the open session as they do.
const setFound = useSetClueFound();
const { tell } = useTellPassage();
const { mutate: tick } = useTickForce();
function tellPassage(item: TonightLore) {
  void tell({ id: item.passageId }, item.tellTo === null ? undefined : [item.tellTo]);
}
function tickForce(forceId: string) {
  if (campaign.value === null) return;
  tick({ campaignId: campaign.value.id, forceId, delta: 1, note: "" });
}
</script>
