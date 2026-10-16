<template>
  <div class="flex flex-col gap-4" data-pin-list>
    <section v-for="group in groups" :key="group.id" class="flex flex-col gap-1" :data-group="group.id">
      <h3 class="text-eyebrow font-semibold text-muted-foreground">{{ group.title }}</h3>
      <p v-if="!group.pins.length" class="text-caption italic text-muted-foreground">{{ group.empty }}</p>
      <ul v-else class="flex flex-col gap-1">
        <li v-for="(pin, index) in group.pins" :key="pin.id" class="flex items-center gap-1">
          <AppButton
            variant="menu"
            size="sm"
            block
            class="min-w-0 flex-1"
            :active="pin.id === selectedId"
            :label="rowLabel(pin)"
            @click="emit('select', pin.id)"
          />
          <template v-if="group.id === 'up'">
            <AppButton
              variant="subtle"
              size="icon-xs"
              :icon="IconChevronUp"
              :aria-label="`Move ${rowLabel(pin)} earlier in reading order`"
              :disabled="index === 0"
              @click="emit('move', pin.id, -1)"
            />
            <AppButton
              variant="subtle"
              size="icon-xs"
              :icon="IconChevronDown"
              :aria-label="`Move ${rowLabel(pin)} later in reading order`"
              :disabled="index === group.pins.length - 1"
              @click="emit('move', pin.id, 1)"
            />
          </template>
          <AppButton
            v-else-if="group.id === 'taken'"
            variant="outline"
            size="xs"
            label="Pin back up"
            @click="emit('pin-back-up', pin.id)"
          />
        </li>
      </ul>
    </section>
  </div>
</template>

<script setup lang="ts">
/**
 * The board as a list: what is up (in reading order, which is the order a screen reader and a keyboard meet the
 * pins in), what is still a draft, and what players have taken. The place to reach a pin that is hard to hit on the
 * board itself, and the only place to change the order.
 */
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import { IconChevronDown, IconChevronUp } from "@/lib/icons";
import { pinLabel, stubLabel, toPinFace } from "@/lib/noticeBoard/faces";
import type { NoticeBoardPin } from "@/types/noticeBoard.types";

const { pins, selectedId = null, takerName } = defineProps<{
  /** Every pin of the board, in sort order. */
  pins: readonly NoticeBoardPin[];
  selectedId?: string | null;
  /** The party member's name for a taken_by id. */
  takerName: (memberId: string | null) => string | null;
}>();
const emit = defineEmits<{
  select: [id: string];
  move: [id: string, direction: -1 | 1];
  "pin-back-up": [id: string];
}>();

const groups = computed(() => [
  { id: "up", title: "On the board", empty: "Nothing is pinned up yet.", pins: pins.filter((p) => p.status === "up") },
  { id: "draft", title: "Drafts", empty: "No drafts. A new notice waits here until you put it up.", pins: pins.filter((p) => p.status === "draft") },
  { id: "taken", title: "Taken", empty: "Nobody has taken a notice yet.", pins: pins.filter((p) => p.status === "taken") },
]);

function rowLabel(pin: NoticeBoardPin): string {
  const face = toPinFace(pin, takerName(pin.taken_by));
  return pin.status === "taken" ? `${pinLabel(face)} (${stubLabel(face)})` : pinLabel(face);
}
</script>
