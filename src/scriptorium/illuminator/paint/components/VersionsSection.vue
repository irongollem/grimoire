<template>
  <section class="flex flex-col gap-3 p-4" aria-label="Versions">
    <AppButton
      variant="subtle"
      size="xs"
      :icon="IconSave"
      label="Save version"
      :disabled="!canSave"
      :loading="busy"
      data-testid="save-version"
      @click="emit('save')"
    />
    <p class="text-caption text-muted-foreground" data-testid="versions-count">
      {{ versions.length }} of {{ cap }} kept. <template v-if="!isPro">Pro keeps {{ proCap }}.</template>
    </p>

    <ul v-if="rows.length > 0" class="flex flex-col gap-1" aria-label="Saved versions, newest first">
      <li
        v-for="version in rows"
        :key="version.id"
        class="flex flex-col gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-1.5"
        :data-testid="`version-${version.id}`"
      >
        <div class="flex items-center gap-2">
          <div class="min-w-0 flex-1">
            <AppInput
              v-if="renamingId === version.id"
              v-model="renameDraft"
              size="xs"
              aria-label="Version name"
              data-testid="rename-version"
              @keydown.enter.stop.prevent="commitRename(version)"
              @keydown.escape.stop.prevent="renamingId = null"
              @blur="commitRename(version)"
            />
            <span v-else class="block truncate text-body text-foreground" @dblclick="startRename(version)">{{ version.name }}</span>
            <span class="block text-caption text-muted-foreground">{{ savedAt(version) }}</span>
          </div>
          <AppButton
            variant="ghost"
            size="icon-xs"
            :icon="IconDelete"
            :ariaLabel="`Delete ${version.name}`"
            :disabled="busy"
            @click="emit('remove', version.id)"
          />
        </div>
        <AppButton
          variant="subtle"
          size="xs"
          :icon="IconUndo"
          label="Go back to this"
          :disabled="busy || !ready"
          @click="emit('go-back', version.id)"
        />
      </li>
    </ul>
    <p v-else class="text-caption text-muted-foreground">Save a version to keep this painting as it is now and come back to it later.</p>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import { IconDelete, IconSave, IconUndo } from "@/lib/icons";
import type { PaintVersion } from "../../lib/treatment";
import { PRO_VERSIONS } from "../usePaintVersions";

/** The Versions blade of the painting panel: named snapshots of the painting to go back to. Newest on top. */
const { versions, cap, isPro = false, canSave = true, busy = false, ready = true } = defineProps<{
  /** Oldest first, as the recipe keeps them. */
  versions: readonly PaintVersion[];
  /** How many this plan keeps. */
  cap: number;
  isPro?: boolean;
  canSave?: boolean;
  busy?: boolean;
  /** A painting session is running, so a version can be loaded into it. */
  ready?: boolean;
}>();

const emit = defineEmits<{
  (e: "save"): void;
  (e: "go-back", id: string): void;
  (e: "rename", id: string, name: string): void;
  (e: "remove", id: string): void;
}>();

const proCap = PRO_VERSIONS;
const rows = computed(() => [...versions].reverse());

const when = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
function savedAt(version: PaintVersion): string {
  const date = new Date(version.savedAt);
  return Number.isNaN(date.getTime()) ? "" : when.format(date);
}

const renamingId = ref<string | null>(null);
const renameDraft = ref("");
function startRename(version: PaintVersion) {
  renamingId.value = version.id;
  renameDraft.value = version.name;
}
function commitRename(version: PaintVersion) {
  if (renamingId.value !== version.id) return; // Escape already closed it; the blur that follows must not commit.
  renamingId.value = null;
  const name = renameDraft.value.trim();
  if (name !== "" && name !== version.name) emit("rename", version.id, name);
}
</script>
