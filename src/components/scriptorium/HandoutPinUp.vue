<template>
  <div class="grid min-h-0 flex-1 overflow-y-auto overscroll-contain md:grid-cols-2">
    <section class="flex flex-col gap-1 border-b border-border px-5 py-4 md:border-r md:border-b-0">
      <h3 class="text-eyebrow text-muted-foreground">WHICH BOARD</h3>

      <ListSkeleton v-if="boardsLoading" variant="rows" :columns="1" />
      <div v-else-if="!boards.length" class="flex flex-col items-start gap-2 py-2">
        <p class="text-body text-muted-foreground">This campaign has no notice board yet.</p>
        <AppButton to="/notice-boards/new" variant="subtle" size="md" label="Make a notice board" />
      </div>
      <fieldset v-else class="m-0 border-0 p-0">
        <legend class="sr-only">Which board</legend>
        <label
          v-for="b in boards"
          :key="b.id"
          class="flex min-h-13 cursor-pointer items-center gap-3 border-b border-border/60 px-1.5 py-2 last:border-b-0"
        >
          <input v-model="boardId" type="radio" name="handout-board" :value="b.id" class="size-5 shrink-0 accent-primary" />
          <span class="flex min-w-0 flex-col">
            <span class="text-body text-foreground">{{ b.name }}</span>
            <span class="text-caption text-muted-foreground">{{ describeBoard(b, hangsAt(b.id)) }}</span>
          </span>
        </label>
      </fieldset>

      <label v-if="boards.length" class="mt-3 flex flex-col gap-1 text-caption text-muted-foreground">
        On the front
        <AppInput v-model="front" block placeholder="What the notice says" />
      </label>
    </section>

    <section class="flex flex-col gap-3 px-5 py-4">
      <h3 class="text-eyebrow text-muted-foreground">HOW IT HANGS</h3>
      <div
        v-if="board"
        class="pointer-events-none w-full max-w-72 self-center overflow-hidden rounded-md"
        inert
        aria-hidden="true"
        data-testid="pin-preview"
      >
        <NoticeBoardSurface :surface="board.surface" :scatter="board.scatter">
          <NoticeBoardPin v-for="face in previewFaces" :key="face.id" :face="face" />
        </NoticeBoardSurface>
      </div>
      <p class="text-body text-muted-foreground">
        {{ describePinStyle(pinStyle) }} Whoever takes it from the board, the whole party gets the handout and what it
        reveals.
      </p>
      <p v-if="submitError" class="text-body text-destructive" role="alert">{{ submitError }}</p>
    </section>
  </div>

  <div class="flex shrink-0 flex-wrap items-center gap-2 border-t border-border px-5 py-3">
    <p class="min-w-0 flex-1 basis-60 text-caption text-muted-foreground">It goes up now. Open the board to move it.</p>
    <AppButton variant="subtle" size="md" label="Cancel" @click="emit('close')" />
    <AppButton
      variant="primary"
      size="md"
      :icon="IconPin"
      :label="pinning ? 'Pinning…' : 'Pin it up'"
      :disabled="!board || !front.trim() || pinning"
      @click="pinUp"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * "Pin it on a board", the second half of the Give dialog (#1115, frame 11b):
 * the handout hangs on one of the campaign's notice boards as a pin that offers
 * it, on the paper it is written on. Players who take the notice get the handout
 * (the take rule lives in the database). One click: board, the line on the front,
 * Pin it up.
 */
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import ListSkeleton from "@/components/common/feedback/ListSkeleton.vue";
import NoticeBoardPin from "@/components/noticeBoard/NoticeBoardPin.vue";
import NoticeBoardSurface from "@/components/noticeBoard/NoticeBoardSurface.vue";
import { useEntityPlacementsFor } from "@/composables/locations/useLocationPlacements";
import {
  useCampaignNoticeBoardPins,
  useCreateNoticeBoardPin,
  useNoticeBoards,
} from "@/composables/noticeBoards/useNoticeBoards";
import { shareErrorMessage, type ShareableHandout } from "@/composables/scriptorium/useHandoutShare";
import { useToast } from "@/composables/useToast";
import { IconPin } from "@/lib/icons";
import { toPinFace } from "@/lib/noticeBoard/faces";
import { buildHandoutPin, describeBoard, describePinStyle, pinStyleForTheme } from "@/lib/scriptorium/handoutPin";
import type { NoticePinFace } from "@/types/noticeBoard.types";

const { handout } = defineProps<{ handout: ShareableHandout }>();
const emit = defineEmits<{ close: [] }>();

const toast = useToast();
const { data: boardsData, isLoading: boardsLoading } = useNoticeBoards();
const boards = computed(() => boardsData.value ?? []);
const { data: allPins } = useCampaignNoticeBoardPins();
const { mutateAsync: createPin, isPending: pinning } = useCreateNoticeBoardPin();

// The first board until the DM picks another.
const pickedBoard = ref<string | null>(null);
const boardId = computed({
  get: () => pickedBoard.value ?? boards.value[0]?.id ?? null,
  set: (id) => {
    pickedBoard.value = id;
  },
});
const board = computed(() => boards.value.find((b) => b.id === boardId.value) ?? null);
const boardPins = computed(() => (allPins.value ?? []).filter((p) => p.board_id === boardId.value));

const { data: placements } = useEntityPlacementsFor(
  "notice_board",
  computed(() => boards.value.map((b) => b.id)),
);
function hangsAt(id: string): string[] {
  return (placements.value ?? []).flatMap((p) => (p.notice_board_id === id && p.location ? [p.location.name] : []));
}

const front = ref(handout.title);
const submitError = ref("");
const pinStyle = computed(() => pinStyleForTheme(handout.theme));

// The new pin as it would hang: the same row Pin it up writes, drawn among the pins already there.
const newPin = computed(() =>
  board.value
    ? buildHandoutPin({
        handoutId: handout.id,
        theme: handout.theme,
        board: board.value,
        boardPins: boardPins.value,
        headline: front.value,
      })
    : null,
);
const previewFaces = computed<NoticePinFace[]>(() => {
  const mine = newPin.value;
  const others = boardPins.value.filter((p) => p.status !== "draft").map((p) => toPinFace(p, null));
  if (!mine) return others;
  return [
    ...others,
    {
      id: "preview",
      style: mine.style,
      headline: front.value.trim() || null,
      body: null,
      reward: null,
      image_url: null,
      seal: mine.seal,
      size: mine.size,
      x: mine.x,
      y: mine.y,
      status: "up",
      taken_by_name: null,
      taken_session_number: null,
    },
  ];
});

async function pinUp() {
  const row = newPin.value;
  const target = board.value;
  if (!row || !target || !front.value.trim()) return;
  submitError.value = "";
  try {
    await createPin(row);
    toast.success(`Pinned on ${target.name}.`);
    emit("close");
  } catch (e) {
    submitError.value = shareErrorMessage(e, "Could not pin it up.");
  }
}
</script>
