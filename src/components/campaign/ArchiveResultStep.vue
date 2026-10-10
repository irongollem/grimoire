<template>
  <div class="space-y-5">
    <div class="space-y-1">
      <h3 class="text-heading font-bold text-foreground">Import complete</h3>
      <p class="text-caption text-muted-foreground">"{{ displayName }}" is in your campaign, for your eyes only.</p>
    </div>

    <ul class="divide-y divide-border rounded-lg border border-border bg-card">
      <li v-for="row in rows" :key="row.kind" class="flex items-center justify-between gap-2 p-3">
        <span class="text-body text-foreground">{{ ARCHIVE_KIND_PLURALS[row.kind] }}</span>
        <div class="flex items-center gap-3">
          <span class="text-body text-muted-foreground">{{ row.line }}</span>
          <AppButton v-if="row.created > 0" variant="ghost" size="inline" label="View" :icon-right="IconExternalLink" :to="LIST_ROUTES[row.kind]" />
        </div>
      </li>
    </ul>

    <p v-if="run.finishError" class="text-caption text-destructive">
      Everything was written, but the import could not be marked finished: {{ run.finishError }}
    </p>

    <div v-if="report.failures.length" class="space-y-1">
      <p class="text-caption font-semibold text-destructive">
        {{ report.failures.length }} {{ report.failures.length === 1 ? "problem" : "problems" }}
      </p>
      <ul class="max-h-48 space-y-0.5 overflow-y-auto">
        <li v-for="failure in report.failures.slice(0, LIST_CAP)" :key="failure.ref + failure.message" class="text-caption text-muted-foreground">
          <span class="text-foreground">{{ failure.title }}</span>: {{ failure.message }}
        </li>
        <li v-if="report.failures.length > LIST_CAP" class="text-caption italic text-muted-foreground">
          and {{ report.failures.length - LIST_CAP }} more
        </li>
      </ul>
    </div>

    <p v-for="note in report.notes.slice(0, LIST_CAP)" :key="note" class="text-caption text-muted-foreground">{{ note }}</p>

    <div v-if="report.unresolvedLinks.length" class="space-y-1">
      <AppButton
        variant="ghost"
        size="inline"
        :label="`${report.unresolvedLinks.length} ${report.unresolvedLinks.length === 1 ? 'link' : 'links'} left as plain text`"
        :icon-right="linksOpen ? IconChevronDown : IconChevronRight"
        :aria-expanded="linksOpen"
        @click="linksOpen = !linksOpen"
      />
      <ul v-if="linksOpen" class="max-h-56 space-y-0.5 overflow-y-auto rounded-md border border-border bg-muted/30 p-2">
        <li v-for="link in report.unresolvedLinks.slice(0, LIST_CAP)" :key="link.page + link.target" class="text-caption text-muted-foreground">
          <span class="text-foreground">{{ link.page }}</span> to "{{ link.target }}": {{ link.reason }}
        </li>
        <li v-if="report.unresolvedLinks.length > LIST_CAP" class="text-caption italic text-muted-foreground">
          and {{ report.unresolvedLinks.length - LIST_CAP }} more
        </li>
      </ul>
    </div>

    <ArchiveAiExtract :candidates="aiCandidates" :display-name="displayName" />

    <div class="flex justify-end">
      <AppButton variant="primary" size="md" label="Done" @click="emit('done')" />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * The result of a wiki-export import (#932): what was created, linked or
 * ignored per kind with a link to each list, anything that went wrong, the links
 * that stayed plain text, and the optional AI pass.
 */
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import ArchiveAiExtract from "@/components/campaign/ArchiveAiExtract.vue";
import { IconChevronDown, IconChevronRight, IconExternalLink } from "@/lib/icons";
import type { ArchiveSweepRun } from "@/composables/campaign/useArchiveImport";
import { ARCHIVE_CREATE_ORDER, type ArchiveRecordKind } from "@/lib/archiveImport/archiveSweep";
import { ARCHIVE_KIND_PLURALS } from "@/lib/archiveImport/sortGroups";
import type { ArchivePage } from "@/lib/archiveImport/types";

const { run, pages, displayName } = defineProps<{
  run: ArchiveSweepRun;
  /** Every page of the export, for naming the ones the AI pass can read. */
  pages: readonly ArchivePage[];
  displayName: string;
}>();
const emit = defineEmits<{ done: [] }>();

const LIST_CAP = 100;

/** List-view route per kind, for the "View" links (Post-Mutation Navigation: the list is the confirmation). */
const LIST_ROUTES: Record<ArchiveRecordKind, string> = {
  npc: "/npcs",
  location: "/locations",
  faction: "/factions",
  item: "/vault",
  quest: "/quests",
  note: "/notes",
};

const report = computed(() => run.report);
const linksOpen = ref(false);

const rows = computed(() =>
  ARCHIVE_CREATE_ORDER.map((kind) => {
    const o = report.value.perKind[kind];
    const parts = [
      `${o.created} created`,
      o.linked > 0 ? `${o.linked} linked` : null,
      o.ignored > 0 ? `${o.ignored} ignored` : null,
      o.failed > 0 ? `${o.failed} failed` : null,
      o.stoppedAtQuota ? "plan limit reached" : null,
    ].filter((p): p is string => p !== null);
    return { kind, created: o.created, line: parts.join(", "), any: o.created + o.linked + o.ignored + o.failed > 0 };
  }).filter((row) => row.any),
);

const aiCandidates = computed(() => {
  const createdRefs = new Set(report.value.created.map((c) => c.ref));
  return pages.filter((page) => createdRefs.has(page.ref));
});
</script>
