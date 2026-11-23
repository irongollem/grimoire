<template>
  <section v-if="rows.length > 0" class="flex flex-col gap-2" aria-label="Deleted" data-testid="canon-deleted">
    <AppButton
      variant="ghost"
      size="sm"
      class="self-start"
      :label="`Deleted (${rows.length})`"
      :icon="open ? IconChevronDown : IconChevronRight"
      icon-size="xs"
      :aria-expanded="open"
      data-testid="deleted-toggle"
      @click="open = !open"
    />
    <Transition v-bind="drawerTransition()">
      <div v-show="open" class="flex flex-col gap-2" data-testid="deleted-list">
        <p class="m-0 text-caption text-muted-foreground">Kept for thirty days with their clues, steps, passages and links, then gone for good.</p>
        <ul class="m-0 flex list-none flex-col border border-border bg-card p-0">
          <li v-for="row in rows" :key="row.id" class="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-3 py-2 last:border-b-0" data-testid="deleted-row">
            <div class="flex min-w-0 flex-1 flex-col">
              <span class="truncate text-body text-foreground">{{ row.title }}</span>
              <span class="text-caption text-muted-foreground">{{ partWords(row.part) }}, deleted {{ deletedOn(row.deleted_at) }}. {{ keptFor(row.deleted_at) }}</span>
            </div>
            <AppButton variant="outline" size="sm" label="Restore" :loading="restoring === row.id" data-testid="deleted-restore" @click="restore(row)" />
            <AppButton variant="ghost" size="sm" label="Delete for good" data-testid="deleted-forever" @click="forever(row)" />
          </li>
        </ul>
      </div>
    </Transition>
  </section>
</template>

<script setup lang="ts">
/** The Deleted list at the foot of the Canon page: what was deleted in the last thirty days, with Restore (#1255 item 17). */
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import AppButton from "@/components/common/controls/AppButton.vue";
import { useCanonTrash, useDeleteForGood, useRestoreCanonEntry, type CanonTrashRow } from "@/composables/canon/useCanonTrash";
import { useConfirm } from "@/composables/useConfirm";
import { IconChevronDown, IconChevronRight } from "@/lib/icons";
import { drawerTransition } from "@/lib/motion";
import { pluralizeCount } from "@/lib/utils";

/** How long the database keeps a deleted entry (purge-canon-trash). */
const KEPT_DAYS = 30;
const DAY_MS = 86_400_000;

const PART_WORDS: Record<string, string> = {
  truth: "a truth",
  secret: "a secret",
  force: "a force",
  question: "a question",
  lore: "lore",
  backstory: "a backstory",
  premise: "a premise line",
};

const trash = useCanonTrash();
const { mutateAsync: restoreEntry } = useRestoreCanonEntry();
const { mutate: deleteForGood } = useDeleteForGood();
const { confirm } = useConfirm();
const router = useRouter();

const rows = computed(() => trash.data.value ?? []);
const open = ref(false);
const restoring = ref<string | null>(null);

function partWords(part: string): string {
  return PART_WORDS[part] ?? part;
}

function deletedOn(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function keptFor(iso: string): string {
  const left = Math.max(0, KEPT_DAYS - Math.floor((Date.now() - new Date(iso).getTime()) / DAY_MS));
  return left === 0 ? "Goes today." : `Kept ${pluralizeCount(left, "more day")}.`;
}

async function restore(row: CanonTrashRow) {
  restoring.value = row.id;
  try {
    const entryId = await restoreEntry(row.id);
    void router.push({ path: "/canon", query: { entry: entryId } });
  } catch {
    // The mutation has already told the DM (toast); the row stays listed.
  } finally {
    restoring.value = null;
  }
}

async function forever(row: CanonTrashRow) {
  if (!(await confirm("Delete this for good? It cannot be restored.", { title: "Delete for good", confirmLabel: "Delete for good" }))) return;
  deleteForGood(row.id);
}
</script>
