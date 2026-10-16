<template>
  <div class="flex flex-col gap-3" data-board-controls>
    <div class="flex flex-wrap items-end gap-3">
      <div class="min-w-48 flex-1 space-y-1.5">
        <label :for="`${uid}-name`" class="text-eyebrow font-semibold text-muted-foreground">Name</label>
        <AppInput
          :id="`${uid}-name`"
          v-model="draft.name"
          tone="card"
          size="heading"
          placeholder="The Notice Board at The Pulled Sugar Inn"
        />
      </div>
      <div class="space-y-1.5">
        <p class="text-eyebrow font-semibold text-muted-foreground">Surface</p>
        <SegmentedControl :model-value="board.surface" :options="SURFACE_OPTIONS" size="md" @update:model-value="setSurface" />
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-3">
      <SegmentedControl
        :model-value="board.is_revealed ? 'shown' : 'hidden'"
        :options="REVEAL_OPTIONS"
        size="md"
        @update:model-value="(value) => setRevealed(value === 'shown')"
      />
      <AppButton
        v-if="board.is_revealed && !board.presented_at"
        variant="primary"
        size="md"
        :icon="IconCast"
        label="Present now"
        tooltip="Opens this board on every player's screen so the table can take notices from it, until you stop presenting."
        :disabled="presenting.isPending.value"
        @click="present(true)"
      />
      <AppButton
        v-else-if="board.presented_at"
        variant="outline"
        size="md"
        :icon="IconCast"
        label="Stop presenting"
        tooltip="Closes the board on every player's screen. They can still read it from the portal."
        :disabled="presenting.isPending.value"
        @click="present(false)"
      />
      <span v-if="board.presented_at" class="text-caption font-semibold text-primary" role="status">
        On every player's screen now
      </span>
      <AppButton
        variant="outline"
        size="md"
        :icon="IconShuffle"
        :label="board.scatter.length ? 'Scatter again' : 'Add scatter'"
        tooltip="Strews old tacks and torn scraps over the empty parts of the board, so it looks used. The emptier the board, the more."
        :disabled="update.isPending.value"
        data-scatter-add
        @click="addScatter"
      />
      <AppButton
        v-if="board.scatter.length"
        variant="ghost"
        size="md"
        :icon="IconEraser"
        label="Clear scatter"
        :disabled="update.isPending.value"
        data-scatter-clear
        @click="setScatter([])"
      />
      <AutosaveStatus class="ml-auto" :status="status" :error="saveError" />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * The board's own settings: its name (which saves itself), its surface, who can see it, whether the table is looking
 * at it together right now, and its scatter of old tacks and scraps. Reveal, Present and the scatter write at once, because they are decisions at the table and a
 * debounce would leave the players waiting on a toggle that looks already thrown.
 */
import { reactive, useId, watch } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import SegmentedControl from "@/components/common/controls/SegmentedControl.vue";
import AutosaveStatus from "@/components/common/feedback/AutosaveStatus.vue";
import { useAutosave } from "@/composables/useAutosave";
import {
  usePresentNoticeBoard,
  useSetNoticeBoardRevealed,
  useUpdateNoticeBoard,
} from "@/composables/noticeBoards/useNoticeBoards";
import { IconCast, IconEraser, IconShuffle } from "@/lib/icons";
import { scatterBoard } from "@/lib/noticeBoard/scatter";
import type { NoticeBoard, NoticeBoardSurface, NoticePinFace, NoticeScatterPiece } from "@/types/noticeBoard.types";

const { board, pins } = defineProps<{
  board: NoticeBoard;
  /** What is on the board (up and taken), which the scatter keeps clear of. */
  pins: readonly NoticePinFace[];
}>();

const uid = useId();
const update = useUpdateNoticeBoard();
const reveal = useSetNoticeBoardRevealed();
const presenting = usePresentNoticeBoard();

const SURFACE_OPTIONS = [
  { value: "cork", label: "Cork, oak frame" },
  { value: "planks", label: "Planks, pine frame" },
] as const;
const REVEAL_OPTIONS = [
  { value: "hidden", label: "Hidden from players" },
  { value: "shown", label: "Shown to players" },
] as const;

const draft = reactive({ name: board.name });
const { status, dirty, saving, saveError, saveNow, reset, hold, release } = useAutosave({
  draft,
  initial: () => ({ name: board.name }),
  equal: (a, b) => a.name.trim() === b.name.trim(),
  // A board with no name is not saved: the list would show a blank card.
  canSave: () => !!draft.name.trim(),
  errorMessage: "Could not save this board",
  async save(snapshot) {
    await update.mutateAsync({ id: board.id, update: { name: snapshot.name.trim() } });
  },
});

// Our own save echoes back trimmed; only a rename from elsewhere, with nothing unsaved here, replaces the field.
watch(
  () => board.name,
  (name) => {
    if (!dirty.value && !saving.value && name !== draft.name.trim()) reset({ name });
  },
);

function setSurface(surface: NoticeBoardSurface) {
  if (surface !== board.surface) update.mutate({ id: board.id, update: { surface } });
}
function setRevealed(value: boolean) {
  if (value !== board.is_revealed) reveal.mutate({ boardId: board.id, revealed: value });
}
function present(value: boolean) {
  presenting.mutate({ boardId: board.id, present: value });
}
// Worked out from the pins as they stand now and stored, so it stays put when a pin moves later; a fresh seed each
// press, so pressing again re-rolls it.
function addScatter() {
  setScatter(scatterBoard(pins, crypto.randomUUID()));
}
function setScatter(scatter: NoticeScatterPiece[]) {
  update.mutate({ id: board.id, update: { scatter } });
}

defineExpose({ saveNow, hold, release });
</script>
