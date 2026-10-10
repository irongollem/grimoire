<template>
  <div class="space-y-4">
    <div class="space-y-1">
      <h3 class="text-heading-sm font-semibold text-foreground">
        {{ result.pages.length }} {{ result.pages.length === 1 ? "page" : "pages" }} found
      </h3>
      <p class="text-caption text-muted-foreground">
        Looks like {{ SOURCE_LABELS[result.source] }}<template v-if="result.sourceEvidence.length">
          ({{ result.sourceEvidence.join("; ") }})</template>. Check what each page is. The guess comes from its folder, tags
        and layout.
      </p>
    </div>

    <ul class="flex flex-wrap gap-x-4 gap-y-1 text-caption text-muted-foreground" aria-label="Pages per kind">
      <li v-for="kind in ARCHIVE_KIND_ORDER" :key="kind" :class="counts[kind] === 0 ? 'opacity-50' : 'text-foreground'">
        {{ counts[kind] }} {{ ARCHIVE_KIND_PLURALS[kind] }}
      </li>
    </ul>

    <div v-if="result.skipped.length" class="space-y-1">
      <AppButton
        variant="ghost"
        size="inline"
        :label="`${result.skipped.length} ${result.skipped.length === 1 ? 'file' : 'files'} not read`"
        :icon-right="skippedOpen ? IconChevronDown : IconChevronRight"
        :aria-expanded="skippedOpen"
        @click="skippedOpen = !skippedOpen"
      />
      <ul v-if="skippedOpen" class="max-h-56 space-y-0.5 overflow-y-auto rounded-md border border-border bg-muted/30 p-2">
        <li v-for="skip in shownSkips" :key="skip.path" class="flex flex-wrap gap-x-2 text-caption">
          <span class="break-all text-foreground">{{ skip.path }}</span>
          <span class="text-muted-foreground">{{ skip.reason }}</span>
        </li>
        <li v-if="result.skipped.length > shownSkips.length" class="text-caption italic text-muted-foreground">
          and {{ result.skipped.length - shownSkips.length }} more
        </li>
      </ul>
    </div>

    <section v-for="group in groups" :key="group.key" class="rounded-lg border border-border bg-card">
      <div class="flex flex-wrap items-center gap-2 p-2">
        <AppButton
          variant="ghost"
          size="md"
          class="min-w-0 flex-1 justify-start gap-2 px-1"
          :aria-expanded="open.has(group.key)"
          @click="toggleGroup(group.key)"
        >
          <IconChevronDown class="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform" :class="open.has(group.key) ? 'rotate-180' : ''" />
          <span class="truncate text-label-lg font-semibold text-foreground">{{ group.label }}</span>
          <span class="shrink-0 text-caption text-muted-foreground">{{ group.pages.length }}</span>
        </AppButton>
        <AppSelect
          :model-value="''"
          size="sm"
          :aria-label="`Set every page in ${group.label} to`"
          @update:model-value="(v: string) => setGroup(group, v)"
        >
          <option value="">Set all to…</option>
          <option v-for="kind in KIND_CHOICES" :key="kind" :value="kind">{{ ARCHIVE_KIND_LABELS[kind] }}</option>
        </AppSelect>
      </div>

      <ul v-if="open.has(group.key)" class="divide-y divide-border border-t border-border">
        <li v-for="page in visiblePages(group)" :key="page.ref" class="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
          <div class="min-w-0 flex-1 basis-48">
            <p class="truncate text-body text-foreground">{{ page.title }}</p>
            <p class="truncate text-caption text-muted-foreground">{{ page.kindReason }}</p>
          </div>
          <AppSelect
            :model-value="kindOf(page)"
            size="sm"
            :aria-label="`What ${page.title} is`"
            @update:model-value="(v: ArchivePageKind) => setKinds([page.ref], v)"
          >
            <option v-for="kind in KIND_CHOICES" :key="kind" :value="kind">{{ ARCHIVE_KIND_LABELS[kind] }}</option>
          </AppSelect>
        </li>
        <li v-if="group.pages.length > visibleCount(group.key)" class="p-2">
          <AppButton
            variant="ghost"
            size="inline"
            :label="`Show ${Math.min(PAGE_STEP, group.pages.length - visibleCount(group.key))} more`"
            @click="showMore(group.key)"
          />
        </li>
      </ul>
    </section>

    <div class="space-y-3 border-t border-border pt-4">
      <div>
        <label class="mb-1 block text-eyebrow font-semibold text-muted-foreground">Name *</label>
        <AppInput v-model="displayName" tone="muted" size="body" placeholder="e.g. My Obsidian vault" />
      </div>
      <AppCheckbox v-model="rightsAttested" size="md" label="I have the right to use this material." />
      <p v-if="error" class="text-caption text-destructive">{{ error }}</p>
      <div class="flex items-center justify-between gap-2">
        <AppButton variant="subtle" size="md" label="Choose different files" :disabled="submitting" @click="emit('cancel')" />
        <AppButton
          variant="primary"
          size="md"
          :label="`Continue with ${importable} ${importable === 1 ? 'page' : 'pages'}`"
          :loading="submitting"
          :disabled="importable === 0 || !rightsAttested || displayName.trim().length === 0"
          @click="emit('continue')"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * The sort step of a wiki-export import (#932), all client-side: before any
 * row exists the DM sees what the export looked like, how every page was
 * guessed, and settles each page's kind. A page is a record of exactly one
 * kind or is skipped.
 *
 * Built for two thousand pages: pages are grouped by folder and a group opens
 * only when it is small (`initiallyOpenGroups`); an open group shows a hundred
 * rows and offers more; each group has a bulk "set all to" so a big folder is
 * one choice, not hundreds.
 */
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import { IconChevronDown, IconChevronRight } from "@/lib/icons";
import {
  ARCHIVE_KIND_LABELS,
  ARCHIVE_KIND_ORDER,
  ARCHIVE_KIND_PLURALS,
  countByKind,
  groupPagesByFolder,
  initiallyOpenGroups,
  type PageGroup,
} from "@/lib/archiveImport/sortGroups";
import type { ArchivePage, ArchivePageKind, ArchiveReadResult, ArchiveSource } from "@/lib/archiveImport/types";

const { result, submitting = false, error = null } = defineProps<{
  result: ArchiveReadResult;
  submitting?: boolean;
  error?: string | null;
}>();
const emit = defineEmits<{ continue: []; cancel: [] }>();

/** The DM's settled kind per page `ref`; a page not in it keeps its guess. */
const kinds = defineModel<Map<string, ArchivePageKind>>("kinds", { required: true });
const displayName = defineModel<string>("displayName", { required: true });
const rightsAttested = defineModel<boolean>("rightsAttested", { required: true });

const SOURCE_LABELS: Record<ArchiveSource, string> = {
  grimoire: "an export from Grimoire",
  obsidian: "Obsidian",
  legendkeeper: "LegendKeeper",
  worldanvil: "World Anvil",
  unknown: "an export Grimoire does not recognise (pages are still read)",
};

/** The order of the kind picker: the people and places a DM names first, skip last. */
const KIND_CHOICES: readonly ArchivePageKind[] = ["npc", "location", "faction", "quest", "item", "note", "skip"];
const PAGE_STEP = 100;
const SKIP_LIST_CAP = 200;

const groups = computed(() => groupPagesByFolder(result.pages));
const open = ref(initiallyOpenGroups(groups.value));
const visible = ref(new Map<string, number>());
const skippedOpen = ref(false);

const shownSkips = computed(() => result.skipped.slice(0, SKIP_LIST_CAP));
const counts = computed(() => countByKind(result.pages, kinds.value));
const importable = computed(() => result.pages.length - counts.value.skip);

function kindOf(page: ArchivePage): ArchivePageKind {
  return kinds.value.get(page.ref) ?? page.kind;
}

/** Replaces the map rather than mutating it, so the model's owner sees one change however many pages moved. */
function setKinds(refs: readonly string[], kind: ArchivePageKind): void {
  const next = new Map(kinds.value);
  for (const ref of refs) next.set(ref, kind);
  kinds.value = next;
}

function setGroup(group: PageGroup, value: string): void {
  if (!(KIND_CHOICES as readonly string[]).includes(value)) return; // the "Set all to…" placeholder
  setKinds(group.pages.map((p) => p.ref), value as ArchivePageKind);
}

function toggleGroup(key: string): void {
  const next = new Set(open.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  open.value = next;
}

function visibleCount(key: string): number {
  return visible.value.get(key) ?? PAGE_STEP;
}
function visiblePages(group: PageGroup): ArchivePage[] {
  return group.pages.slice(0, visibleCount(group.key));
}
function showMore(key: string): void {
  const next = new Map(visible.value);
  next.set(key, visibleCount(key) + PAGE_STEP);
  visible.value = next;
}
</script>
