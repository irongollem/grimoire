<template>
  <div class="flex flex-col gap-1.5">
    <p v-if="!rooms.length" class="text-caption italic text-muted-foreground">
      No rooms yet. <RouterLink :to="placeRoute(siteId, 'build')" class="underline hover:text-primary">Add some in Build</RouterLink>.
    </p>

    <div
      v-for="room in rooms"
      :key="room.id"
      class="flex items-stretch gap-1.5 rounded-lg border p-2"
      :class="rowClass(room)"
    >
      <!-- Filling an unwritten room: an inline editor replaces the row's own
           content entirely — a RichTextEditor cannot live inside a <button>,
           so this branch is never wrapped in one. -->
      <div v-if="fillingId === room.id" class="flex min-w-0 flex-1 flex-col gap-2">
        <div v-if="isAiEnabled" class="flex flex-col gap-1.5">
          <div class="flex flex-wrap items-center gap-2">
            <AppInput
              v-model="steer"
              size="sm"
              class="min-w-48 flex-1"
              placeholder="Steer it (optional): a flooded shrine, a guard post…"
              aria-label="Steer the room"
              :disabled="isGenerating"
            />
            <GenerationCostBadge :credits="fillCreditCost" :byok="textIsByok" />
            <AppButton
              variant="outline"
              size="sm"
              :icon="IconGenerate"
              label="Roll it with AI"
              :loading="isGenerating"
              :disabled="isAnyAiGenerating"
              :tooltip="isAnyAiGenerating && !isGenerating ? 'Another generation is already in progress' : undefined"
              @click="rollFill(room)"
            />
          </div>
          <p v-if="genError" class="text-caption text-destructive">{{ genError }}</p>
        </div>
        <RichTextEditor v-model="draft" size="sm" placeholder="What's in this room…" />
        <div class="flex justify-end gap-2">
          <AppButton variant="ghost" size="inline" label="Cancel" @click="cancelFill" />
          <AppButton variant="link" size="inline" label="Save" :loading="isSaving" @click="saveFill(room)" />
        </div>
      </div>

      <template v-else>
        <AppButton
          variant="menu"
          size="sm"
          block
          class="min-w-0 flex-1 gap-2.5 p-0"
          @click="onRowClick(room)"
        >
          <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded text-label font-bold" :class="numberClass(room)">
            {{ indexOf(room) + 1 }}
          </span>
          <span class="min-w-0 flex-1">
            <span class="block truncate text-label font-bold text-foreground">{{ room.name }}</span>
            <span class="block truncate text-caption text-muted-foreground" :class="unwrittenIds.has(room.id) ? 'italic' : ''">{{ captionFor(room) }}</span>
          </span>
        </AppButton>

        <span v-if="lootRoomIds.has(room.id)" class="inline-flex shrink-0 items-center self-center rounded bg-primary/10 px-1.5 py-0.5 text-primary" title="Loot held here">
          <IconCoins class="h-3 w-3" aria-hidden="true" />
        </span>
        <span
          v-if="runCaptions && secretUndiscoveredIds.has(room.id)"
          class="inline-flex shrink-0 items-center self-center rounded bg-tone-arcane/10 px-1.5 py-0.5 text-tone-arcane"
          title="Reachable only through an undiscovered secret door"
        >
          <IconHide class="h-3 w-3" aria-hidden="true" />
        </span>
        <!-- Frame 08: cleared stays full weight — only an unreachable room
             dims. The shield replaces dimming as the "done with this" signal. -->
        <IconShieldCheck v-if="isCleared(room)" class="h-4 w-4 shrink-0 self-center text-tone-success" aria-hidden="true" />
        <AppButton v-if="unwrittenIds.has(room.id)" size="xs" label="Fill" class="shrink-0 self-center" @click="startFill(room)" />
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * The site's rooms, numbered in `compareSiblings` order — the one room list
 * shared by `SiteRunSurface` (the Atlas Run action) and `QuestSiteHandoff`
 * (#850 story H). Previously each surface grew its own copy of this exact
 * click-to-move logic; this is the single version both now mount, so it can
 * never drift into two answers for "can the party reach this room" again.
 *
 * A row always moves the party. A room the door graph leaves out is dimmed
 * and captioned, and `useMoveParty` asks before moving there; it used to be
 * a link to the room's Atlas page instead, which took the DM off the surface
 * and left no way to put the party anywhere the graph did not allow.
 *
 * Self-contained on purpose, the same shape `LootPlacementList` already set:
 * it performs its own writes (`useMoveParty` to move the party,
 * `useUpdateLocation` to save a Fill) and only *announces* what happened via
 * `move` / `fill`, mirroring `LootPlacementList`'s `dropped`. Neither current
 * caller needs to react to either emit — both mutations already invalidate
 * the query keys that make `rooms` and `currentRoomId` refresh on their
 * own — but the events exist for a caller that later does (a toast, a log
 * line), exactly as `dropped` does today for nobody yet either.
 */
import { computed, ref } from "vue";
import { RouterLink } from "vue-router";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import GenerationCostBadge from "@/components/common/GenerationCostBadge.vue";
import RichTextEditor from "@/components/common/RichTextEditor.vue";
import { IconCoins, IconGenerate, IconHide, IconShieldCheck } from "@/lib/icons";
import { placeRoute } from "@/lib/locations/placeRoute";
import { useAllLocations, useFetchLocation, useUpdateLocation } from "@/composables/locations/useLocations";
import { useSiteDoors } from "@/composables/locations/useSiteDoors";
import { useAiCredits } from "@/composables/ai/useAiCredits";
import { useGenerationGate } from "@/composables/ai/useGenerationGate";
import { useProviderConfig } from "@/composables/ai/useProviderConfig";
import { useRoomFill } from "@/ai/useRoomFill";
import { isAnyAiGenerating } from "@/ai/aiGeneratorRegistry";
import { markEdited, type AiProvenance } from "@/ai/provenance";
import { useCampaignStore } from "@/stores/campaign";
import { buildAtlasIndex } from "@/lib/locations/tree";
import { levelsOf, levelOrdinal } from "@/lib/locations/levels";
import { buildRoomFillConstraints, neighboursOf } from "@/lib/locations/roomFill";
import { wholeCredits } from "@edge-shared/credit-math.ts";
import { useMoveParty } from "@/composables/locations/useMoveParty";
import { useLootPlacements } from "@/composables/quests/useQuestFlow";
import { useToast } from "@/composables/useToast";
import { roomRowCaption, roomsWithHeldLoot } from "@/lib/quests/siteHandoff";
import type { LocationState, LocationStateFact } from "@/types/locationState.types";
import type { Location } from "@/types/location.types";

const {
  siteId, rooms, currentRoomId, reachable, stateOf, unwrittenIds,
  runCaptions = false,
  secretUndiscoveredIds = new Set<string>(),
  zoneNotes = new Map<string, string>(),
} = defineProps<{
  siteId: string;
  rooms: Location[];
  currentRoomId: string | null;
  reachable: ReadonlySet<string> | null;
  stateOf: (locationId: string, fact: LocationStateFact) => LocationState | undefined;
  unwrittenIds: ReadonlySet<string>;
  /**
   * Opt-in to frame 08's reachability-driven captions ("Reachable", "Not
   * reachable from here", "Secret door — undiscovered", "Party here · <zone>
   * active") in place of the plain description snippet. Off by default;
   * both `SiteRunSurface` and `QuestSiteHandoff` turn it on (#868, S11/S12).
   */
  runCaptions?: boolean;
  /** Rooms reachable only through a secret door the party hasn't found yet.
   *  Only consulted when `runCaptions` is true. */
  secretUndiscoveredIds?: ReadonlySet<string>;
  /** The active-zone note for the party's current room ("ash-fall zone"),
   *  keyed by room id. Only consulted when `runCaptions` is true. */
  zoneNotes?: ReadonlyMap<string, string>;
}>();
const emit = defineEmits<{ move: [roomId: string]; fill: [roomId: string] }>();

const toast = useToast();

function indexOf(room: Location): number {
  return rooms.indexOf(room);
}

function isCleared(room: Location): boolean {
  return stateOf(room.id, "cleared")?.value === true;
}

function isReachable(room: Location): boolean {
  return !reachable || reachable.has(room.id);
}

function captionFor(room: Location): string {
  if (unwrittenIds.has(room.id)) return "Unwritten: write it or roll it";
  if (!runCaptions) return roomRowCaption(room.description, isCleared(room));

  // Frame 08's reachability-driven captions, opt-in via `runCaptions`.
  if (room.id === currentRoomId) {
    const zoneNote = zoneNotes.get(room.id);
    return zoneNote ? `Party here · ${zoneNote} active` : "Party here";
  }
  if (secretUndiscoveredIds.has(room.id)) return "Secret door, undiscovered";
  if (!isReachable(room)) return "Not reachable from here";
  return "Reachable";
}

function rowClass(room: Location): string[] {
  if (unwrittenIds.has(room.id)) return ["border-dashed", "border-tone-caution/50"];
  const classes = ["border-border"];
  if (room.id === currentRoomId) classes.push("border-tone-info", "ring-2", "ring-tone-info/15");
  // Frame 08: only an unreachable room dims — cleared stays full weight, with
  // the shield glyph as its own signal (see the template).
  else if (runCaptions && !isReachable(room)) classes.push("opacity-55");
  return classes;
}

function numberClass(room: Location): string {
  if (unwrittenIds.has(room.id)) return "bg-tone-caution text-on-caution";
  if (isCleared(room)) return "bg-tone-success text-on-success";
  if (room.id === currentRoomId) return "bg-tone-info text-on-info";
  return "bg-muted text-muted-foreground";
}

// ── Move ──────────────────────────────────────────────────────────────────
const { moveParty } = useMoveParty();

async function onRowClick(room: Location): Promise<void> {
  const moved = await moveParty({ roomId: room.id, roomName: room.name, currentRoomId, reachable });
  if (moved) emit("move", room.id);
}

// ── Fill ──────────────────────────────────────────────────────────────────
const fillingId = ref<string | null>(null);
const draft = ref<string | null>(null);
const { mutate: updateLocation, isPending: isSaving } = useUpdateLocation();

function startFill(room: Location): void {
  fillingId.value = room.id;
  draft.value = room.description;
  steer.value = "";
  aiDraft.value = null;
  aiProvenance.value = null;
  clearError();
}
function cancelFill(): void {
  fillingId.value = null;
  draft.value = null;
  aiDraft.value = null;
  aiProvenance.value = null;
}
function saveFill(room: Location): void {
  // AI-written text saved untouched keeps its provenance as generated; once the
  // DM has changed it, the record says so (#606).
  const provenance = aiProvenance.value && draft.value !== aiDraft.value
    ? markEdited(aiProvenance.value)
    : aiProvenance.value;
  updateLocation(
    { id: room.id, update: { description: draft.value, ...(provenance ? { ai_provenance: provenance } : {}) } },
    {
      onSuccess: () => { emit("fill", room.id); cancelFill(); },
      onError: (e) => toast.error(toast.fromError(e)),
    },
  );
}

// ── Roll it with AI (#910) — grounded in the site, its level and the doors ──
const campaign = useCampaignStore();
const isAiEnabled = computed(() => campaign.isAiEnabled);
const steer = ref("");
const aiDraft = ref<string | null>(null);
const aiProvenance = ref<AiProvenance | null>(null);
const { isGenerating, error: genError, clearError, fill } = useRoomFill();
const { canSpend } = useGenerationGate();
const { costOf } = useAiCredits();
const { textMultiplierFor } = useProviderConfig();
const textProvider = computed(() => campaign.activeCampaign?.text_provider ?? "openai");
const textIsByok = computed(() => !!campaign.decryptedApiKey);
const fillCreditCost = computed(
  () => wholeCredits(costOf("room_generation") * textMultiplierFor(textProvider.value)),
);

// Only fetched once a fill is open: nothing else on this list needs them.
const fillOpen = () => fillingId.value !== null && isAiEnabled.value;
const { data: allLocations } = useAllLocations(fillOpen);
const fetchLocation = useFetchLocation();
const roomIds = computed(() => (fillOpen() ? rooms.map((r) => r.id) : []));
const { data: doors } = useSiteDoors(roomIds);

async function rollFill(room: Location): Promise<void> {
  if (!canSpend(fillCreditCost.value, textIsByok.value)) return;
  const index = buildAtlasIndex(allLocations.value ?? []);
  // The slim list has no description; the fill wants the site's, so read that
  // one row by id (cached with the place's own `["locations", id]` entry).
  let site: Location;
  try {
    site = await fetchLocation(siteId);
  } catch (e) {
    toast.error(toast.fromError(e));
    return;
  }
  const floor = (room.parent_id ? index.byId.get(room.parent_id) : null) ?? index.byId.get(siteId) ?? null;
  const levels = floor ? levelsOf(index, floor) : null;
  const ordinal = levels && floor ? levelOrdinal(levels.levels, floor.id) : null;
  const constraints = buildRoomFillConstraints({
    site,
    level: levels && floor && ordinal ? { name: floor.name, ordinal, total: levels.levels.length } : null,
    room,
    neighbours: neighboursOf(room.id, doors.value ?? []),
    siblings: rooms.filter((r) => r.parent_id === room.parent_id),
  });
  const result = await fill({ room, constraints, steer: steer.value });
  if (!result) return;
  draft.value = result.description;
  aiDraft.value = result.description;
  aiProvenance.value = result.ai_provenance;
}

// ── Loot chip — held loot only; there is no room-anchored knowledge fact to
//    gate a second chip on (`quest_consequences` has no location column). ──
const { data: loot } = useLootPlacements();
const lootRoomIds = computed(() => roomsWithHeldLoot(loot.value ?? []));
</script>
