<template>
  <section id="sessions-chronicle" class="flex scroll-mt-4 flex-col gap-3" aria-labelledby="sessions-chronicle-heading">
    <div class="flex flex-wrap items-center gap-3">
      <h2 id="sessions-chronicle-heading" class="m-0 min-w-0 flex-1 text-heading-sm font-semibold text-foreground">Chronicle</h2>
      <SegmentedControl v-model="ui.chronicleOrder" :options="ORDER_OPTIONS" size="sm" aria-label="Order" />
    </div>
    <p class="m-0 text-caption text-muted-foreground">What has happened, session by session. A session's notes are its chronicle entry; nothing is written twice.</p>

    <ListSkeleton v-if="isLoading" variant="rows" :count="3" />
    <p v-else-if="isError" role="alert" class="text-body text-destructive">Could not load the chronicle.</p>
    <template v-else>
      <ol v-if="shown.length > 0" class="m-0 flex list-none flex-col border border-border bg-card px-4 py-0" data-testid="chronicle-list">
        <ChronicleEntry v-for="item in shown" :key="item.session.id" :session="item.session" :note="item.note" :canon="canonOf(item.session)" />
      </ol>
      <EmptyState
        v-else
        class="border border-dashed border-border bg-card"
        title="No sessions yet"
        description="A session's notes are its chronicle entry. Log a session, or start one, and write what happened."
      />
      <AppButton v-if="ordered.length > shown.length" variant="outline" size="sm" class="self-start" :label="`Show ${Math.min(PAGE, ordered.length - shown.length)} more`" @click="visible += PAGE" />
    </template>

    <ChronicleAlmanac :lore="lore" :forces="forces" :ticks="ticks" :steps="steps" :items="items" :calendar-events="calendarEvents" />
  </section>
</template>

<script setup lang="ts">
/**
 * What has happened, session by session. Each entry is the note linked to a session; a session with
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
import { useChronicle } from "@/composables/sessions/useChronicle";
import { useSessionCanon } from "@/composables/canon/useSessionCanon";
import { useSessionsUiStore } from "@/stores/ui/sessions";
import ChronicleAlmanac from "./ChronicleAlmanac.vue";
import ChronicleEntry from "./ChronicleEntry.vue";
import { orderChronicle, type ChronicleOrder } from "@/lib/canon/canonChronicle";
import type { CanonEntry } from "@/types/canon.types";
import type { CampaignSession } from "@/types/session.types";

const { lore, forces } = defineProps<{ lore: readonly CanonEntry[]; forces: readonly CanonEntry[] }>();

const PAGE = 10;
const ORDER_OPTIONS: ReadonlyArray<{ value: ChronicleOrder; label: string }> = [
  { value: "newest", label: "Newest first" },
  { value: "start", label: "From the start" },
];

const ui = useSessionsUiStore();
const { items, isLoading, isError } = useChronicle();
const canonBySession = useSessionCanon();
const canonOf = (session: CampaignSession) => canonBySession.value(session);
const { data: forceData } = useCanonForceData();
const ticks = computed(() => forceData.value?.ticks ?? []);
const steps = computed(() => forceData.value?.steps ?? []);
const { data: calendarEventData } = useCampaignCalendarEvents();
const calendarEvents = computed(() => calendarEventData.value ?? []);

const visible = ref(PAGE);
const ordered = computed(() => orderChronicle(items.value, ui.chronicleOrder));
const shown = computed(() => ordered.value.slice(0, visible.value));
</script>
