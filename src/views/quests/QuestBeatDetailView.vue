<template>
  <PageHeader :title="beat?.title || 'Quest beat'" :description="eyebrowText">
    <template #actions>
      <!-- Below `lg` these two land in the phone dock instead (frame 3) —
           hidden here so the actions do not double up. -->
      <div v-if="beat" class="hidden items-center gap-2 lg:flex">
        <AppButton label="Preview as players" size="sm" variant="subtle" @click="previewOpen = true" />
        <AppButton
          v-if="beat.visibility !== 'revealed'"
          :label="revealLabel"
          size="sm"
          :loading="revealing"
          @click="revealBeat"
        />
      </div>
    </template>

    <div v-if="isLoading" class="flex justify-center py-16"><LoadingSpinner /></div>
    <div v-else-if="beat" class="mx-auto flex w-full max-w-6xl flex-col gap-3 pb-12">
      <QuestPhoneTopBar
        :title="beat.title"
        :subtitle="`Beat · ${quest?.title ?? ''}`"
        :fallback-to="`/quests/${questId}?view=work`"
      >
        <template #action>
          <AppButton
            variant="ghost"
            size="icon-sm"
            shape="pill"
            :icon="IconEdit"
            icon-size="lg"
            aria-label="Edit this beat"
            @click="openEditor"
          />
        </template>
      </QuestPhoneTopBar>

      <!-- Below `lg`: identity chips → read-aloud → payoff → routes →
           attachments → site, each secondary section a counted fold row
           closed by default (frame 3). Above `lg` the two-column layout
           below renders exactly as before. -->
      <div class="flex flex-col gap-3 lg:hidden">
        <div class="flex flex-wrap items-center gap-1.5">
          <span class="rounded bg-muted px-1.5 py-0.5 text-label uppercase text-muted-foreground">{{ questBeatKindLabel(beat.kind) }}</span>
          <span class="rounded bg-muted px-1.5 py-0.5 text-label uppercase text-muted-foreground">{{ QUEST_BEAT_VISIBILITY_LABELS[beat.visibility] }}</span>
          <span v-if="stagedLocationName" class="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-label uppercase text-muted-foreground">
            <IconLocation class="h-3 w-3" />{{ stagedLocationName }}
          </span>
          <span v-if="prepGapCount" class="rounded bg-tone-caution/15 px-1.5 py-0.5 text-label uppercase text-ink-caution">
            {{ prepGapCount }} prep gap{{ prepGapCount === 1 ? '' : 's' }}
          </span>
        </div>

        <QuestFoldRow v-model:open="identityFoldOpen" title="Beat" :caption="identityFoldCaption" :icon="IconQuest">
          <QuestBeatIdentityFields
            v-if="belowLg"
            :beat="beat"
            :kind-options="kindOptions"
            v-model:kind="kindModel"
            v-model:visibility="visibilityModel"
            :location-options="locationOptions"
            v-model:staged-location-id="stagedLocationId"
            :staged-location-name="stagedLocationName"
            :staged-site-caption="stagedSiteCaption"
          />
        </QuestFoldRow>

        <section ref="dmContentAnchor" class="rounded-xl border border-border bg-card p-3" aria-label="Read aloud">
          <h3 class="font-cinzel text-sm font-bold text-foreground">Read aloud</h3>
          <!-- `belowLg` on the RichTextViewer itself (not just its `beat.read_aloud`
               wrapper): CLAUDE.md's motion rules reserve JS gating for exactly this —
               a Tiptap instance is "heavy", and this section's own `lg:hidden` on the
               ancestor is CSS-only, so without this the desktop copy below would stay
               a second live editor for the same content. -->
          <div v-if="beat.read_aloud && belowLg" class="mt-2 border-l-2 border-primary/50 pl-3 py-1 font-fell text-body italic text-foreground">
            <RichTextViewer :content="beat.read_aloud" />
          </div>
          <p v-else class="mt-2 text-caption italic text-muted-foreground">No read-aloud text yet</p>

          <QuestFoldRow
            v-model:open="mobileDmFoldOpen"
            title="DM content · how it plays"
            :caption="dmContentFoldCaption"
            :icon="IconEdit"
            :tone="dmContentFoldTone"
            class="mt-3"
          >
            <!-- `belowLg`-gated, same reason as `QuestBeatIdentityFields` above:
                 `QuestBeatFields` owns its own autosave draft and debounced save —
                 two live copies of the same beat would diverge the instant one is
                 typed into, and could race each other's mutation against the same
                 row. -->
            <QuestBeatFields v-if="belowLg" :key="beat.id" :beat="beat" />
          </QuestFoldRow>
          <p v-if="fieldsSaveError" role="alert" class="mt-1 text-caption text-destructive">{{ fieldsSaveError }}</p>
        </section>

        <QuestFoldRow v-model:open="mobilePayoffFoldOpen" title="Payoff" :caption="payoffFoldCaption" :icon="IconPackage">
          <QuestPayoffPanel
            v-if="belowLg"
            :beat="beat"
            :edges="edgesQuery.data.value ?? []"
            :beats="beatsQuery.data.value ?? []"
            :consequences="consequencesQuery.data.value ?? []"
            :loot="loot"
          />
        </QuestFoldRow>

        <QuestFoldRow v-model:open="mobileRoutesFoldOpen" title="Routes out" :caption="routesFoldCaption" :icon="IconShuffle">
          <QuestBeatRoutesPanel v-if="belowLg" :beat="beat" :edges="edgesQuery.data.value ?? []" :beats="beatsQuery.data.value ?? []" />
        </QuestFoldRow>

        <QuestFoldRow
          v-model:open="mobileAttachmentsFoldOpen"
          title="Attachments"
          :caption="attachmentsFoldCaption"
          :icon="IconEntityLink"
          :tone="attachmentsFoldTone"
        >
          <QuestBeatAttachmentsPanel v-if="belowLg" :beat="beat" :attachments="attachments" />
        </QuestFoldRow>

        <QuestFoldRow v-model:open="mobileSiteFoldOpen" title="Site" :caption="siteFoldCaption" :icon="IconDungeon" :tone="siteFoldTone">
          <QuestBeatSitePanel v-if="belowLg" :beat="beat" />
        </QuestFoldRow>
      </div>

      <AppButton :to="returnTo" :label="returnLabel" size="sm" variant="subtle" class="hidden self-start lg:inline-flex" />

      <div class="hidden gap-3 lg:grid lg:grid-cols-2">
        <div class="flex min-w-0 flex-col gap-3">
          <section class="rounded-xl border border-border bg-card p-3" aria-label="Beat">
            <header class="flex items-center gap-2">
              <h3 class="font-cinzel text-sm font-bold text-foreground">Beat</h3>
              <span v-if="prepGapCount" class="ml-auto rounded bg-tone-caution/15 px-1.5 py-0.5 text-label uppercase text-ink-caution">
                {{ prepGapCount }} prep gap{{ prepGapCount === 1 ? '' : 's' }}
              </span>
            </header>

            <QuestBeatIdentityFields
              v-if="!belowLg"
              class="mt-2"
              :beat="beat"
              :kind-options="kindOptions"
              v-model:kind="kindModel"
              v-model:visibility="visibilityModel"
              :location-options="locationOptions"
              v-model:staged-location-id="stagedLocationId"
              :staged-location-name="stagedLocationName"
              :staged-site-caption="stagedSiteCaption"
            />

            <div v-if="beat.read_aloud && !belowLg" class="mt-3 border-l-2 border-primary/50 pl-3 py-1 font-fell text-body italic text-foreground">
              <RichTextViewer :content="beat.read_aloud" />
            </div>

            <div class="mt-3">
              <QuestBeatFields v-if="!belowLg" :key="beat.id" :beat="beat" />
            </div>
            <p v-if="fieldsSaveError" role="alert" class="mt-1 text-caption text-destructive">{{ fieldsSaveError }}</p>
          </section>

          <QuestBeatAttachmentsPanel v-if="!belowLg" :beat="beat" :attachments="attachments" />
          <QuestBeatSitePanel v-if="!belowLg" :beat="beat" />
        </div>

        <div class="flex min-w-0 flex-col gap-3">
          <QuestBeatRoutesPanel v-if="!belowLg" :beat="beat" :edges="edgesQuery.data.value ?? []" :beats="beatsQuery.data.value ?? []" />
          <QuestPayoffPanel
            v-if="!belowLg"
            :beat="beat"
            :edges="edgesQuery.data.value ?? []"
            :beats="beatsQuery.data.value ?? []"
            :consequences="consequencesQuery.data.value ?? []"
            :loot="loot"
          />
        </div>
      </div>

      <DockBar hide-from="lg">
        <AppButton
          v-if="beat.visibility !== 'revealed'"
          :label="revealLabel"
          size="lg"
          class="min-h-12 flex-1"
          :loading="revealing"
          @click="revealBeat"
        />
        <AppButton
          v-else
          label="Preview as players"
          size="lg"
          class="min-h-12 flex-1"
          @click="previewOpen = true"
        />
        <AppButton
          variant="subtle"
          size="icon-sm"
          :icon="IconEdit"
          icon-size="lg"
          class="min-h-12 w-12"
          aria-label="Edit this beat"
          @click="openEditor"
        />
      </DockBar>
    </div>
    <p v-else class="py-16 text-center text-body text-muted-foreground">This beat is missing or unavailable.</p>

    <QuestPlayerPreviewDrawer
      v-if="previewOpen && beat"
      :quest-id="questId"
      :visible-to="quest?.player_visible_to ?? []"
      :selected-beat-id="beat.id"
      :saved-visibility="beat.visibility"
      @close="previewOpen = false"
    />
  </PageHeader>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import { useRoute } from "vue-router";
import { useQuest } from "@/composables/quests/useQuests";
import {
  useQuestBeat,
  useQuestBeatAttachmentSummaries,
  useQuestBeatEdges,
  useQuestBeats,
  useQuestConsequences,
  useUpdateQuestBeat,
  useCampaignLiveQuests,
  useLootPlacements,
} from "@/composables/quests/useQuestFlow";
import { useQuestThreads } from "@/composables/quests/useQuestThreads";
import { useLocationTree } from "@/composables/locations/useLocations";
import { useSiteStructure } from "@/composables/locations/useSiteStructure";
import { useConfirm } from "@/composables/useConfirm";
import { questReturnLabel, questSurfaceReturnTo, safeQuestReturnTo } from "@/lib/quests/navigation";
import { isSiteType } from "@/lib/locations/tiers";
import { threadBadge } from "@/lib/quests/threads";
import { countQuestBeatContentBlocks, deriveQuestBeatPrepGaps, questBeatKindLabel, QUEST_BEAT_VISIBILITY_LABELS } from "@/lib/quests/presentation";
import { QUEST_BEAT_ATTACHMENT_ADAPTERS } from "@/lib/quests/attachments";
import { useBelow } from "@/composables/useBreakpoint";
import {
  QUEST_BEAT_KINDS,
  type QuestBeatAttachmentSummary,
  type QuestBeatUpdate,
  type QuestBeatVisibility,
} from "@/types/quest.types";
import PageHeader from "@/components/common/PageHeader.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import AppButton from "@/components/common/AppButton.vue";
import DockBar from "@/components/common/DockBar.vue";
import RichTextViewer from "@/components/common/RichTextViewer.vue";
import QuestBeatAttachmentsPanel from "@/components/quests/QuestBeatAttachmentsPanel.vue";
import QuestBeatFields from "@/components/quests/QuestBeatFields.vue";
import QuestBeatIdentityFields from "@/components/quests/QuestBeatIdentityFields.vue";
import QuestBeatSitePanel from "@/components/quests/QuestBeatSitePanel.vue";
import QuestBeatRoutesPanel from "@/components/quests/QuestBeatRoutesPanel.vue";
import QuestFoldRow from "@/components/quests/QuestFoldRow.vue";
import QuestPayoffPanel from "@/components/quests/QuestPayoffPanel.vue";
import QuestPhoneTopBar from "@/components/quests/QuestPhoneTopBar.vue";
import QuestPlayerPreviewDrawer from "@/components/quests/QuestPlayerPreviewDrawer.vue";
import { IconDungeon, IconEdit, IconEntityLink, IconLocation, IconPackage, IconQuest, IconShuffle } from "@/lib/icons";

const route = useRoute();
const { confirm } = useConfirm();
const questId = computed(() => route.params.id as string);
const beatId = computed(() => route.params.beatId as string);
const { data: quest, isLoading: questLoading } = useQuest(questId);
const beatQuery = useQuestBeat(beatId);
const beatsQuery = useQuestBeats(questId);
const edgesQuery = useQuestBeatEdges(questId);
const attachmentsQuery = useQuestBeatAttachmentSummaries(questId);
const lootQuery = useLootPlacements({ questId });
const consequencesQuery = useQuestConsequences(questId);
const liveQuestsQuery = useCampaignLiveQuests();
const threadsQuery = useQuestThreads(questId);
const { locationOptions } = useLocationTree();
const updateBeat = useUpdateQuestBeat();

const beat = computed(() => beatQuery.data.value?.quest_id === questId.value ? beatQuery.data.value : null);
const attachments = computed(() => (attachmentsQuery.data.value ?? []).filter((row) => row.beat_id === beatId.value));
const loot = computed(() => (lootQuery.data.value ?? []).filter((row) => row.beat_id === beatId.value));
const isLoading = computed(() => questLoading.value || beatQuery.isLoading.value || attachmentsQuery.isLoading.value || lootQuery.isLoading.value);
const returnTo = computed(() => safeQuestReturnTo(route.query.returnTo, questSurfaceReturnTo(questId.value, beatId.value, "work")));
const returnLabel = computed(() => questReturnLabel(returnTo.value));

// ── Eyebrow: kind · thread letter (only when a live thread stands here) · party here|— ──

const threadHere = computed(() => (liveQuestsQuery.data.value ?? [])
  .find((live) => live.quest_id === questId.value && live.beat_id === beatId.value));
const threadLetterHere = computed(() => threadHere.value
  ? threadBadge(threadsQuery.data.value ?? [], threadHere.value.thread_id)?.letter ?? null
  : null);
const eyebrowText = computed(() => {
  if (!beat.value) return undefined;
  const parts = [questBeatKindLabel(beat.value.kind)];
  if (threadLetterHere.value) parts.push(`Thread ${threadLetterHere.value}`);
  parts.push(threadHere.value ? "party is here" : "—");
  return parts.join(" · ");
});

// ── Beat panel: kind, staged location, visibility — each saved immediately ──

const kindOptions = computed<string[]>(() => {
  const current = beat.value?.kind ?? "neutral";
  return (QUEST_BEAT_KINDS as readonly string[]).includes(current) ? [...QUEST_BEAT_KINDS] : [...QUEST_BEAT_KINDS, current];
});
const kindModel = computed<string>({
  get: () => beat.value?.kind || "neutral",
  set: (next) => { if (beat.value && next !== beat.value.kind) void saveBeatField({ kind: next }); },
});

const visibilityModel = computed<QuestBeatVisibility>({
  get: () => beat.value?.visibility ?? "hidden",
  set: (next) => {
    if (beat.value && next !== beat.value.visibility) void saveBeatField({ visibility: next });
  },
});

const stagedLocationId = computed<string>({
  get: () => beat.value?.staged_at_location_id ?? "",
  set: (next) => {
    if (beat.value && (next || null) !== beat.value.staged_at_location_id) void saveBeatField({ staged_at_location_id: next || null });
  },
});
const stagedLocation = computed(() => beat.value?.staged_at_location_id
  ? locationOptions.value.find((candidate) => candidate.id === beat.value!.staged_at_location_id)
  : undefined);
const stagedLocationName = computed(() => stagedLocation.value?.name ?? "");
// A beat can now be staged directly at a room (#868 S12) — the site itself
// is the room's parent; `staged_at_location_id` has always accepted any
// location, a room included. `QuestBeatSitePanel` (below) is the full "Opens
// at" surface for that case; this caption only needs to stop calling it
// "not a site" when it plainly is one, one level up.
const resolvedSite = computed(() => {
  const loc = stagedLocation.value;
  if (!loc) return null;
  if (isSiteType(loc.location_type)) return loc;
  return loc.parent_id ? locationOptions.value.find((candidate) => candidate.id === loc.parent_id) ?? null : null;
});
const stagedSiteCaption = computed(() => {
  const loc = stagedLocation.value;
  if (!loc) return "nowhere yet";
  const site = resolvedSite.value;
  if (!site) return "not a site — no room surface";
  const roomCount = locationOptions.value.filter((candidate) => candidate.parent_id === site.id && candidate.location_type === "room").length;
  const rooms = `${roomCount} room${roomCount === 1 ? "" : "s"}`;
  return loc.id === site.id ? `site: ${rooms}` : `opens at this room in ${site.name} — ${rooms}`;
});
const { readiness: siteReadiness } = useSiteStructure(resolvedSite);

const fieldsSaveError = ref("");
async function saveBeatField(update: QuestBeatUpdate) {
  if (!beat.value) return;
  fieldsSaveError.value = "";
  try {
    await updateBeat.mutateAsync({ id: beat.value.id, questId: beat.value.quest_id, update });
  } catch (caught) {
    fieldsSaveError.value = caught instanceof Error ? caught.message : "Could not save this change";
  }
}

// ── Prep gaps ──────────────────────────────────────────────────────────────

const prepGaps = computed(() => beat.value
  ? deriveQuestBeatPrepGaps(beat.value, attachments.value, { site: resolvedSite.value ? siteReadiness.value : undefined })
  : []);
const prepGapCount = computed(() => prepGaps.value.length);

// ── Reveal + preview ─────────────────────────────────────────────────────────

const revealing = ref(false);
const previewOpen = ref(false);
// Shared by the desktop action row and the phone dock (frame 3) so the two
// never drift apart on what "Reveal" is called at a given visibility.
const revealLabel = computed(() => beat.value?.visibility === "rumored" ? "Reveal fully" : "Reveal to players");

async function revealBeat() {
  if (!beat.value) return;
  if (!(await confirm(`Reveal "${beat.value.title}" to players?`))) return;
  revealing.value = true;
  try {
    await updateBeat.mutateAsync({
      id: beat.value.id,
      questId: beat.value.quest_id,
      expectedUpdatedAt: beat.value.updated_at,
      update: { visibility: "revealed" },
    });
  } catch (caught) {
    fieldsSaveError.value = caught instanceof Error ? caught.message : "The player reveal could not be changed";
  } finally {
    revealing.value = false;
  }
}

// ── Phone layout (frame 3, #872) ────────────────────────────────────────────
// Below `lg` the order flips — identity, then read-aloud, then the payoff/
// routes/attachments/site panels collapse into counted fold rows, closed by
// default. No mutation path changes here: every fold wraps the exact same
// panel the desktop column already renders.

const belowLgSource = useBelow("lg");
const belowLg = computed(() => belowLgSource.value);

const identityFoldOpen = ref(false);
const mobileDmFoldOpen = ref(false);
const mobilePayoffFoldOpen = ref(false);
const mobileRoutesFoldOpen = ref(false);
const mobileAttachmentsFoldOpen = ref(false);
const mobileSiteFoldOpen = ref(false);
const dmContentAnchor = ref<HTMLElement | null>(null);

// Review fix 2 (#872): below `lg` the Kind/staged-location/Visibility editor
// used to be `hidden lg:grid`-ed away entirely — a capability loss, not a
// layout change. The fold's caption echoes the identity chips above it
// (e.g. "Explore · Revealed · Ashmouth Chapel") so the summary is legible
// closed; opening it mounts the one shared `QuestBeatIdentityFields` copy
// (`belowLg` decides which of the two call sites actually renders it).
const identityFoldCaption = computed(() => {
  if (!beat.value) return "";
  const parts = [questBeatKindLabel(beat.value.kind), capitalize(QUEST_BEAT_VISIBILITY_LABELS[beat.value.visibility])];
  if (stagedLocationName.value) parts.push(stagedLocationName.value);
  return parts.join(" · ");
});
function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** The dock's Edit action and the top bar's pencil both land here: open the
 *  DM-content fold and scroll it into view, rather than duplicating what
 *  "edit this beat" means in two places. */
function openEditor() {
  mobileDmFoldOpen.value = true;
  void nextTick(() => dmContentAnchor.value?.scrollIntoView({ behavior: "smooth", block: "start" }));
}

// `dm_content`/`how_it_plays` are saved as a Tiptap-JSON string
// (`JSON.stringify(editor.getJSON())`, see RichTextEditor.vue), never HTML —
// `countQuestBeatContentBlocks` parses that, with a "notes" fallback for
// legacy content it cannot parse, same as QuestRunBeatCard's own DM-notes
// fold caption.
const dmContentFoldCaption = computed(() => {
  const counts = [countQuestBeatContentBlocks(beat.value?.dm_content ?? null), countQuestBeatContentBlocks(beat.value?.how_it_plays ?? null)]
    .filter((count): count is number => count !== null);
  if (!counts.length) return "notes";
  const total = counts.reduce((sum, count) => sum + count, 0);
  return `${total} paragraph${total === 1 ? "" : "s"}`;
});
// A prep gap in the beat's own guidance or player copy is the same content
// this fold holds — the tone that already flags it elsewhere flags the fold.
const dmContentFoldTone = computed(() => prepGaps.value.some((gap) => gap.kind === "guidance" || gap.kind === "player_copy") ? "caution" : "muted");

const outgoingEdges = computed(() => beat.value ? (edgesQuery.data.value ?? []).filter((edge) => edge.source_beat_id === beat.value!.id) : []);
const outgoingEdgeIds = computed(() => new Set(outgoingEdges.value.map((edge) => edge.id)));

// Mirrors the exact filter `derivePayoffRows` applies (this beat's own
// arrival rules plus the rules on its outgoing routes) — no new derivation,
// just a count of the same rows the panel itself would render.
const payoffConsequenceCount = computed(() => beat.value
  ? (consequencesQuery.data.value ?? []).filter((row) => row.on_beat_id === beat.value!.id || (row.on_edge_id !== null && outgoingEdgeIds.value.has(row.on_edge_id))).length
  : 0);
const payoffLootHeldCount = computed(() => loot.value.filter((row) => row.delivery_state === "held").length);
const payoffFoldCaption = computed(() => `${payoffConsequenceCount.value} consequence${payoffConsequenceCount.value === 1 ? "" : "s"} · ${payoffLootHeldCount.value} loot held`);

// Mirrors QuestBeatRoutesPanel's own `summaryChip` — choice/parallel are the
// only two route kinds the schema has; there is no third "gated" kind to
// count, so the caption stays two-part rather than inventing one.
const routesChoiceCount = computed(() => outgoingEdges.value.filter((edge) => edge.route_kind === "choice").length);
const routesParallelCount = computed(() => outgoingEdges.value.filter((edge) => edge.route_kind === "parallel").length);
const routesFoldCaption = computed(() => `${routesChoiceCount.value} choice · ${routesParallelCount.value} parallel`);

// A check attachment's label already names its own DC (there is no entity
// behind it); every other type's label names a specific placed entity, which
// this summary keeps out — the fold caption names the *kind* of material
// placed, not which one, same as the frame's own example ("Check DC 14 ·
// NPC · handout").
function attachmentTypeCaption(attachment: QuestBeatAttachmentSummary): string {
  if (attachment.attachment_type === "check") return attachment.label;
  return QUEST_BEAT_ATTACHMENT_ADAPTERS[attachment.attachment_type]?.label ?? attachment.label;
}
const attachmentsFoldCaption = computed(() => {
  if (!attachments.value.length) return "Nothing placed yet";
  const shown = attachments.value.slice(0, 3).map(attachmentTypeCaption);
  const rest = attachments.value.length - shown.length;
  return rest > 0 ? `${shown.join(" · ")} · +${rest} more` : shown.join(" · ");
});
const attachmentsFoldTone = computed(() => prepGaps.value.some((gap) => gap.kind === "attachment") ? "caution" : "muted");

const siteRoomCountForFold = computed(() => resolvedSite.value
  ? locationOptions.value.filter((candidate) => candidate.parent_id === resolvedSite.value!.id && candidate.location_type === "room").length
  : 0);
const siteFoldCaption = computed(() => resolvedSite.value
  ? `${resolvedSite.value.name} · ${siteRoomCountForFold.value} room${siteRoomCountForFold.value === 1 ? "" : "s"}`
  : "not staged");
const siteFoldTone = computed(() => prepGaps.value.some((gap) => gap.kind === "site") ? "caution" : "muted");
</script>
