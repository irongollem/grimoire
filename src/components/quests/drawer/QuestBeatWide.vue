<template>
  <div v-if="beat" class="flex min-w-0 flex-col" aria-label="The beat, wide">
    <!-- At a site, the site leads: the rooms and the plan take the full width above the two columns. -->
    <section v-if="siteWithRooms" class="flex flex-col gap-3 border-b border-border px-6 py-5" aria-label="The site">
      <div class="flex flex-wrap items-center gap-2">
        <h3 class="mr-auto text-heading-sm font-bold text-foreground">{{ siteWithRooms.name }}</h3>
        <AppButton
          :icon="IconImages"
          :label="siteWithRooms.is_map_shared ? 'Hide map from players' : 'Show map to players'"
          size="sm"
          variant="subtle"
          :loading="sharing"
          @click="toggleMapShared"
        />
        <AppButton v-if="!siteLeft" label="Leave site" size="sm" variant="subtle" @click="siteLeft = true" />
        <AppButton v-else label="Enter site" :icon="IconDoor" size="sm" variant="subtle" @click="siteLeft = false" />
      </div>
      <QuestSiteHandoff v-if="showSite && context && threadId" :thread-id="threadId" :beat="beat" :context="context" @advance="emit('advance')" />
    </section>

    <div class="grid gap-0 lg:grid-cols-2">
      <div class="flex min-w-0 flex-col gap-5 px-6 py-5">
        <QuestBeatAttachmentsPanel :beat="beat" :attachments="beatAttachments" @open="selectedAttachment = $event" />
        <QuestPayoffPanel :beat="beat" :edges="edges" :beats="beats" :consequences="consequences" :loot="beatLoot" />

        <section v-if="hasNotes" class="flex flex-col gap-2" aria-label="The quest's notes">
          <AppButton
            label="The quest's notes"
            :icon="notesOpen ? IconChevronDown : IconChevronRight"
            size="xs"
            variant="subtle"
            :aria-expanded="notesOpen"
            @click="notesOpen = !notesOpen"
          />
          <p v-if="!notesOpen && notesPreview" class="truncate text-caption text-muted-foreground" data-testid="notes-preview">{{ notesPreview }}</p>
          <Transition v-bind="drawerTransition()">
            <div v-show="notesOpen" class="rounded-lg border border-border bg-card p-3 text-body">
              <RichTextViewer :content="quest?.dm_content ?? null" />
            </div>
          </Transition>
        </section>
      </div>

      <div class="flex min-w-0 flex-col gap-5 border-border px-6 py-5 lg:border-l">
        <section v-if="atTheTable" class="flex flex-col gap-3" aria-label="At the table">
          <h3 class="text-body font-bold text-foreground">At the table</h3>
          <QuestRunHeldPayoff v-if="heldLoot.length || context?.held.length" :campaign-id="beat.campaign_id" :quest-id="questId" :loot="heldLoot" :held="context?.held ?? NO_HELD" />
          <QuestRunClocks :quest-id="questId" />
        </section>
        <QuestBeatWideRead :beat="beat" :edges="edges" :reached-beat-ids="reachedBeatIds" :party-beat-ids="partyBeatIds" @edit-text="emit('edit-text')" />
        <QuestBeatWidePrep :beat="beat" :edges="edges" :beats="beats" :gaps="presentations[beat.id]?.prepGaps ?? NO_GAPS" />
      </div>
    </div>

    <QuestRunContainedTool
      v-if="selectedAttachment"
      :attachment="selectedAttachment"
      :return-to="questLinkHref(questId, { beat: beat.id, open: true })"
      :beat-title="beat.title"
      @close="selectedAttachment = null"
    />
  </div>
  <p v-else class="px-6 py-16 text-center text-body text-muted-foreground">This beat is missing or unavailable.</p>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { useUpdateLocation } from "@/composables/locations/useLocations";
import { useBeatStagedSite } from "@/composables/quests/useBeatStagedSite";
import {
  useLootPlacements,
  useQuestBeatAttachmentSummaries,
  useQuestBeatEdges,
  useQuestBeatTransitionsForQuest,
  useQuestBeats,
  useQuestConsequences,
  useQuestRuntimeContext,
} from "@/composables/quests/useQuestFlow";
import { useQuestClocks } from "@/composables/quests/useQuestClocks";
import { useToast } from "@/composables/useToast";
import { IconChevronDown, IconChevronRight, IconDoor, IconImages } from "@/lib/icons";
import { drawerTransition } from "@/lib/motion";
import { hasBeatText } from "@/lib/quests/beatText";
import { questLinkHref } from "@/lib/quests/navigation";
import { lootHeldByTheRun } from "@/lib/quests/run";
import { partyBeatIdsOf, reachedBeatIdsOf } from "@/lib/quests/visibility";
import type { QuestBeatPrepGap, QuestBeatPresentation } from "@/lib/quests/presentation";
import { tiptapToPlainText } from "@/lib/tiptap/tiptapText";
import type { Quest, QuestBeatAttachmentSummary, QuestHeldPayoff, QuestThread } from "@/types/quest.types";
import AppButton from "@/components/common/controls/AppButton.vue";
import RichTextViewer from "@/components/common/richtext/RichTextViewer.vue";
import QuestBeatAttachmentsPanel from "../inspector/QuestBeatAttachmentsPanel.vue";
import QuestPayoffPanel from "../inspector/QuestPayoffPanel.vue";
import QuestRunClocks from "../run/QuestRunClocks.vue";
import QuestRunHeldPayoff from "../run/QuestRunHeldPayoff.vue";
import QuestRunToolLoadError from "../run/QuestRunToolLoadError.vue";
import QuestSiteHandoff from "../run/QuestSiteHandoff.vue";
import QuestBeatWidePrep from "./QuestBeatWidePrep.vue";
import QuestBeatWideRead from "./QuestBeatWideRead.vue";

const QuestRunContainedTool = defineAsyncComponent({
  loader: () => import("../run/QuestRunContainedTool.vue"),
  errorComponent: QuestRunToolLoadError,
  onError: (_error, retry, fail, attempts) => (attempts < 2 ? retry() : fail()),
});

/**
 * A beat's wide part (#1194, frame 10): everything about it the column has no
 * room for, shown beside the column when the drawer is wide. At a site the site
 * leads, full width. Left: who and what is here, what the party gets on arriving,
 * the quest's notes folded. Right: what players read, then prep. Reads its own
 * data through the same composables the column does; the drawer only says which
 * beat and where the party stands.
 */
const { questId, beatId, quest, focusThreadId, currentBeatIdByThread, presentations } = defineProps<{
  questId: string;
  beatId: string;
  quest: Quest | null;
  threads: QuestThread[];
  /** The thread the designer follows when the URL names none. */
  /** Null when the quest has no live thread yet. */
  focusThreadId: string | null;
  /** Where each thread's cursor stands, keyed by thread id. */
  currentBeatIdByThread: Record<string, string | null>;
  presentations: Record<string, QuestBeatPresentation>;
}>();
// The column owns the one text form; `advance` is the site handoff's own Advance button.
const emit = defineEmits<{ "edit-text": []; advance: [] }>();

const NO_GAPS: QuestBeatPrepGap[] = [];
const NO_HELD: QuestHeldPayoff[] = [];
const route = useRoute();
const toast = useToast();
const threadId = computed(() => (typeof route.query.thread === "string" && route.query.thread) || focusThreadId);

const questIdRef = computed(() => questId);
const beatsQuery = useQuestBeats(questIdRef);
const edgesQuery = useQuestBeatEdges(questIdRef);
const attachmentsQuery = useQuestBeatAttachmentSummaries(questIdRef);
const lootQuery = useLootPlacements({ questId: questIdRef });
const consequencesQuery = useQuestConsequences(questIdRef);
const transitionsQuery = useQuestBeatTransitionsForQuest(questIdRef);
const contextQuery = useQuestRuntimeContext(questIdRef, threadId);
const clocksQuery = useQuestClocks(questIdRef);
const context = computed(() => contextQuery.data.value ?? null);

const beats = computed(() => beatsQuery.data.value ?? []);
const edges = computed(() => edgesQuery.data.value ?? []);
const consequences = computed(() => consequencesQuery.data.value ?? []);
const beat = computed(() => beats.value.find((row) => row.id === beatId) ?? null);
const beatAttachments = computed(() => (attachmentsQuery.data.value ?? []).filter((row: QuestBeatAttachmentSummary) => row.beat_id === beatId));
const beatLoot = computed(() => (lootQuery.data.value ?? []).filter((row) => row.beat_id === beatId));
// What waits on the DM at the table: loot the run holds, held rules, and the clocks.
const heldLoot = computed(() => lootHeldByTheRun(lootQuery.data.value ?? [], transitionsQuery.data.value ?? [], questId));
const atTheTable = computed(() => heldLoot.value.length > 0 || (context.value?.held.length ?? 0) > 0 || (clocksQuery.data.value?.length ?? 0) > 0);
const partyBeatIds = computed(() => partyBeatIdsOf(currentBeatIdByThread));
const reachedBeatIds = computed(() => reachedBeatIdsOf(transitionsQuery.data.value ?? []));

// ── the site ──
const { siteWithRooms } = useBeatStagedSite(() => beat.value?.staged_at_location_id ?? null);
const siteLeft = ref(false);
const showSite = computed(() => !!siteWithRooms.value && !siteLeft.value);
const { mutate: updateLocation, isPending: sharing } = useUpdateLocation();
function toggleMapShared() {
  const site = siteWithRooms.value;
  if (!site) return;
  updateLocation({ id: site.id, update: { is_map_shared: !site.is_map_shared } }, { onError: (caught) => toast.error(toast.fromError(caught)) });
}

// ── the contained tool ──
const selectedAttachment = ref<QuestBeatAttachmentSummary | null>(null);
watch(() => beatId, () => { siteLeft.value = false; selectedAttachment.value = null; });

// ── the quest's notes, folded ──
const hasNotes = computed(() => hasBeatText(quest?.dm_content));
const notesOpen = ref(false);
const notesPreview = computed(() => tiptapToPlainText(quest?.dm_content).split("\n").find((line) => line.trim() !== "")?.trim() ?? null);
</script>
