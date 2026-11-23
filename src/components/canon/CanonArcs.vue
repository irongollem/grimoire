<template>
  <section class="flex flex-col gap-2" aria-label="Arcs" data-testid="canon-arcs">
    <div class="flex flex-wrap items-center gap-2">
      <label v-if="arcs.length > 0" class="flex items-center gap-2">
        <span class="text-eyebrow text-muted-foreground">Show</span>
        <AppSelect v-model="filter" tone="filled" weight="normal" size="body" aria-label="Show the canon of one arc">
          <option :value="null">Everything</option>
          <option v-for="arc in arcs" :key="arc.id" :value="arc.id">{{ arc.name }}</option>
        </AppSelect>
      </label>
      <AppButton v-if="filter !== null" variant="ghost" size="sm" label="Clear" data-testid="arc-clear" @click="filter = null" />
      <AppButton variant="ghost" size="sm" label="Arcs…" :aria-expanded="open" aria-controls="canon-arcs-panel" data-testid="arcs-toggle" @click="open = !open" />
      <span v-if="arcs.length === 0" class="text-caption text-muted-foreground">Group the canon by the story it belongs to.</span>
    </div>

    <div v-if="open" id="canon-arcs-panel" class="flex flex-col gap-2 border border-border bg-card p-3" data-testid="arcs-panel">
      <ul v-if="arcs.length > 0" class="m-0 flex list-none flex-col gap-2 p-0">
        <CanonArcRow
          v-for="(arc, index) in arcs"
          :key="arc.id"
          :arc="arc"
          :first="index === 0"
          :last="index === arcs.length - 1"
          :themes="themes"
          @rename="(name) => actions.update.mutate({ id: arc.id, patch: { name } })"
          @summarise="(summary) => actions.update.mutate({ id: arc.id, patch: { summary } })"
          @status="(next) => setStatus(arc, next)"
          @patch="(patch) => actions.update.mutate({ id: arc.id, patch })"
          @move="(direction) => actions.move.mutate({ arcs, id: arc.id, direction })"
          @remove="remove(arc)"
        />
      </ul>
      <form class="flex flex-col gap-2 sm:flex-row sm:items-center" @submit.prevent="add">
        <AppInput v-model="name" tone="filled" size="body" placeholder="A new arc, by its name…" aria-label="A new arc" maxlength="80" />
        <AppInput v-model="summary" tone="filled" size="body" placeholder="What it is about, in a line…" aria-label="What the new arc is about" />
        <AppButton type="submit" variant="outline" :icon="IconAdd" icon-size="xs" label="Add arc" :loading="actions.add.isPending.value" :disabled="name.trim() === ''" />
      </form>
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * The bar at the top of the Canon page (#1255 item 11): "Show: everything / one arc" narrows every part at once, and
 * "Arcs…" opens the panel where arcs are made, shaped (status, question, stakes, theme, ending), put in order and deleted. An arc is the one grouping, so there
 * are no free tags. The chosen arc lives in the page's store; a deleted arc clears itself from it.
 */
import { computed, ref, watch } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import CanonArcRow from "./CanonArcRow.vue";
import { useCanonArcActions, useCanonArcs, type CanonArc, type CanonArcStatus } from "@/composables/canon/useCanonArcs";
import { statusPatch } from "@/lib/canon/canonArcs";
import { useCanonEntries } from "@/composables/canon/useCanonEntries";
import { useConfirm } from "@/composables/useConfirm";
import { IconAdd } from "@/lib/icons";
import { useCanonUiStore } from "@/stores/ui/canon";

const store = useCanonUiStore();
const filter = computed({
  get: () => store.arcFilter,
  set: (id: string | null) => {
    store.arcFilter = id;
  },
});

const { data, isSuccess } = useCanonArcs();
const arcs = computed(() => data.value ?? []);
const { data: entries } = useCanonEntries();
const themes = computed(() => (entries.value ?? []).filter((e) => e.part === "premise" && e.premise_kind === "theme").map((e) => ({ id: e.id, title: e.title })));
const actions = useCanonArcActions();
const { confirm } = useConfirm();

// An arc that is gone (deleted here or on another device, or the filter of another campaign) cannot stay chosen.
watch([arcs, isSuccess], () => {
  if (isSuccess.value && filter.value !== null && !arcs.value.some((a) => a.id === filter.value)) filter.value = null;
});

const open = ref(false);
const name = ref("");
const summary = ref("");

async function add() {
  const trimmed = name.value.trim();
  if (trimmed === "") return;
  try {
    await actions.add.mutateAsync({ name: trimmed, summary: summary.value.trim() === "" ? null : summary.value.trim(), sort_order: arcs.value.length });
    name.value = "";
    summary.value = "";
  } catch {
    // The mutation has already told the DM (toast); the words stay in the boxes.
  }
}

/** Leaving Ended throws the ending away, so a written ending is asked about first; nothing is written if the DM says no. */
async function setStatus(arc: CanonArc, next: CanonArcStatus) {
  if (arc.status === "ended" && arc.ending !== null && !(await confirm("This arc is no longer over, so how it ended is cleared. Carry on?", { title: "Clear how it ended", confirmLabel: "Clear it" }))) return;
  actions.update.mutate({ id: arc.id, patch: statusPatch(arc, next) });
}

async function remove(arc: CanonArc) {
  if (!(await confirm("Delete this arc? Its entries stay, in no arc.", { title: "Delete this arc", confirmLabel: "Delete" }))) return;
  actions.remove.mutate(arc.id);
}
</script>
