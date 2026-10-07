<template>
  <div class="flex flex-col gap-4">
    <!-- Breadcrumb: full ancestor chain -->
    <div
      v-if="ancestors.length || isNew"
      class="flex flex-wrap items-center gap-1 text-caption text-muted-foreground"
    >
      <RouterLink
        to="/locations"
        class="hover:text-foreground transition-colors"
        >Locations</RouterLink
      >
      <template v-for="anc in ancestors" :key="anc.id">
        <span class="opacity-40">/</span>
        <RouterLink
          :to="placeRoute(anc.id)"
          class="hover:text-foreground transition-colors"
        >
          {{ anc.name }}
        </RouterLink>
      </template>
      <span class="opacity-40">/</span>
      <span class="text-foreground">{{
        isNew ? "New Location" : props.location?.name
      }}</span>
    </div>

    <!-- Action row: type + save (create) or autosave status (existing) + delete.
         Who sees the place is Reveal's alone now (#958): no picker here. -->
    <EntityEditorActionBar
      :title="name"
      title-placeholder="Location name…"
      :exists="!isNew"
      :can-save="!!name.trim()"
      :saving="saving"
      :deleting="deleting"
      :error="saveError"
      :autosave="autosaveBar"
      @update:title="name = $event"
      @save="save"
      @cancel="onCancel"
      @delete="remove"
    >
      <template #controls>
        <AppSelect v-model="locationType" tone="card" size="sm">
          <option
            v-for="(label, value) in LOCATION_TYPE_LABELS"
            :key="value"
            :value="value"
          >
            {{ label }}
          </option>
        </AppSelect>
      </template>
    </EntityEditorActionBar>

    <DraftConflictNotice :fields="conflictLabels" :on-discard="resetDraft" />

    <!--
      Sigil + identity fields.
      Mobile: stack vertically — sigil on top (capped to avoid eating the
      viewport), then Parent / Child / Tags / Calendar pins below at full
      viewport width. Gives the children list + comboboxes the whole screen
      to wrap in.
      Desktop (md+): original side-by-side layout, 12rem sigil on the left.
    -->
    <div class="flex flex-col gap-3 md:flex-row md:gap-5">
      <!-- Sigil -->
      <div class="w-full max-w-48 mx-auto md:mx-0 md:w-48 md:shrink-0">
        <EntityImageBlock
          :model-value="imageUrl"
          bucket="location-images"
          ai-kind="location"
          :ai-target-id="props.location?.id"
          :ai-context="aiContext"
          @update:model-value="imageUrl = $event"
        />
      </div>

      <!-- Parent, tags, sub-locations, calendar pins -->
      <div class="flex-1 flex flex-col gap-3 min-w-0">
        <LocationHierarchyPanel
          :location-id="props.location?.id ?? null"
          :parent-id="selectedParentId"
          :parent-options="parentOptions"
          :all-locations="allLocations ?? []"
          :related-location-ids="relatedLocationIds"
          :is-new="isNew"
          @update:parent-id="selectedParentId = $event"
          @update:related-location-ids="relatedLocationIds = $event"
          @create-child="createChild"
        />

        <div class="flex items-start gap-2">
          <span
            class="text-label-lg font-semibold text-muted-foreground shrink-0 w-16 flex items-center gap-1 pt-1.5"
          >
            <IconTag class="h-3.5 w-3.5" />Tags
          </span>
          <div class="flex-1"><TagInput v-model="tags" /></div>
        </div>

        <!-- Optional in-world era bounds — location is greyed out / hidden outside this range -->
        <div class="flex items-center gap-2">
          <span
            class="text-label-lg font-semibold text-muted-foreground shrink-0 w-16 flex items-center gap-1"
          >
            <IconClock class="h-3.5 w-3.5" />Era
          </span>
          <div class="flex-1 flex items-center gap-1.5">
            <AppInput
              v-model.number="eraStart"
              type="number"
              tone="card"
              size="body"
              placeholder="From year…"
              class="w-0 flex-1"
            />
            <span class="text-muted-foreground shrink-0">–</span>
            <AppInput
              v-model.number="eraEnd"
              type="number"
              tone="card"
              size="body"
              placeholder="To year…"
              class="w-0 flex-1"
            />
          </div>
        </div>

        <!-- Ambient theme — asks the soundboard for an ambient playlist tagged
             with this label when the location is opened. ThemeInput, not
             EntityCombobox: EntityCombobox can only commit one of its given
             `options` (typing a value with no match is discarded on blur),
             which rules out "type a new label" — the exact case this field
             exists for, since a DM may tag a playlist for it afterwards. -->
        <div class="flex items-start gap-2">
          <span
            class="text-label-lg font-semibold text-muted-foreground shrink-0 w-16 flex items-center gap-1 pt-1.5"
          >
            <IconWind class="h-3.5 w-3.5" />Ambient
          </span>
          <div class="flex-1 flex flex-col gap-1">
            <ThemeInput
              v-model="audioTheme"
              :suggestions="themeOptions"
              placeholder="dungeon, tavern, storm…"
            />
            <p class="text-caption text-muted-foreground">
              The ambient scene tagged with this theme plays when you press Play ambience on this place, and on its own while the party is here during a session. If no scene has the tag, nothing plays. Leave it blank to use the nearest themed parent's, or pick "silence" to keep this place quiet.
            </p>
          </div>
        </div>

        <!-- Scope -->
        <CampaignScopeField v-model="campaignId" />

        <!-- Compact calendar pins -->
        <EntityCalendarSection
          compact
          entity-type="location"
          :entity-id="props.location?.id ?? null"
          :entity-name="name || 'Untitled Location'"
        />
      </div>
    </div>

    <!-- Description editor -->
    <div class="flex flex-col gap-1">
      <span
        class="text-label-lg font-semibold text-muted-foreground"
        >Description</span
      >
      <RichTextEditor
        v-model="description"
        allow-secrets
        placeholder="Describe this location…"
        size="md"
        :ai-context="`location description: ${name || 'unnamed location'}`"
        :entity-mention-items="entityMentionItems"
      />
    </div>

    <!-- The words players read. Reveal decides whether they see the place; this
         is what they see once it is revealed, so it sits with the writing. -->
    <div class="flex flex-col gap-1">
      <span class="text-label-lg font-semibold text-muted-foreground">Player summary</span>
      <AppInput
        v-model="playerSummary"
        tone="card"
        size="body"
        placeholder="A short description players see when they discover this place…"
      />
      <p class="text-caption text-muted-foreground">
        Players always see this once the place is revealed.
      </p>
    </div>

    <!-- Proprietor (store / tavern / inn only). The wares themselves show in
         Overview; the owner is part of the record. -->
    <template v-if="STORE_LOCATION_TYPES.has(locationType)">
      <!-- Owner NPC — used as the sender name on vendor offer messages -->
      <div class="flex items-center gap-3">
        <span class="text-label-lg text-foreground shrink-0"
          >Proprietor</span
        >
        <EntityCombobox
          :model-value="npcOwnerId"
          :options="npcOptions"
          placeholder="No proprietor set…"
          class="flex-1"
          @update:model-value="npcOwnerId = $event"
        />
      </div>
    </template>

    <!-- NPCs, encounters, and party members at this location -->
    <LocationResidents
      v-if="!isNew"
      :location-id="props.location!.id"
      :npc-location-ids="npcLocationIds"
      :all-locations="allLocations ?? []"
    />

    <PaywallModal v-model="showPaywall" resource="locations" />
  </div>
</template>

<script setup lang="ts">
import { useConfirm } from "@/composables/useConfirm";
const { confirm } = useConfirm();
import { ref, toRefs, computed, watch } from "vue";
import { storeToRefs } from "pinia";
import { buildEntityContext, toPlainText } from "@/ai/utils";
import { useRoute, useRouter } from "vue-router";
import { useCampaignStore } from "@/stores/campaign";
import { IconTag, IconClock, IconWind } from '@/lib/icons';
import EntityEditorActionBar from "@/components/common/EntityEditorActionBar.vue";
import EntityImageBlock from "@/components/common/EntityImageBlock.vue";
import RichTextEditor from "@/components/common/RichTextEditor.vue";
import TagInput from "@/components/common/TagInput.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import ThemeInput from "@/components/common/ThemeInput.vue";
import CampaignScopeField from "@/components/common/CampaignScopeField.vue";
import LocationHierarchyPanel from "@/components/locations/LocationHierarchyPanel.vue";
import LocationResidents from "@/components/locations/LocationResidents.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import AppInput from "@/components/common/AppInput.vue";
import PaywallModal from "@/components/common/PaywallModal.vue";
import { isQuotaExceeded } from "@/lib/quotaError";
import { useQuota } from "@/composables/billing/useQuota";
import { useAutosave } from "@/composables/useAutosave";
import { draftValueEqual, useRecordDraft } from "@/composables/useRecordDraft";
import DraftConflictNotice from "@/components/common/DraftConflictNotice.vue";
import { useNpcs } from "@/composables/npcs/useNpcs";
import { usePlaylists } from "@/composables/soundboard/useSoundboardPlaylists";
import { useSounds } from "@/composables/soundboard/useSounds";
import { collectThemes } from "@/lib/audio/audioThemes";
import EntityCalendarSection from "@/components/calendar/EntityCalendarSection.vue";
import {
  useAllLocations,
  useCreateLocation,
  useUpdateLocation,
  useDeleteLocation,
} from "@/composables/locations/useLocations";
import {
  LOCATION_TYPE_LABELS,
  STORE_LOCATION_TYPES,
} from "@/types/location.types";
import type { Location, LocationSummary, LocationType } from "@/types/location.types";
import { markEdited, type AiProvenance } from "@/ai/provenance";
import { placeRoute } from "@/lib/locations/placeRoute";
import { useEntityMentionItems } from "@/composables/notes/useEntityMentionItems";

const props = defineProps<{
  location: Location | null;
  parentId?: string | null;
  initialName?: string;
}>();

const router = useRouter();

const route = useRoute();
/**
 * Done (existing place) and Cancel (new place). A place has one DM screen now,
 * the Atlas, so there is never a second page to fall back to. Editing an
 * existing place drops `edit` from the query and stays exactly where the Atlas
 * already had it selected; edits are already saved by then (pending ones are
 * flushed first). Creating one (this component's `isNew` mount, always at
 * `/locations/new`) has no place yet to select, so it goes to the parent it was
 * opened from, or the bare Atlas when there wasn't one.
 */
async function onCancel() {
  if (isNew.value) {
    const parent = route.query.parent;
    router.push(typeof parent === "string" ? placeRoute(parent) : "/locations");
    return;
  }
  if (autosave) {
    await autosave.saveNow();
    // Still dirty means nothing was written: autosave is paused on a blank name,
    // or the write failed. Leaving silently would drop those edits.
    if (autosave.dirty.value) {
      const reason = autosave.status.value === "paused"
        ? "A place needs a name before its edits can be saved."
        : "The last save failed.";
      const leave = await confirm(`${reason} Leave anyway and lose your unsaved edits?`, {
        title: "Unsaved edits",
        confirmLabel: "Leave",
      });
      if (!leave) return;
      autosave.reset();
    }
  }
  const { edit: _edit, ...rest } = route.query;
  router.push({ query: rest });
}

const isNew = computed(() => !props.location);

// ── All locations (for parent picker + hierarchy panel) ───────────────────────
const { data: allLocations } = useAllLocations();

// ── Draft: every field this form owns (#958) ──────────────────────────────────
// What Details owns is the record: name, type, art, hierarchy, tags, era,
// ambient theme, scope, words and proprietor. The map, who sees the place and
// the wares belong to Build, Reveal and Overview, which save themselves; this
// form never reads or writes those columns, so a change made there while the
// form is open cannot be overwritten from stale props.
interface PlaceDraft {
  name: string;
  locationType: LocationType;
  description: string;
  playerSummary: string;
  tags: string[];
  eraStart: number | null;
  eraEnd: number | null;
  audioTheme: string | null;
  selectedParentId: string | null;
  imageUrl: string | null;
  npcOwnerId: string;
  relatedLocationIds: string[];
  campaignId: string | null;
}

// ── Scope ──────────────────────────────────────────────────────────────────────
// Editing an existing location keeps its stored scope, including a stored
// null — which `props.location ? props.location.campaign_id : …` preserves.
// `props.location?.campaign_id ?? activeCampaignId.value` would be wrong: an
// existing global location's campaign_id is legitimately null, and `??`
// can't tell that apart from "no location yet", so it would silently
// re-scope the location into whichever campaign happens to be active next
// time someone opens and saves it. A new location (no props.location)
// defaults to the active campaign (#596) rather than "every campaign" — the
// null-means-global read path now actually surfaces the location again once
// the DM opts into it via CampaignScopeField, instead of silently hiding it
// (see fetchLocations/fetchAllLocations). No active campaign is a genuine
// "nothing to scope to yet" case.
const { activeCampaignId } = storeToRefs(useCampaignStore());

function placeToDraft(loc: Location | null): PlaceDraft {
  return {
    name: loc?.name ?? props.initialName ?? "",
    locationType: loc?.location_type ?? "other",
    description: loc?.description ?? "",
    playerSummary: loc?.player_summary ?? "",
    tags: loc?.tags ? [...loc.tags] : [],
    eraStart: loc?.era_start ?? null,
    eraEnd: loc?.era_end ?? null,
    audioTheme: loc?.audio_theme ?? null,
    selectedParentId: loc?.parent_id ?? props.parentId ?? null,
    imageUrl: loc?.image_url ?? null,
    npcOwnerId: loc?.npc_owner_id ?? "",
    relatedLocationIds: loc?.related_location_ids ? [...loc.related_location_ids] : [],
    campaignId: loc ? loc.campaign_id : activeCampaignId.value ?? null,
  };
}

// The place as the server last reported it: fresh data reaches every field the
// DM has not touched, and a save sends only the columns that changed (#946).
const { draft, changes, commit, reset: resetDraft, conflicts } = useRecordDraft({
  source: () => props.location,
  identity: (loc: Location) => loc.id,
  toDraft: placeToDraft,
});

const CONFLICT_LABELS: Record<keyof PlaceDraft, string> = {
  name: "Name",
  locationType: "Type",
  description: "Description",
  playerSummary: "Player summary",
  tags: "Tags",
  eraStart: "Era",
  eraEnd: "Era",
  audioTheme: "Ambient",
  selectedParentId: "Parent",
  imageUrl: "Image",
  npcOwnerId: "Proprietor",
  relatedLocationIds: "Related places",
  campaignId: "Scope",
};
const conflictLabels = computed(() => [...new Set(conflicts.value.map((key) => CONFLICT_LABELS[key]))]);
const {
  name,
  locationType,
  description,
  playerSummary,
  tags,
  eraStart,
  eraEnd,
  audioTheme,
  selectedParentId,
  imageUrl,
  npcOwnerId,
  relatedLocationIds,
  campaignId,
} = toRefs(draft);

// Full ancestor chain for breadcrumb (root → … → direct parent).
// Loop extracted into a helper to keep `computed` single-return — oxlint's
// `vue/return-in-computed-property` rule reports a false positive when a while
// loop appears inside the getter body.
function buildAncestorChain(parentId: string | null | undefined, all: LocationSummary[]): LocationSummary[] {
  const chain: LocationSummary[] = [];
  if (!parentId) return chain;
  let current = all.find((l) => l.id === parentId);
  while (current && chain.length < 10) {
    chain.unshift(current);
    const nextId = current.parent_id;
    current = nextId ? all.find((l) => l.id === nextId) : undefined;
  }
  return chain;
}
const ancestors = computed(() =>
  buildAncestorChain(selectedParentId.value, allLocations.value ?? []),
);

const parentOptions = computed(() =>
  (allLocations.value ?? []).filter((l) => l.id !== props.location?.id),
);

// ── Create child helper (invoked from LocationHierarchyPanel) ─────────────────
function createChild(name: string) {
  const query: Record<string, string> = { parent: props.location!.id };
  if (name) query.name = name;
  router.push({ path: "/locations/new", query });
}

// ── NPCs at this location (includes descendants) ───────────────────────────────
function collectDescendantIds(
  id: string,
  allLocs: LocationSummary[],
  visited = new Set<string>(),
): string[] {
  if (visited.has(id)) return [];
  visited.add(id);
  const result: string[] = [id];
  for (const loc of allLocs) {
    if (loc.parent_id === id)
      result.push(...collectDescendantIds(loc.id, allLocs, visited));
  }
  return result;
}

const npcLocationIds = computed(() => {
  if (!props.location || !allLocations.value?.length) return [];
  return collectDescendantIds(props.location.id, allLocations.value);
});

// ── Ambient theme suggestions — every label already in use, so a DM re-uses
// existing playlist tags instead of guessing at spelling. ──────────────────
const { data: playlists } = usePlaylists();
const { data: sounds } = useSounds();
// `undefined` here is "still loading", which is a real state rather than a null
// to be papered over — an empty suggestion list is the correct thing to show
// until the queries land.
const themeOptions = computed(() =>
  collectThemes(
    playlists.value === undefined ? [] : playlists.value,
    sounds.value === undefined ? [] : sounds.value,
  ),
);
const saving = ref(false);
const deleting = ref(false);
// The create path's error. An existing place reports through the autosave status.
const saveError = ref("");
// Every entry into a new location lands here — the Atlas button, the bottom
// nav, the dashboard's quick-create, "add a place inside" — and only the first
// of those checked the quota before navigating, so a DM at the free cap filled
// in a whole place and got the trigger's bare `quota_exceeded` on save. A cap
// must never read as a bug: say so on arrival, before any typing is wasted,
// and again on save for the race where the cap is reached in another tab.
const showPaywall = ref(false);
const { canCreate } = useQuota("locations");
watch(
  () => isNew.value && !canCreate.value,
  (atCap) => { if (atCap) showPaywall.value = true; },
  { immediate: true },
);

// The mention list is always the DM's: the Atlas place pane is DM-only (never
// mounted from /play) — see NoteEditor.vue for the same call.
const { mentionItems: entityMentionItems } = useEntityMentionItems();

const aiContext = computed(() =>
  buildEntityContext([
    name.value,
    LOCATION_TYPE_LABELS[locationType.value],
    toPlainText(description.value),
  ]),
);

const { data: allNpcs } = useNpcs();
const npcOptions = computed(() =>
  (allNpcs.value ?? []).map((n) => ({ id: n.id, name: n.name })),
);

// ── CRUD ───────────────────────────────────────────────────────────────────────
const { mutateAsync: create } = useCreateLocation();
const { mutateAsync: update } = useUpdateLocation();
const { mutateAsync: del } = useDeleteLocation();

/** The columns this form owns, and no others. */
function recordFields(d: PlaceDraft) {
  return {
    name: d.name.trim() || "Unnamed Location",
    location_type: d.locationType,
    description: d.description,
    tags: d.tags,
    era_start: d.eraStart,
    era_end: d.eraEnd,
    // Blank means "ask for nothing", which the column should say as null.
    audio_theme:
      d.audioTheme === null || d.audioTheme.trim() === "" ? null : d.audioTheme.trim(),
    parent_id: d.selectedParentId,
    image_url: d.imageUrl,
    player_summary: d.playerSummary || null,
    npc_owner_id: d.npcOwnerId || null,
    related_location_ids: d.relatedLocationIds,
    campaign_id: d.campaignId,
  };
}

// Material edit detection (#606): tags, sigil art, era bounds, ambient theme and
// hierarchy fields are excluded per the "moves/tags/image/visibility" carve-outs.
// Decided from the columns this save actually changes against the server copy,
// so another device's edit to the description is not mistaken for ours.
const MATERIAL_COLUMNS = ["name", "location_type", "description", "player_summary"] as const;

async function saveExisting(snapshot: PlaceDraft) {
  const loc = props.location!;
  const fields: Partial<ReturnType<typeof recordFields>> & { ai_provenance?: AiProvenance | null } =
    changes(recordFields);
  if (Object.keys(fields).length === 0) return;
  if (MATERIAL_COLUMNS.some((column) => column in fields)) {
    fields.ai_provenance = markEdited(loc.ai_provenance ?? null);
  }
  await update({ id: loc.id, update: fields });
  // Edits made while the request was in flight are not part of what was sent;
  // they stay unsaved until the refetch confirms the write.
  if (draftValueEqual(recordFields(draft), recordFields(snapshot))) commit();
}

const autosave = props.location
  ? useAutosave({
      draft,
      initial: () => placeToDraft(props.location),
      equal: draftValueEqual,
      save: saveExisting,
      canSave: () => !!draft.name.trim(),
      errorMessage: "Failed to save",
    })
  : null;

const autosaveBar = computed(() =>
  autosave
    ? {
        status: autosave.status.value,
        error: autosave.saveError.value,
        pausedLabel: "Autosave paused until the place has a name",
      }
    : undefined,
);

/** Creating a place: the explicit first save, then straight to the new place. */
async function save() {
  if (!name.value.trim()) return;
  saving.value = true;
  saveError.value = "";
  try {
    // A new place has no map, visibility or wares yet, and the insert type
    // requires those columns, so they are written once here at their empty
    // values. Build and Reveal own them from then on.
    const created = await create({
      ...recordFields(draft),
      ai_provenance: null,
      notes: null,
      map_url: null,
      map_pins: [],
      is_map_shared: false,
      is_battle_map: false,
      player_visible_to: [],
      is_description_shared: false,
      is_npcs_shared: false,
      is_inventory_shared: false,
      source_map_id: null,
      grid_calibration: null,
    });
    router.push(placeRoute(created.id));
  } catch (e: unknown) {
    if (isQuotaExceeded(e)) { showPaywall.value = true; return; }
    saveError.value = e instanceof Error ? e.message : "Failed to save";
  } finally {
    saving.value = false;
  }
}

async function remove() {
  if (!props.location) return;
  if (deleting.value) return;
  if (
    !(await confirm(
      `Delete "${props.location.name}"? Sub-locations will also be deleted.`,
    ))
  )
    return;
  deleting.value = true;
  // Nothing pending may land on a row being deleted: the unmount flush that
  // follows the navigation would otherwise send an update for it.
  await autosave?.hold();
  try {
    const parentId = props.location.parent_id;
    await del(props.location.id);
    router.push(parentId ? placeRoute(parentId) : "/locations");
  } catch {
    // failure is surfaced to the user by the mutation's onError toast
    autosave?.release();
  } finally {
    deleting.value = false;
  }
}
</script>
