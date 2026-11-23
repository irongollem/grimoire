<template>
  <section id="canon-chronicle" class="flex scroll-mt-4 flex-col gap-3" aria-labelledby="canon-chronicle-heading">
    <div class="flex flex-wrap items-center gap-3">
      <CanonRubric id="canon-chronicle-heading" class="min-w-0 flex-1" numeral="VIII" title="Chronicle" />
      <SegmentedControl v-model="ui.chronicleOrder" :options="ORDER_OPTIONS" size="sm" aria-label="Order" />
    </div>
    <p class="m-0 text-caption text-muted-foreground">What has happened, session by session. A session's notes are its chronicle entry; nothing is written twice.</p>

    <ListSkeleton v-if="isLoading" variant="rows" :count="3" />
    <p v-else-if="isError" role="alert" class="text-body text-destructive">Could not load the chronicle.</p>
    <template v-else>
      <ol v-if="shown.length > 0" class="m-0 flex list-none flex-col border border-border bg-card px-4 py-0" data-testid="chronicle-list">
        <ChronicleEntry v-for="item in shown" :key="item.session.id" :session="item.session" :note="item.note" />
      </ol>
      <EmptyState
        v-else
        class="border border-dashed border-border bg-card"
        title="No sessions yet"
        description="A session's notes are its chronicle entry. Log a session, or start one, and write what happened."
      />
      <AppButton v-if="ordered.length > shown.length" variant="outline" size="sm" class="self-start" :label="`Show ${Math.min(PAGE, ordered.length - shown.length)} more`" @click="visible += PAGE" />
    </template>

    <ChronicleAlmanac :lore="lore" :forces="forces" :ticks="ticks" :items="items" :calendar-events="calendarEvents" />
  </section>
</template>

<script setup lang="ts">
/**
 * Part VIII (frame 12): what has happened, session by session. Each entry is the note linked to a session; a session with
 * none offers to write it. The almanac beside it puts lore, moving forces and sessions on one timeline.
 *
 * Sessions are shown ten at a time: each entry reads what the party learned in its own session, one read per entry, so
 * a campaign with a hundred sessions must not open a hundred of them at once.
 */
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import SegmentedControl from "@/components/common/controls/SegmentedControl.vue";
import EmptyState from "@/components/common/feedback/EmptyState.vue";
import ListSkeleton from "@/components/common/feedback/ListSkeleton.vue";
import { useCanonForceData } from "@/composables/canon/useCanonForces";
import { useCampaignCalendarEvents } from "@/composables/calendar/useCampaignCalendarEvents";
import { useChronicle } from "@/composables/canon/useChronicle";
import { useCanonUiStore } from "@/stores/ui/canon";
import CanonRubric from "./CanonRubric.vue";
import ChronicleAlmanac from "./ChronicleAlmanac.vue";
import ChronicleEntry from "./ChronicleEntry.vue";
import { orderChronicle, type ChronicleOrder } from "@/lib/canon/canonChronicle";
import type { CanonEntry } from "@/types/canon.types";

const { lore, forces } = defineProps<{ lore: readonly CanonEntry[]; forces: readonly CanonEntry[] }>();

const PAGE = 10;
const ORDER_OPTIONS: ReadonlyArray<{ value: ChronicleOrder; label: string }> = [
  { value: "newest", label: "Newest first" },
  { value: "start", label: "From the start" },
];

const ui = useCanonUiStore();
const { items, isLoading, isError } = useChronicle();
const { data: forceData } = useCanonForceData();
const ticks = computed(() => forceData.value?.ticks ?? []);
const { data: calendarEventData } = useCampaignCalendarEvents();
const calendarEvents = computed(() => calendarEventData.value ?? []);

const visible = ref(PAGE);
const ordered = computed(() => orderChronicle(items.value, ui.chronicleOrder));
const shown = computed(() => ordered.value.slice(0, visible.value));
</script>
