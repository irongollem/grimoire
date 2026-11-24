<template>
  <!-- A column under the contents from 90rem; one row beside the chapter picker below that. -->
  <section class="flex flex-wrap items-center gap-2 min-[90rem]:flex-col min-[90rem]:flex-nowrap min-[90rem]:items-stretch" aria-label="Arcs" data-testid="canon-arcs">
    <span class="text-eyebrow text-muted-foreground">Arc</span>
    <div v-if="arcs.length > 0" class="flex min-w-0 items-center gap-1">
      <AppSelect v-model="filter" tone="filled" weight="normal" size="body" class="min-w-0 flex-1" aria-label="Show the canon of one arc">
        <option :value="null">Everything</option>
        <option v-for="arc in arcs" :key="arc.id" :value="arc.id">{{ arc.name }}</option>
      </AppSelect>
      <AppButton v-if="filter !== null" variant="ghost" size="sm" label="Clear" data-testid="arc-clear" @click="filter = null" />
    </div>
    <p v-else class="m-0 text-caption text-muted-foreground">Group the canon by the story it belongs to.</p>
    <AppButton
      variant="outline"
      size="sm"
      class="self-start"
      :icon="arcs.length > 0 ? IconEdit : IconAdd"
      icon-size="xs"
      :label="arcs.length > 0 ? 'Manage arcs' : 'Add an arc'"
      aria-haspopup="dialog"
      data-testid="arcs-toggle"
      @click="open = true"
    />

    <AppModal :open="open" size="lg" @close="open = false">
      <ModalHeader title="Arcs" subtitle="The stories the canon belongs to. Choosing one narrows every part to it." closeable @close="open = false" />
      <div id="canon-arcs-panel" class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-5 py-4" data-testid="arcs-panel">
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
      <!-- The name and the line share the row; the button keeps to one line (it wrapped into a tall block here). -->
      <form class="flex flex-col gap-2 sm:flex-row sm:items-center" @submit.prevent="add">
        <AppInput v-model="name" tone="filled" size="body" class="min-w-0 sm:basis-2/5" placeholder="A new arc, by its name…" aria-label="A new arc" maxlength="80" />
        <AppInput v-model="summary" tone="filled" size="body" class="min-w-0 sm:flex-1" placeholder="What it is about, in a line…" aria-label="What the new arc is about" />
        <AppButton type="submit" variant="outline" class="shrink-0 self-end whitespace-nowrap sm:self-auto" :icon="IconAdd" icon-size="xs" label="Add arc" :loading="actions.add.isPending.value" :disabled="name.trim() === ''" />
      </form>
      </div>
    </AppModal>
  </section>
</template>

<script setup lang="ts">
/**
 * The Canon page's arc control (#1255 item 11), in the contents column on a desktop and above a narrowed part below
 * that: "Arc: everything / one arc" narrows every part at once (and the contents' counts with it), and "Manage arcs"
 * opens the dialog where arcs are made, shaped (status, question, stakes, theme, ending), put in order and deleted. An arc is the one grouping, so there
 * are no free tags. The chosen arc lives in the page's store; a deleted arc clears itself from it.
 */
import { computed, ref, watch } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import AppModal from "@/components/common/overlays/AppModal.vue";
import ModalHeader from "@/components/common/overlays/ModalHeader.vue";
import CanonArcRow from "./CanonArcRow.vue";
import { useCanonArcActions, useCanonArcs, type CanonArc, type CanonArcStatus } from "@/composables/canon/useCanonArcs";
import { statusPatch } from "@/lib/canon/canonArcs";
import { useCanonEntries } from "@/composables/canon/useCanonEntries";
import { useConfirm } from "@/composables/useConfirm";
import { IconAdd, IconEdit } from "@/lib/icons";
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
