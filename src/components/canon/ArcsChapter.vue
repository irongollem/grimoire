<template>
  <CanonChapter chapter="arcs" :title="chapter.label" :why="chapter.why" :open="open !== null" :back-label="chapter.label" @close="close">
    <ul v-if="arcs.length > 0" class="flex flex-col rounded-lg border border-border bg-card" data-testid="arc-ledger">
      <CanonRow
        v-for="arc in arcs"
        :id="`canon-arc-${arc.id}`"
        :key="arc.id"
        :title="arc.name"
        :selected="arc.id === open?.id"
        :move="endsOf(arcs, arc.id)"
        @select="select(arc.id)"
        @move="(direction) => actions.move.mutate({ arcs, id: arc.id, direction })"
      >
        <span v-if="arc.question" class="mt-1 block text-label text-muted-foreground">{{ arc.question }}</span>
        <template #mark><span class="text-label font-bold text-foreground" data-testid="arc-status">{{ STATUS_LABEL[arc.status] }}</span></template>
      </CanonRow>
    </ul>
    <CanonEmpty v-else title="No arcs yet" text="An arc is one act of the story: what it asks, what is at stake and how it ends. Name one and file the forces, secrets and quests that belong to it." ask="Suggest three arcs for my campaign." />

    <template #add>
      <CanonAddRow v-model="draft" placeholder="A new arc, by its name…" input-label="A new arc" label="Add arc" :create="addArc" />
    </template>

    <template #entry>
      <CanonEntryPane v-if="open" :key="open.id" kind="Arc" delete-label="Delete this arc" close-label="Close this arc" data-testid="arc-detail" @close="close" @delete="remove(open)">
        <template #title>
          <AppInput :key="nameRevision" v-model.lazy="name" wrap size="body" tone="filled" aria-label="The arc's name" maxlength="80" />
        </template>

        <template #who>
          <SegmentedControl :model-value="open.status" :options="ARC_STATUS_OPTIONS" aria-label="Where the arc stands" @update:model-value="setStatus" />
        </template>

        <!-- No Suggest: the Familiar's canon helper has no arcs mode, and the request fell through to suggesting truths. -->
        <CanonBlock title="The arc">
          <AppInput v-model.lazy="summary" wrap size="body" tone="filled" aria-label="What the arc is about" placeholder="What it is about, in a line…" />
          <AppInput v-model.lazy="question" wrap size="body" tone="filled" aria-label="The question it asks" placeholder="The question it asks…" />
          <AppInput v-model.lazy="stakes" wrap size="body" tone="filled" aria-label="What is at stake" placeholder="What is at stake…" />
          <label class="flex items-center gap-2">
            <span class="text-eyebrow text-muted-foreground">Theme</span>
            <AppSelect :model-value="open.theme_id" tone="filled" weight="normal" size="body" class="min-w-0 flex-1" aria-label="The theme it carries" @update:model-value="setTheme">
              <option :value="null">No theme</option>
              <option v-for="t in themes" :key="t.id" :value="t.id">{{ t.title }}</option>
            </AppSelect>
          </label>
          <AppInput v-if="open.status === 'ended'" v-model.lazy="ending" wrap size="body" tone="filled" aria-label="How it ended" placeholder="How it ended…" />
        </CanonBlock>

        <CanonBlock title="What is in it">
          <ArcContents :arc-id="open.id" />
        </CanonBlock>
      </CanonEntryPane>
    </template>
  </CanonChapter>
</template>

<script setup lang="ts">
/**
 * The Arcs chapter: the story's acts in the DM's order, each with where it stands. An arc opens beside the list with its
 * status, its line, the question it asks, what is at stake, its theme and (once ended) how it ended, then what is filed in
 * it. Every text saves when its field is left and emptying an optional one clears it. Leaving Ended throws the ending
 * away, so a written ending is asked about first (`statusPatch` clears it in the same write). The open arc is
 * `?arc=<id>`, which this chapter owns, so `/canon/arcs/:id` (a redirect) and a link from a theme land on it.
 */
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import AppInput from "@/components/common/controls/AppInput.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import SegmentedControl from "@/components/common/controls/SegmentedControl.vue";
import ArcContents from "./ArcContents.vue";
import CanonAddRow from "./CanonAddRow.vue";
import CanonBlock from "./kit/CanonBlock.vue";
import CanonChapter from "./kit/CanonChapter.vue";
import CanonEmpty from "./kit/CanonEmpty.vue";
import CanonEntryPane from "./kit/CanonEntryPane.vue";
import CanonRow from "./kit/CanonRow.vue";
import { useCanonArcActions, useCanonArcs, type CanonArc, type CanonArcStatus } from "@/composables/canon/useCanonArcs";
import { useCanonEntries } from "@/composables/canon/useCanonEntries";
import { useCommittedText } from "@/composables/canon/useCommittedText";
import { useConfirm } from "@/composables/useConfirm";
import { ARC_STATUS_OPTIONS, statusPatch } from "@/lib/canon/canonArcs";
import { endsOf } from "@/lib/canon/canonOrder";
import { chapterOf } from "@/lib/canon/canonParts";

const STATUS_LABEL: Record<CanonArcStatus, string> = { planned: "Planned", running: "Running", ended: "Ended" };
const chapter = chapterOf("arcs");

const route = useRoute();
const router = useRouter();
const { data } = useCanonArcs();
const arcs = computed(() => data.value ?? []);
const { data: entries } = useCanonEntries();
const themes = computed(() => (entries.value ?? []).filter((e) => e.part === "premise" && e.premise_kind === "theme").map((e) => ({ id: e.id, title: e.title })));
const actions = useCanonArcActions();
const { confirm } = useConfirm();

const arcParam = computed(() => (typeof route.query.arc === "string" ? route.query.arc : null));
const open = computed(() => arcs.value.find((a) => a.id === arcParam.value) ?? null);
const select = (id: string) => void router.replace({ query: { ...route.query, arc: id } });
const close = () => void router.replace({ query: { ...route.query, arc: undefined } });

const draft = ref("");
async function addArc(title: string) {
  const created = await actions.add.mutateAsync({ name: title, sort_order: arcs.value.length });
  select(created.id);
}

// The open arc's fields. A blank name puts the old one back; an emptied optional field writes null.
const { text: name, revision: nameRevision } = useCommittedText(() => (open.value === null ? "" : open.value.name), (next) => {
  if (open.value) actions.update.mutate({ id: open.value.id, patch: { name: next } });
});
type OptionalText = "summary" | "question" | "stakes" | "ending";
function optionalText(field: OptionalText) {
  return computed({
    get: () => (open.value === null || open.value[field] === null ? "" : open.value[field]),
    set: (typed: string) => {
      const arc = open.value;
      if (arc === null) return;
      const next = typed.trim() === "" ? null : typed.trim();
      if (next !== arc[field]) actions.update.mutate({ id: arc.id, patch: { [field]: next } });
    },
  });
}
const summary = optionalText("summary");
const question = optionalText("question");
const stakes = optionalText("stakes");
const ending = optionalText("ending");

// Both act on the open arc; the template only shows them while one is open.
async function setStatus(next: CanonArcStatus) {
  const arc = open.value;
  if (arc === null) return;
  if (arc.status === "ended" && next !== "ended" && arc.ending !== null && !(await confirm("This arc is no longer over, so how it ended is cleared. Carry on?", { title: "Clear how it ended", confirmLabel: "Clear it" }))) return;
  actions.update.mutate({ id: arc.id, patch: statusPatch(arc, next) });
}

function setTheme(themeId: string | null) {
  const arc = open.value;
  if (arc === null) return;
  actions.update.mutate({ id: arc.id, patch: { theme_id: themeId } });
}

async function remove(arc: CanonArc) {
  if (!(await confirm("Delete this arc? Its entries stay, in no arc.", { title: "Delete this arc", confirmLabel: "Delete" }))) return;
  actions.remove.mutate(arc.id);
  close();
}
</script>
