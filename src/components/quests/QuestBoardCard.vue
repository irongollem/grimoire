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
      <span
        v-if="summary?.isLive"
        class="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-label font-bold uppercase tracking-wider text-primary-foreground"
      >
        <span class="h-1.5 w-1.5 rounded-full bg-current motion-safe:animate-pulse" aria-hidden="true" />
        Live
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
      <span>Next: <strong class="font-fell text-sm font-semibold text-foreground">{{ summary.currentBeatTitle }}</strong></span>
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

    <footer class="mt-3 flex min-h-8 items-center gap-2 border-t border-muted pt-2 text-caption-sm text-muted-foreground">
      <div
        v-if="visibleParty.length"
        class="flex -space-x-1.5"
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
          v-if="visibleParty.length > 4"
          class="flex h-6 w-6 items-center justify-center rounded-full border-2 border-card bg-muted text-label font-semibold"
          :title="`${visibleParty.length - 4} more`"
        >+{{ visibleParty.length - 4 }}</span>
      </div>

      <span class="min-w-0 truncate italic">{{ timeAgo(quest.updated_at) }}</span>

      <div class="ml-auto flex shrink-0 items-center gap-1.5">
        <AppSelect
          v-model="selectedStatus"
          size="xs"
          :aria-label="`Move ${quest.title || 'quest'} to another status`"
          class="max-w-28 text-label"
          @click.stop
        >
          <option v-for="status in QUEST_STATUSES" :key="status" :value="status">
            {{ QUEST_STATUS_LABELS[status] }}
          </option>
        </AppSelect>
        <AppButton
          v-if="showAction"
          :to="actionTo"
          :icon="summary?.isLive ? IconPlay : IconEdit"
          :label="summary?.isLive ? 'Resume' : 'Prep'"
          size="xs"
          variant="subtle"
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
  IconChevronRight,
  IconEdit,
  IconLoot,
  IconPlay,
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
import AppSelect from "@/components/common/AppSelect.vue";

const props = withDefaults(defineProps<{
  quest: Quest;
  party?: PartyMember[];
  summary?: QuestBoardSummary;
  dragging?: boolean;
  draggable?: boolean;
}>(), {
  party: () => [],
  summary: undefined,
  dragging: false,
  draggable: true,
});

const emit = defineEmits<{
  dragstart: [questId: string];
  dragend: [];
  move: [status: QuestStatus];
}>();

const selectedStatus = computed<QuestStatus>({
  get: () => props.quest.status,
  set: (status) => {
    if (status !== props.quest.status) emit("move", status);
  },
});

const visibleParty = computed(() => {
  const ids = new Set(props.quest.player_visible_to ?? []);
  return props.party.filter((member) => ids.has(member.id));
});

const hasSummaryChips = computed(() => props.summary !== undefined);
const showAction = computed(() => !["completed", "failed"].includes(props.quest.status));
const actionTo = computed(() => props.summary?.isLive
  ? { path: `/quests/${props.quest.id}`, query: { mode: "run" } }
  : { path: `/quests/${props.quest.id}`, query: { edit: "true" } });

const lootLabel = computed(() => {
  if (!props.summary) return "";
  if (props.summary.undispatchedLootCount) {
    return `${props.summary.undispatchedLootCount} loot to drop`;
  }
  return `${props.summary.unclaimedLootCount} unclaimed`;
});

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "?";
}

function segmentClass(segment: QuestBeatSegment) {
  return {
    done: "bg-tone-success",
    live: "bg-primary",
    gap: "quest-board-segment-gap",
    upcoming: "bg-muted",
  }[segment];
}

function onDragStart(event: DragEvent) {
  // Firefox will not start an HTML drag unless at least one data flavor is set.
  // The board still owns the in-memory id; this payload only makes native DnD
  // interoperable across engines and is never trusted as application state.
  event.dataTransfer?.setData("text/plain", props.quest.id);
  if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  emit("dragstart", props.quest.id);
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
