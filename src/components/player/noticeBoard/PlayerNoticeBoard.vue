<template>
  <div class="relative h-full w-full">
    <NoticeBoardViewport :surface="board.surface" :scatter="board.scatter" :pins="pins" :selected-id="selectedId" @select="onSelect" />

    <NoticePinReader :open="selectedPin !== null" :face="selectedPin" :origin="origin" :surface="board.surface" @close="closeReader">
      <template #actions>
        <p v-if="selectedPin?.offers && !presented" class="mr-auto max-w-xs text-caption italic text-muted-foreground" data-take-hint>
          {{ TAKE_WAITS }}
        </p>
        <AppButton v-if="selectedPin?.offers" variant="primary" size="md" label="Take this notice" :disabled="!presented" :loading="taking" @click="take" />
      </template>
    </NoticePinReader>
  </div>
</template>

<script setup lang="ts">
/**
 * A board as a player meets it: the viewport, the lean-in reader and the take flow, shared by the board's page and by
 * the overlay that opens when the DM presents it (#1064). Reading is never gated. Take waits for the table: the RPC
 * refuses a board that is not presented, and the button says why instead of failing.
 *
 * Losing a race is an answer, not an error: "Chicory got there first" and the handout opens all the same, because a
 * notice reveals to the whole party and nobody gains by being quicker. The tear-off itself is the viewport's job.
 */
import { computed, ref, watch } from "vue";
import { useRouter } from "vue-router";
import AppButton from "@/components/common/controls/AppButton.vue";
import NoticeBoardViewport from "@/components/noticeBoard/NoticeBoardViewport.vue";
import NoticePinReader from "@/components/noticeBoard/NoticePinReader.vue";
import { useTakeNoticePin } from "@/composables/noticeBoards/usePlayerNoticeBoards";
import { useToast } from "@/composables/useToast";
import { noticePhrase } from "@/lib/noticeBoard/faces";
import { inReadingOrder } from "@/lib/noticeBoard/readingOrder";
import type { PlayerNoticeBoard, PlayerNoticePin } from "@/types/noticeBoard.types";

const TAKE_WAITS = "Taking a notice happens at the table, when your DM brings the party to the board.";

const { board } = defineProps<{ board: PlayerNoticeBoard }>();
// Something opened a page over the board (a handout); an overlay hosting this closes itself rather than cover it.
const emit = defineEmits<{ navigated: [] }>();

const router = useRouter();
const toast = useToast();
const { mutateAsync: takePin, isPending: taking } = useTakeNoticePin();

const presented = computed(() => board.presented_at !== null);
const pins = computed(() => inReadingOrder(board.pins));

const selectedId = ref<string | null>(null);
const origin = ref<HTMLElement | null>(null);
const selectedPin = computed(() => {
  const pin = pins.value.find((p) => p.id === selectedId.value);
  // A pin torn off while it is being read has nothing left to read.
  return pin && pin.status === "up" ? pin : null;
});

function onSelect(id: string, el: HTMLElement) {
  origin.value = el;
  selectedId.value = id;
}
function closeReader() {
  selectedId.value = null;
}

/** Pins this tab took, so a ring that reports them taken is not announced back to the taker as someone else's doing. */
const tookHere = new Set<string>();
const lastStatus = new Map<string, PlayerNoticePin["status"]>(board.pins.map((p) => [p.id, p.status]));

watch(
  () => board.pins,
  (next) => {
    for (const pin of next) {
      const before = lastStatus.get(pin.id);
      lastStatus.set(pin.id, pin.status);
      if (before !== "up" || pin.status !== "taken" || tookHere.has(pin.id)) continue;
      const who = pin.taken_by_name ?? "Someone";
      const handoutId = pin.handout_id;
      toast.info(
        `${who} took ${noticePhrase(pin)}.`,
        undefined,
        handoutId ? { action: { label: "Read it", run: () => openHandout(handoutId) } } : undefined,
      );
    }
  },
);

function openHandout(id: string) {
  emit("navigated");
  void router.push({ name: "play-handout", params: { id } });
}
function openQuest(id: string) {
  emit("navigated");
  void router.push({ name: "play-quest-detail", params: { id } });
}

async function take() {
  const pin = selectedPin.value;
  if (!pin) return;
  tookHere.add(pin.id);
  try {
    const result = await takePin(pin.id);
    closeReader();
    if (result.outcome === "taken") {
      const questId = result.quest_id;
      // A notice may carry only a handout, which opens below; only a quest lands in the quest log.
      toast.success(
        questId ? `You took ${noticePhrase(pin)}. It is in your quest log.` : `You took ${noticePhrase(pin)}.`,
        undefined,
        questId ? { action: { label: "Open quest", run: () => openQuest(questId) } } : undefined,
      );
    } else {
      toast.info(`${result.taken_by_name ?? "Someone"} got there first.`);
    }
    if (result.handout_id) openHandout(result.handout_id);
  } catch (e) {
    tookHere.delete(pin.id);
    toast.error(toast.fromError(e));
  }
}
</script>
