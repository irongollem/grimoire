<template>
  <article class="rounded-md border border-border bg-background/40 p-3 space-y-2">
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <div class="flex flex-wrap items-center gap-2">
          <h3 class="truncate text-label-lg text-foreground">{{ pack.name }}</h3>
          <span class="rounded-full px-2 py-0.5 text-caption-sm font-semibold" :class="statusBadgeClass">
            {{ pack.status }}
          </span>
          <span
            v-if="pack.ai_provenance"
            class="inline-flex items-center gap-1 rounded-full bg-tone-arcane/15 px-2 py-0.5 text-caption-sm text-tone-arcane"
            :title="aiTooltip"
          >
            <IconGenerate class="h-3 w-3" />AI
          </span>
        </div>
        <p class="text-caption text-muted-foreground">
          {{ pack.pack_id }} · v{{ pack.pack_version }} · {{ counts.drawn }}/{{ counts.declared }} slots drawn
        </p>
        <p class="mt-1 line-clamp-2 text-caption text-muted-foreground">{{ pack.description || "No description" }}</p>
        <div v-if="pack.license_keys.length" class="mt-1 flex flex-wrap gap-1">
          <span
            v-for="key in pack.license_keys"
            :key="key"
            class="rounded-full bg-muted px-2 py-0.5 text-caption-sm uppercase text-muted-foreground"
          >{{ key }}</span>
        </div>
      </div>
      <AppButton
        v-if="run"
        variant="ghost"
        size="icon-xs"
        :icon="expanded ? IconChevronUp : IconChevronDown"
        :aria-label="expanded ? 'Hide run' : 'Show run'"
        @click="expanded = !expanded"
      />
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <AppButton
        variant="outline"
        size="xs"
        :icon="IconEdit"
        :label="editing ? 'Close editor' : 'Edit'"
        @click="editing = !editing"
      />
      <AppButton
        v-if="pack.status !== 'published'"
        variant="primary"
        size="xs"
        :icon="IconGlobe"
        label="Publish"
        :loading="publish.isPending.value"
        :disabled="!publishable || publish.isPending.value"
        :tooltip="publishable ? undefined : `${counts.required - counts.requiredDrawn} required slots still have no art`"
        @click="handlePublish"
      />
      <AppButton
        v-else
        variant="outline"
        size="xs"
        :icon="IconArchive"
        label="Unpublish"
        :loading="unpublish.isPending.value"
        :disabled="unpublish.isPending.value"
        @click="handleUnpublish"
      />
      <AppButton
        variant="destructive"
        size="xs"
        :icon="IconDelete"
        label="Delete"
        :disabled="pack.status === 'published' || remove.isPending.value"
        :loading="remove.isPending.value"
        :tooltip="pack.status === 'published' ? 'Unpublish before deleting' : undefined"
        @click="handleDelete"
      />
    </div>
    <p v-if="actionError" class="text-caption text-tone-danger">{{ actionError }}</p>

    <LibraryTilePackEditor v-if="editing" :pack="pack" />

    <LibraryTilePackRunProgress v-if="run && expanded" :pack="pack" :run="run" />
    <p v-else-if="run && run.status === 'completed'" class="text-caption text-muted-foreground">
      Generation complete — {{ run.completed_jobs }}/{{ run.total_jobs }} tiles.
    </p>
  </article>
</template>

<script setup lang="ts">
/**
 * #889 S4 — one row of the library-set list: identity, publish state and the
 * publish/unpublish/delete actions, plus (S5) its generation run's progress.
 *
 * Calls its own `useLibraryTilePacks()` instance rather than receiving the
 * mutations as props, so `publish.isPending` etc. stay scoped to THIS row —
 * a shared mutation instance across every row would light up every button's
 * spinner for one pack's publish.
 */
import { ref, computed, watch } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import { IconGlobe, IconArchive, IconDelete, IconChevronUp, IconChevronDown, IconGenerate, IconEdit } from "@/lib/icons";
import { describeLibraryPackError, useLibraryTilePacks } from "@/composables/cartographer/useLibraryTilePacks";
import { useConfirm } from "@/composables/useConfirm";
import { coverageCounts } from "@/cartographer/packCoverage";
import LibraryTilePackEditor from "./LibraryTilePackEditor.vue";
import LibraryTilePackRunProgress from "./LibraryTilePackRunProgress.vue";
import type { LibraryTilePack, TilePackGenerationJob, TilePackGenerationRun } from "@/cartographer/userPack.types";

type RunWithJobs = TilePackGenerationRun & { tile_pack_generation_jobs: TilePackGenerationJob[] };

const props = defineProps<{
  pack: LibraryTilePack;
  run?: RunWithJobs;
}>();

const { publish, unpublish, remove } = useLibraryTilePacks();
const { confirm } = useConfirm();

// Terminal-and-quiet runs start collapsed; anything still in progress, or that
// failed and needs attention, starts open. A manual toggle wins after that —
// this only sets the initial state.
const busy = (status: string) => !["completed", "cancelled"].includes(status);
const expanded = ref(props.run ? busy(props.run.status) : false);

// ...and the same rule again when a run ARRIVES, which is now the common case.
// The runs query polls, so a row rendered before its run exists mounts with
// `run` undefined and would stay collapsed for ever — the progress card simply
// never appeared. That was survivable when the only way to get a run was
// `create_library`, which made the pack and the run together; #900 lets an
// admin start a run against a pack already on screen, so the row is always
// mounted first. Keyed on the run's id rather than its presence so a manual
// collapse is not undone on every poll.
watch(() => props.run?.id, (id, previousId) => {
  if (id && id !== previousId && props.run) expanded.value = busy(props.run.status);
});
const editing = ref(false);
const actionError = ref("");

// Declared slots vs slots that actually have art. Reporting only the declared
// count would say "57 tiles" for a pack holding none — every bundled pack
// declares its full slot list, and ten of the twelve shipped zero images and
// rendered as procedural placeholders. Since finding and filling those packs
// is what this surface is for, the number it shows has to tell them apart.
// The walk itself lives in `packCoverage` because the editor, the slot grid
// and the publish gate all need the same answer (#900).
const counts = computed(() => coverageCounts(props.pack.manifest));

// The same condition `publish_library_pack` enforces (`hasCompleteArt`), read
// here only to disable the button and say why. The server stays the authority
// — this is not a second gate, it is the reason shown before a round trip that
// could only ever come back refused.
const publishable = computed(() => counts.value.requiredDrawn === counts.value.required);

const statusBadgeClass = computed(() => {
  if (props.pack.status === "published") return "bg-tone-success/15 text-tone-success";
  if (props.pack.status === "archived") return "bg-tone-caution/15 text-tone-caution";
  return "bg-muted text-muted-foreground";
});

const aiTooltip = computed(() => {
  const provenance = props.pack.ai_provenance;
  return provenance ? `${provenance.provider} · ${provenance.model}` : undefined;
});

async function handlePublish(): Promise<void> {
  actionError.value = "";
  try {
    await publish.mutateAsync(props.pack.id);
  } catch (caught) {
    actionError.value = describeLibraryPackError(caught);
  }
}

async function handleUnpublish(): Promise<void> {
  actionError.value = "";
  try {
    await unpublish.mutateAsync(props.pack.id);
  } catch (caught) {
    actionError.value = describeLibraryPackError(caught);
  }
}

async function handleDelete(): Promise<void> {
  actionError.value = "";
  const accepted = await confirm(
    `Delete "${props.pack.name}" and all of its stored tiles? This cannot be undone.`,
    { title: "Delete library pack?", confirmLabel: "Delete pack" },
  );
  if (!accepted) return;
  try {
    await remove.mutateAsync(props.pack.id);
  } catch (caught) {
    actionError.value = describeLibraryPackError(caught);
  }
}
</script>
