<template>
  <PageHeader :title="board?.name || 'Notice board'" description="Pin notices, drag them where you want them, show the board when the table is ready.">
    <template #actions>
      <PageHeaderAction
        v-if="board"
        variant="destructive"
        :disabled="isDeleting"
        :label="isDeleting ? 'Deleting…' : 'Delete'"
        :icon="IconDelete"
        @click="onDelete"
      />
      <PageHeaderAction variant="primary" label="Done" :icon="IconCheck" :collapse-label-on-mobile="false" @click="onDone" />
    </template>

    <div v-if="boardLoading" class="flex justify-center py-16"><LoadingSpinner /></div>
    <p v-else-if="!board" class="py-16 text-center text-body italic text-muted-foreground">This notice board no longer exists.</p>

    <div v-else class="flex flex-col gap-5">
      <NoticeBoardControls ref="controls" :board="board" />

      <div class="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <!-- The board, large and editable. It fills this box; on a phone it pans, and the panel stacks beneath. -->
        <div class="h-[55vh] min-h-80 overflow-hidden rounded-lg border border-border lg:sticky lg:top-0 lg:h-[70vh] lg:self-start">
          <NoticeBoardViewport
            :surface="board.surface"
            :pins="boardFaces"
            editable
            :selected-id="selectedId"
            @select="(id) => (selectedId = id)"
            @move="onMove"
          />
        </div>

        <aside class="flex min-w-0 flex-col gap-5" data-board-panel>
          <NoticePinAdd :disabled="adding" @add="onAdd" />
          <NoticePinList
            :pins="pins ?? []"
            :selected-id="selectedId"
            :taker-name="takerName"
            @select="(id) => (selectedId = id)"
            @move="onReorder"
            @pin-back-up="(id) => backUp.mutate(id)"
          />
          <NoticePinEditor
            v-if="selectedPin"
            :key="selectedPin.id"
            :pin="selectedPin"
            :taker-name="takerName(selectedPin.taken_by)"
            class="border-t border-border pt-4"
            @deleted="selectedId = null"
          />
          <div class="flex flex-col gap-1.5 border-t border-border pt-4">
            <h3 class="text-eyebrow font-semibold text-muted-foreground">Hangs at</h3>
            <EntityPlacements kind="notice_board" :entity-id="board.id" />
          </div>
        </aside>
      </div>
    </div>
  </PageHeader>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useConfirm } from "@/composables/useConfirm";
import { useParty } from "@/composables/party/useParty";
import {
  useCreateNoticeBoardPin,
  useDeleteNoticeBoard,
  useNoticeBoard,
  useNoticeBoardPins,
  usePinNoticeBackUp,
  useUpdateNoticeBoardPin,
} from "@/composables/noticeBoards/useNoticeBoards";
import { IconCheck, IconDelete } from "@/lib/icons";
import { toPinFace } from "@/lib/noticeBoard/faces";
import { findFreeSpot } from "@/lib/noticeBoard/geometry";
import type { NoticePinStyle } from "@/types/noticeBoard.types";
import PageHeader from "@/components/common/list/PageHeader.vue";
import PageHeaderAction from "@/components/common/list/PageHeaderAction.vue";
import LoadingSpinner from "@/components/common/feedback/LoadingSpinner.vue";
import EntityPlacements from "@/components/locations/place/EntityPlacements.vue";
import NoticeBoardViewport from "@/components/noticeBoard/NoticeBoardViewport.vue";
import NoticeBoardControls from "@/components/noticeBoard/editor/NoticeBoardControls.vue";
import NoticePinAdd from "@/components/noticeBoard/editor/NoticePinAdd.vue";
import NoticePinEditor from "@/components/noticeBoard/editor/NoticePinEditor.vue";
import NoticePinList from "@/components/noticeBoard/editor/NoticePinList.vue";

const route = useRoute();
const router = useRouter();
const { confirm } = useConfirm();

const boardId = computed(() => String(route.params.id));
const { data: board, isLoading: boardLoading } = useNoticeBoard(boardId);
const { data: pins } = useNoticeBoardPins(boardId);
const { data: party } = useParty();

const updatePin = useUpdateNoticeBoardPin();
const createPin = useCreateNoticeBoardPin();
const backUp = usePinNoticeBackUp();
const { mutateAsync: removeBoard } = useDeleteNoticeBoard();

const controls = ref<InstanceType<typeof NoticeBoardControls> | null>(null);
const selectedId = ref<string | null>(null);
const adding = ref(false);
const isDeleting = ref(false);

const goToList = () => router.push("/dungeon-craft?tab=notice-boards");

function takerName(memberId: string | null): string | null {
  if (memberId === null) return null;
  return party.value?.find((m) => m.id === memberId)?.name ?? null;
}

const selectedPin = computed(() => pins.value?.find((p) => p.id === selectedId.value) ?? null);
// A pin deleted elsewhere must not leave an editor open on nothing.
watch(selectedPin, (pin) => {
  if (!pin) selectedId.value = null;
});

// Drafts never reach the viewport: players would otherwise see a half-written notice the moment the board is shown,
// and the DM would arrange a notice that is not up yet.
const boardFaces = computed(() =>
  (pins.value ?? []).filter((p) => p.status !== "draft").map((p) => toPinFace(p, takerName(p.taken_by))),
);

function onMove(id: string, x: number, y: number) {
  updatePin.mutate({ id, update: { x, y } });
}

async function onAdd(style: NoticePinStyle) {
  if (!board.value) return;
  adding.value = true;
  try {
    const all = pins.value ?? [];
    const spot = findFreeSpot(all.filter((p) => p.status !== "draft"), style, "md");
    const next = all.reduce((max, p) => Math.max(max, p.sort_order), 0) + 1;
    const created = await createPin.mutateAsync({
      campaign_id: board.value.campaign_id,
      board_id: board.value.id,
      style,
      size: "md",
      seal: style === "letter" ? "red" : null,
      sort_order: next,
      status: "draft",
      ...spot,
    });
    selectedId.value = created.id;
  } finally {
    adding.value = false;
  }
}

/** Reading order is sort_order; a swap renumbers the board's pins so ties from older rows cannot swallow the move. */
function onReorder(id: string, direction: -1 | 1) {
  const up = (pins.value ?? []).filter((p) => p.status === "up");
  const from = up.findIndex((p) => p.id === id);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= up.length) return;
  const order = up.map((p) => p.id);
  [order[from], order[to]] = [order[to], order[from]];
  order.forEach((pinId, index) => {
    const current = up.find((p) => p.id === pinId);
    if (current && current.sort_order !== index) updatePin.mutate({ id: pinId, update: { sort_order: index } });
  });
}

async function onDone() {
  // Everything saves itself; Done only waits for the last keystroke to land before leaving.
  await controls.value?.saveNow();
  await goToList();
}

async function onDelete() {
  if (!board.value || !(await confirm(`Delete "${board.value.name}"? Its notices go with it. This cannot be undone.`))) return;
  isDeleting.value = true;
  try {
    // The name field must not write into a row that is about to be gone.
    await controls.value?.hold();
    await goToList();
    await removeBoard(board.value.id);
  } catch (error) {
    controls.value?.release();
    throw error;
  } finally {
    isDeleting.value = false;
  }
}
</script>
