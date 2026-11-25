<template>
  <PageHeader title="Tonight" description="What is waiting at the table, gathered from the canon. Mark a clue found, tell a passage or tick a clock right here; every name opens where it is edited.">
    <template #actions>
      <AppButton to="/canon" variant="ghost" size="md" :icon="IconChevronLeft" label="The whole canon" />
    </template>
    <div class="flex max-w-3xl flex-col gap-4 px-4 pb-8 pt-4 md:px-6" data-testid="canon-tonight">
      <ListSkeleton v-if="isLoading || campaign === null" variant="rows" :count="4" />
      <p v-else-if="isError" role="alert" class="text-body text-destructive">Could not load Tonight.</p>
      <EmptyState v-else-if="nothing && done.length === 0" title="Nothing is waiting" description="No lore to tell, no clue to find, no force to watch, no thread left open and no loose end.">
        <template #action>
          <AppButton to="/canon" variant="outline" size="md" label="The whole canon" />
        </template>
      </EmptyState>
      <template v-else-if="plan">
        <div class="flex flex-col gap-1" data-testid="tonight-scope">
          <SegmentedControl v-model="scope" :options="SCOPE_OPTIONS" />
          <p v-if="scopeEmpty" class="m-0 text-label text-muted-foreground" data-testid="scope-empty">{{ scopeEmptyText }}</p>
        </div>
        <TonightBlock v-if="lore.length > 0" block="lore" title="Lore to tell">
          <TonightGroups :groups="lore" :item-key="(i) => i.passageId">
            <template #default="{ item }">
              <span class="text-body leading-snug text-foreground">{{ item.passageTitle || "An untitled passage" }}</span>
              <RouterLink :to="{ path: '/canon', query: { entry: item.entryId } }" class="text-label text-muted-foreground underline-offset-2 hover:underline">From: {{ item.entryTitle }}</RouterLink>
              <AppButton variant="primary" size="sm" label="Tell" class="self-start" data-testid="tonight-tell" @click="tellPassage(item)" />
            </template>
          </TonightGroups>
        </TonightBlock>

        <TonightBlock v-if="clues.length > 0" block="clues" title="Clues to find">
          <TonightGroups :groups="clues" :item-key="(i) => i.clueId">
            <template #default="{ item }">
              <span class="text-body leading-snug text-foreground">{{ item.title }}</span>
              <RouterLink :to="{ path: '/canon', query: { entry: item.secretId } }" class="text-label text-muted-foreground underline-offset-2 hover:underline">Clue to: {{ item.secretTitle }}</RouterLink>
              <AppButton variant="primary" size="sm" label="Found" class="self-start" data-testid="tonight-found" @click="foundClue(item)" />
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
              <AppButton v-if="force.clock" variant="outline" size="sm" label="Tick" class="self-start" :disabled="force.clock.full" data-testid="tonight-tick" @click="tickForce(force)" />
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
        <TonightDone v-if="done.length > 0" :done="done" @undo="undo" />
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
import { computed, ref } from "vue";
import { RouterLink } from "vue-router";
import AppButton from "@/components/common/controls/AppButton.vue";
import SegmentedControl from "@/components/common/controls/SegmentedControl.vue";
import EmptyState from "@/components/common/feedback/EmptyState.vue";
import ListSkeleton from "@/components/common/feedback/ListSkeleton.vue";
import PageHeader from "@/components/common/list/PageHeader.vue";
import TonightBlock from "@/components/canon/tonight/TonightBlock.vue";
import TonightGroups from "@/components/canon/tonight/TonightGroups.vue";
import TonightDone from "@/components/canon/tonight/TonightDone.vue";
import TonightLooseEnds from "@/components/canon/tonight/TonightLooseEnds.vue";
import { useSetClueFound } from "@/composables/canon/useCanonClues";
import { useTickForce } from "@/composables/canon/useCanonForces";
import { useTellPassage } from "@/composables/canon/useCanonPassageEdits";
import { useTonight } from "@/composables/canon/useTonight";
import { TONIGHT_SCOPES, withoutDone, type TonightClue, type TonightDone as DoneEntry, type TonightForce, type TonightLore } from "@/lib/canon/canonTonight";
import { toast } from "@/lib/toast";
import { IconChevronLeft } from "@/lib/icons";

const { campaign, isLoading, isError, scope, plan, ends, nothing, scopeEmpty, scopeEmptyText } = useTonight();
const SCOPE_OPTIONS = TONIGHT_SCOPES.map((s) => ({ value: s.id, label: s.label }));

// The same writers the entry pages use, so each stamps the open session as they do.
const setFound = useSetClueFound();
const { tell, takeBack } = useTellPassage();
const { mutate: tick } = useTickForce();

// What this visit did stays in view, marked done under a fold, and each action offers Undo at once. The plan refetches without
// a done row a moment later, so the rows are hidden from the groups here rather than waiting for it.
const done = ref<DoneEntry[]>([]);
let counter = 0;
const lore = computed(() => withoutDone(plan.value?.lore ?? [], (i) => isDone(`tell:${i.passageId}`)));
const clues = computed(() => withoutDone(plan.value?.clues ?? [], (i) => isDone(`found:${i.clueId}`)));
const isDone = (key: string) => done.value.some((d) => d.key === key);

function record(entry: DoneEntry, message: string) {
  done.value = [...done.value, entry];
  toast.success(message, undefined, { action: { label: "Undo", run: () => undo(entry.key) } });
}
/** Takes one action back. A second call for the same key (the toast, then the fold) does nothing. */
function undo(key: string) {
  const entry = done.value.find((d) => d.key === key);
  if (entry === undefined) return;
  done.value = done.value.filter((d) => d.key !== key);
  const id = key.slice(key.indexOf(":") + 1);
  if (entry.kind === "tell") takeBack({ id });
  else if (entry.kind === "found") setFound({ id }, false);
  else tickBy(id.slice(0, id.lastIndexOf("#")), -1);
}
function tellPassage(item: TonightLore) {
  void tell({ id: item.passageId }, item.tellTo === null ? undefined : [item.tellTo]);
  record({ key: `tell:${item.passageId}`, kind: "tell", title: item.passageTitle }, `Told "${item.passageTitle || "an untitled passage"}".`);
}
function foundClue(item: TonightClue) {
  setFound({ id: item.clueId }, true);
  record({ key: `found:${item.clueId}`, kind: "found", title: item.title }, `Found "${item.title}".`);
}
function tickBy(forceId: string, delta: 1 | -1) {
  if (campaign.value === null) return;
  tick({ campaignId: campaign.value.id, forceId, delta, note: "" });
}
function tickForce(force: TonightForce) {
  tickBy(force.entryId, 1);
  record({ key: `tick:${force.entryId}#${++counter}`, kind: "tick", title: force.title }, `Ticked ${force.title}.`);
}
</script>
