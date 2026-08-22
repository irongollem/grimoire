<template>
  <article
    class="group relative flex flex-col rounded-lg border bg-card p-3 shadow-sm transition-[border-color,box-shadow,transform,opacity] motion-safe:hover:-translate-y-px hover:border-primary/50 hover:shadow-lg"
    :class="[
      dragging ? 'opacity-40' : '',
      summary?.isLive ? 'border-primary ring-2 ring-primary/15' : 'border-border',
    ]"
    :draggable="draggable"
    @dragstart="onDragStart"
    @dragend="emit('dragend')"
  >
    <div class="flex items-start gap-2">
      <RouterLink
        :to="`/quests/${quest.id}`"
        class="min-w-0 flex-1 font-fell text-base font-semibold leading-tight text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 rounded-sm"
      >
        {{ quest.title || "Untitled Quest" }}
      </RouterLink>
      <!-- Same words and same glyph as the graph node and the outline: one
           vocabulary for one fact, so a DM never has to learn that "Live" here
           and "Party is here" there mean the same thing. -->
      <span
        v-if="summary?.isLive"
        class="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-label font-bold uppercase tracking-wider text-primary-foreground"
      >
        <IconParty class="h-3 w-3" aria-hidden="true" />
        Party is here
      </span>
      <!-- A suspended chain still holds its place; it just is not where the
           table is right now. -->
      <span
        v-else-if="summary?.runtimeStatus === 'paused'"
        class="inline-flex shrink-0 items-center gap-1 rounded-full border border-border px-2 py-0.5 text-label font-semibold uppercase tracking-wider text-muted-foreground"
      >
        <IconParty class="h-3 w-3" aria-hidden="true" />
        Paused here
      </span>
    </div>

    <p
      v-if="quest.summary"
      class="mt-1 font-fell text-sm italic leading-snug text-muted-foreground line-clamp-3"
    >
      {{ quest.summary }}
    </p>

    <div
      v-if="summary?.beatSegments.length"
      class="mt-3 flex items-center gap-1"
      :aria-label="`${summary.beatSegments.length} prepared story beats`"
    >
      <span
        v-for="(segment, index) in summary.beatSegments"
        :key="index"
        class="h-1 flex-1 rounded-full"
        :class="segmentClass(segment)"
        aria-hidden="true"
      />
    </div>

    <div
      v-if="summary?.currentBeatTitle"
      class="mt-2 flex items-start gap-1.5 text-caption text-muted-foreground"
    >
      <IconChevronRight class="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
      <span>Current: <strong class="font-fell text-sm font-semibold text-foreground">{{ summary.currentBeatTitle }}</strong></span>
    </div>

    <div v-if="hasSummaryChips" class="mt-2 flex flex-wrap gap-1">
      <span
        v-if="summary!.prepGapCount"
        class="inline-flex items-center gap-1 rounded border border-dashed border-tone-caution/40 bg-tone-caution/10 px-1.5 py-0.5 text-label text-tone-caution"
      >
        <IconWarning class="h-3 w-3" aria-hidden="true" />
        {{ summary!.prepGapCount }} prep {{ summary!.prepGapCount === 1 ? "gap" : "gaps" }}
      </span>
      <span
        v-if="summary!.undispatchedLootCount || summary!.unclaimedLootCount"
        class="inline-flex items-center gap-1 rounded border border-tone-arcane/30 bg-tone-arcane/10 px-1.5 py-0.5 text-label text-tone-arcane"
      >
        <IconLoot class="h-3 w-3" aria-hidden="true" />
        {{ lootLabel }}
      </span>
      <span
        v-if="summary && !summary.prepGapCount && !summary.undispatchedLootCount && !summary.unclaimedLootCount"
        class="inline-flex items-center gap-1 rounded bg-tone-success/10 px-1.5 py-0.5 text-label text-tone-success"
      >
        <IconCheck class="h-3 w-3" aria-hidden="true" />
        Ready
      </span>
    </div>

    <div v-else-if="quest.tags.length" class="mt-2 flex flex-wrap gap-1">
      <span
        v-for="tag in quest.tags.slice(0, 3)"
        :key="tag"
        class="rounded bg-muted px-1.5 py-0.5 text-label text-muted-foreground"
      >{{ tag }}</span>
    </div>

    <footer class="mt-3 grid gap-2 border-t border-muted pt-2 text-caption-sm text-muted-foreground">
      <div class="flex min-w-0 items-center gap-2">
        <div
          v-if="visibleParty.length"
          class="flex shrink-0 -space-x-1.5"
          :aria-label="`Shared with ${visibleParty.map((member) => member.name).join(', ')}`"
        >
          <span
            v-for="member in visibleParty.slice(0, 4)"
            :key="member.id"
            class="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full border-2 border-card bg-secondary font-cinzel text-label font-semibold text-foreground"
            :title="member.name"
          >
            <img
              v-if="member.portrait_url"
              :src="member.portrait_url"
              :alt="member.name"
              class="h-full w-full object-cover"
            />
            <span v-else aria-hidden="true">{{ initials(member.name) }}</span>
          </span>
          <span
            v-if="hiddenPartyCount"
            class="relative z-10 flex h-6 items-center justify-center rounded-full border-2 border-card bg-muted px-1.5 text-label font-semibold"
            :title="hiddenPartyLabel"
          >+{{ hiddenPartyCount }} {{ hiddenPartyCount === 1 ? "player" : "players" }}</span>
        </div>

        <span class="min-w-0 truncate italic">Updated {{ timeAgo(quest.updated_at) }}</span>
      </div>

      <div class="flex min-w-0 items-center gap-1.5">
        <AppButton
          v-if="previousStatus"
          :icon="IconChevronLeft"
          :tooltip="`Move to ${QUEST_STATUS_LABELS[previousStatus]}`"
          :aria-label="`Move ${quest.title || 'quest'} to ${QUEST_STATUS_LABELS[previousStatus]}`"
          size="xs"
          variant="subtle"
          @click="emit('move', previousStatus)"
        />
        <AppButton
          v-if="nextStatus"
          :icon="IconChevronRight"
          :tooltip="`Move to ${QUEST_STATUS_LABELS[nextStatus]}`"
          :aria-label="`Move ${quest.title || 'quest'} to ${QUEST_STATUS_LABELS[nextStatus]}`"
          size="xs"
          variant="subtle"
          @click="emit('move', nextStatus)"
        />
        <AppButton
          v-if="showAction"
          :to="actionTo"
          :icon="IconChevronRight"
          label="Open"
          size="xs"
          variant="subtle"
          class="ml-auto"
        />
      </div>
    </footer>
  </article>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import {
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconLoot,
  IconParty,
  IconWarning,
} from "@/lib/icons";
import { timeAgo } from "@/lib/utils";
import type { QuestBoardSummary, QuestBeatSegment } from "@/lib/quests/board";
import type { PartyMember } from "@/types/party.types";
import {
  QUEST_STATUSES,
  QUEST_STATUS_LABELS,
  type Quest,
  type QuestStatus,
} from "@/types/quest.types";
import AppButton from "@/components/common/AppButton.vue";

const { quest, party = [], summary, dragging = false, draggable = true } = defineProps<{
  quest: Quest;
  party?: PartyMember[];
  summary?: QuestBoardSummary;
  dragging?: boolean;
  draggable?: boolean;
}>();

const emit = defineEmits<{
  dragstart: [questId: string];
  dragend: [];
  move: [status: QuestStatus];
}>();

const visibleParty = computed(() => {
  const ids = new Set(quest.player_visible_to ?? []);
  return party.filter((member) => ids.has(member.id));
});
const hiddenPartyCount = computed(() => Math.max(visibleParty.value.length - 4, 0));
const hiddenPartyLabel = computed(() => `${hiddenPartyCount.value} more ${hiddenPartyCount.value === 1 ? "player" : "players"}`);
const statusIndex = computed(() => QUEST_STATUSES.indexOf(quest.status));
const previousStatus = computed<QuestStatus | null>(() => QUEST_STATUSES[statusIndex.value - 1] ?? null);
const nextStatus = computed<QuestStatus | null>(() => QUEST_STATUSES[statusIndex.value + 1] ?? null);

const hasSummaryChips = computed(() => summary !== undefined);
const showAction = computed(() => !["completed", "failed"].includes(quest.status));
const actionTo = computed(() => `/quests/${quest.id}`);

const lootLabel = computed(() => {
  if (!summary) return "";
  if (summary.undispatchedLootCount) {
    return `${summary.undispatchedLootCount} loot to drop`;
  }
  return `${summary.unclaimedLootCount} unclaimed`;
});

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "?";
}

function segmentClass(segment: QuestBeatSegment) {
  return {
    done: "bg-tone-success",
    here: "bg-primary",
    gap: "quest-board-segment-gap",
    upcoming: "bg-muted",
  }[segment];
}

function onDragStart(event: DragEvent) {
  // Firefox will not start an HTML drag unless at least one data flavor is set.
  // The board still owns the in-memory id; this payload only makes native DnD
  // interoperable across engines and is never trusted as application state.
  event.dataTransfer?.setData("text/plain", quest.id);
  if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  emit("dragstart", quest.id);
}
</script>

<style scoped>
.quest-board-segment-gap {
  background: repeating-linear-gradient(
    90deg,
    color-mix(in oklab, var(--color-tone-caution) 65%, transparent) 0 0.25rem,
    transparent 0.25rem 0.5rem
  );
}
</style>
