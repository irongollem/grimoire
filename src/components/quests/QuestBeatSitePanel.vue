<template>
  <section class="rounded-xl border border-border bg-card p-3" aria-label="Site">
    <header class="flex items-center gap-2">
      <h3 class="font-cinzel text-sm font-bold text-foreground">Site</h3>
      <span class="ml-auto rounded bg-muted px-1.5 py-0.5 text-label uppercase text-muted-foreground">
        {{ site ? `site · ${roomCount} room${roomCount === 1 ? '' : 's'}` : 'none' }}
      </span>
    </header>

    <div v-if="site" class="mt-2 flex flex-col gap-2">
      <div class="flex min-w-0 items-center gap-2 rounded-md border border-border p-2 text-caption">
        <span class="flex h-6.5 w-6.5 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"><IconDungeon class="h-3.5 w-3.5" /></span>
        <div class="min-w-0 flex-1">
          <p class="truncate font-cinzel text-label-lg font-bold text-foreground">{{ site.name }}</p>
          <p class="text-muted-foreground">{{ roomCount }} room{{ roomCount === 1 ? '' : 's' }}</p>
        </div>
        <AppButton :to="`/locations/${site.id}`" label="Open in Atlas" size="xs" variant="subtle" />
      </div>

      <!-- "Opens at" is not a new column — `staged_at_location_id` has always
           accepted any location, and a room IS a location; this panel just
           stopped restricting the picker to site-tier (#868 S12). -->
      <div v-if="choosingSite" class="flex min-w-0 items-center gap-2 rounded-md border border-dashed border-border p-2">
        <EntityCombobox v-model="chosenLocationId" class="min-w-0 flex-1" :options="siteAndRoomOptions" placeholder="Which room, or the site itself…">
          <template #option="{ opt }">
            <span :style="{ paddingLeft: `${opt.depth * 0.75}rem` }">{{ opt.name }}</span>
          </template>
        </EntityCombobox>
        <AppButton label="Cancel" size="xs" variant="subtle" @click="choosingSite = false" />
      </div>
      <div v-else class="flex items-start gap-2 text-caption">
        <span class="w-28 shrink-0 text-muted-foreground">Opens at</span>
        <div class="min-w-0 flex-1">
          <p class="text-foreground">
            {{ openingRoom ? openingRoom.name : "the site itself" }}
          </p>
          <p class="text-muted-foreground">{{ openingRoom ? "The party starts here when Run enters the site." : "Run enters at the site's own map." }}</p>
        </div>
        <AppButton label="Change" size="xs" variant="ghost" :loading="staging" @click="choosingSite = true" />
      </div>

      <div class="flex items-start gap-2 text-caption">
        <span class="w-28 shrink-0 text-muted-foreground">Prepared on the way</span>
        <span class="text-foreground">{{ preparedOnTheWayCaption ?? "Nothing prepared yet on the way" }}</span>
      </div>

      <div class="flex items-start gap-2 text-caption">
        <span class="w-28 shrink-0 text-muted-foreground">Ambience</span>
        <span class="text-foreground">{{ ambienceCaption }}</span>
      </div>

      <!-- Site readiness is a beat gap (#868 S12, frame 15): the Quest Board
           already renders `has-gaps` on a beat missing its people or its
           handouts. A site that cannot be walked is the same class of gap. -->
      <div v-if="readiness" class="flex flex-col gap-1 rounded-md border border-border p-2 text-caption">
        <p class="font-cinzel text-label font-bold uppercase tracking-wide text-muted-foreground">Site readiness</p>
        <p class="flex items-center gap-1.5">
          <component :is="floorPlanPublished ? IconCheck : IconWarning" class="h-3.5 w-3.5 shrink-0" :class="floorPlanPublished ? 'text-tone-success' : 'text-tone-caution'" />
          <span :class="floorPlanPublished ? 'text-foreground' : 'text-ink-caution'">Floor plan {{ floorPlanPublished ? "published" : "not published yet" }}</span>
        </p>
        <p class="flex items-center gap-1.5">
          <component :is="readiness.waysOut ? IconCheck : IconWarning" class="h-3.5 w-3.5 shrink-0" :class="readiness.waysOut ? 'text-tone-success' : 'text-tone-caution'" />
          <span :class="readiness.waysOut ? 'text-foreground' : 'text-ink-caution'">Ways out {{ readiness.waysOut ? `traced — ${doorCount}` : "not traced yet" }}</span>
        </p>
        <p v-if="readiness.unboundSpaces > 0" class="flex items-center gap-1.5">
          <IconWarning class="h-3.5 w-3.5 shrink-0 text-tone-caution" />
          <span class="text-ink-caution">{{ readiness.caption }}</span>
        </p>
      </div>
    </div>

    <div v-else-if="choosingSite" class="mt-2 flex min-w-0 items-center gap-2 rounded-md border border-dashed border-border p-2">
      <EntityCombobox v-model="chosenLocationId" class="min-w-0 flex-1" :options="siteAndRoomOptions" placeholder="Which room, or the site itself…">
        <template #option="{ opt }">
          <span :style="{ paddingLeft: `${opt.depth * 0.75}rem` }">{{ opt.name }}</span>
        </template>
      </EntityCombobox>
      <AppButton label="Cancel" size="xs" variant="subtle" @click="choosingSite = false" />
    </div>

    <div v-else class="mt-2 flex min-w-0 items-center gap-2 rounded-md border border-dashed border-border p-2 text-caption">
      <span class="flex h-6.5 w-6.5 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"><IconDungeon class="h-3.5 w-3.5" /></span>
      <div class="min-w-0 flex-1">
        <p class="font-cinzel text-label-lg font-bold text-foreground">This beat can become a crawl</p>
        <p class="text-muted-foreground">Stage it at a location that is a site with a floor plan and Run gains the room surface</p>
      </div>
      <AppButton label="Choose site" size="xs" :loading="staging" @click="choosingSite = true" />
    </div>
    <p v-if="stagingError" role="alert" class="mt-1 text-caption text-destructive">{{ stagingError }}</p>
  </section>
</template>

<script setup lang="ts">
/**
 * Frame 15 (#868 S12): "the quest redesign already stages a beat at a site
 * through `staged_at_location_id`, and this panel already says 'this beat
 * can become a crawl'. Everything in this sheet lands there for free." The
 * picker now offers a site's rooms indented beneath it, not only the site
 * itself — staging at a room sets the party's entry point ("Opens at")
 * without adding a column: a room IS a location, so the existing field
 * already accepts it.
 */
import { computed, ref, watch } from "vue";
import { useLocationTree } from "@/composables/locations/useLocations";
import { useLocationMapRegions } from "@/composables/locations/useLocationMapRegions";
import { useSiteDoors } from "@/composables/locations/useSiteDoors";
import { useSitePrepared } from "@/composables/locations/useSitePrepared";
import { useUpdateQuestBeat } from "@/composables/quests/useQuestFlow";
import { bindableSpaces, isSiteType } from "@/lib/locations/tiers";
import { reachableRoomIds } from "@/lib/locations/siteRun";
import { siteReadiness } from "@/lib/locations/siteReadiness";
import { resolveInheritedTheme } from "@/lib/locations/ambience";
import { IconCheck, IconDungeon, IconWarning } from "@/lib/icons";
import type { QuestBeat } from "@/types/quest.types";
import AppButton from "@/components/common/AppButton.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";

const { beat } = defineProps<{ beat: QuestBeat }>();
const { locationOptions } = useLocationTree();
const updateBeat = useUpdateQuestBeat();

const stagedLocation = computed(() => beat.staged_at_location_id
  ? locationOptions.value.find((candidate) => candidate.id === beat.staged_at_location_id)
  : undefined);
// A room staged directly (#868 S12) resolves to its parent site; a site
// staged as before resolves to itself. Anything else (a town, a district —
// never actually a site) leaves the panel in its unstaged state.
const site = computed(() => {
  const staged = stagedLocation.value;
  if (!staged) return null;
  if (isSiteType(staged.location_type)) return staged;
  if (staged.location_type !== "room" || !staged.parent_id) return null;
  const parent = locationOptions.value.find((candidate) => candidate.id === staged.parent_id);
  return parent && isSiteType(parent.location_type) ? parent : null;
});
const openingRoom = computed(() => {
  const staged = stagedLocation.value;
  return staged && staged.location_type === "room" && site.value ? staged : null;
});

const siteRooms = computed(() => site.value
  ? locationOptions.value.filter((candidate) => candidate.parent_id === site.value!.id && candidate.location_type === "room")
  : []);
const roomCount = computed(() => siteRooms.value.length);

// The picker offers every site-tier location AND, indented beneath each, its
// bindable spaces (rooms and nested sites) — the same depth-indented shape
// `useLocationTree` already produces for every other location combobox.
const siteAndRoomOptions = computed(() => locationOptions.value.filter((candidate) =>
  isSiteType(candidate.location_type) || candidate.location_type === "room"));

const choosingSite = ref(false);
const staging = ref(false);
const stagingError = ref("");

// The picker always reads back "" — like `StoreInventory`'s add box, this is a
// picker for a target to act on, not a field holding a live value, so it
// empties itself on every selection rather than showing what was just chosen.
const chosenLocationId = computed<string>({
  get: () => "",
  set: (nextId) => { if (nextId) void chooseLocation(nextId); },
});

async function chooseLocation(nextId: string) {
  staging.value = true;
  stagingError.value = "";
  try {
    await updateBeat.mutateAsync({ id: beat.id, questId: beat.quest_id, update: { staged_at_location_id: nextId } });
    choosingSite.value = false;
  } catch (caught) {
    stagingError.value = caught instanceof Error ? caught.message : "Could not stage this beat at a site";
  } finally {
    staging.value = false;
  }
}

watch(() => beat.id, () => { choosingSite.value = false; stagingError.value = ""; });

// ── Ways out + prepared-on-the-way, across the rooms actually reachable from
//    the opening room — the whole site's rooms when staged at the site
//    itself, since there is no single entry point to walk from yet. ────────
const siteId = computed(() => site.value?.id ?? "");
const regionsQuery = useLocationMapRegions(siteId);
const regions = computed(() => regionsQuery.data.value ?? []);
const siteBindableSpaceIds = computed(() => site.value
  ? bindableSpaces(locationOptions.value.filter((candidate) => candidate.parent_id === site.value!.id)).map((candidate) => candidate.id)
  : []);
const doorsQuery = useSiteDoors(siteBindableSpaceIds);
const doors = computed(() => doorsQuery.data.value ?? []);
const doorCount = computed(() => doors.value.length);

const reachableRoomIdSet = computed(() => {
  if (openingRoom.value) {
    const reachable = reachableRoomIds(openingRoom.value.id, doors.value);
    return new Set(siteRooms.value.filter((room) => reachable.has(room.id)).map((room) => room.id));
  }
  return new Set(siteRooms.value.map((room) => room.id));
});
const reachableRoomIdList = computed(() => [...reachableRoomIdSet.value]);

const { counts: preparedCounts } = useSitePrepared(reachableRoomIdList, regions);
// Trap/encounter/puzzle only — the frame's own example ("2 traps · 1
// encounter · 1 puzzle") — features and loot already have their own rows
// elsewhere on the beat sheet (attachments, payoff) and would double-count
// here. `SiteMapLegend`'s caption formats the same five kinds for the map's
// own legend; this is scoped to a reachable-room subset instead of the whole
// site, so it stays its own small formatter rather than reaching into a
// component that isn't part of this story.
const preparedOnTheWayCaption = computed<string | null>(() => {
  const counts = preparedCounts.value;
  const parts: string[] = [];
  if (counts.trap > 0) parts.push(`${counts.trap} trap${counts.trap === 1 ? "" : "s"}`);
  if (counts.encounter > 0) parts.push(`${counts.encounter} encounter${counts.encounter === 1 ? "" : "s"}`);
  if (counts.puzzle > 0) parts.push(`${counts.puzzle} puzzle${counts.puzzle === 1 ? "" : "s"}`);
  return parts.length ? parts.join(" · ") : null;
});

// ── Ambience: what the opening room (or the site itself) actually resolves
//    to, walking the inheritance chain — "per room where set" per frame 15. ─
const ambienceById = computed(() => new Map(locationOptions.value.map((candidate) => [candidate.id, candidate])));
const resolvedAmbience = computed(() => {
  const from = openingRoom.value?.id ?? site.value?.id;
  return from ? resolveInheritedTheme(from, ambienceById.value) : null;
});
const ambienceCaption = computed(() => {
  const resolved = resolvedAmbience.value;
  if (!resolved || !resolved.theme) return "None set — per room where set";
  const source = resolved.kind === "inherited" && resolved.from && resolved.from.id !== (openingRoom.value?.id ?? site.value?.id)
    ? `, from ${resolved.from.name}`
    : "";
  return `${resolved.theme}${source} — per room where set`;
});

// ── Readiness (#868 S12, frame 15) — the same checks `useSiteStructure`
//    already runs for the Atlas, over this one site's own data. ────────────
const readiness = computed(() => site.value
  ? siteReadiness({
    location: { map_url: site.value.map_url, grid_calibration: site.value.grid_calibration },
    spaces: siteBindableSpaceIds.value.map((id) => ({ id })),
    regions: regions.value,
    doors: doors.value,
  })
  : null);
// "Published" per frame 15 is the map AND its calibration — a traced map
// with no scale can't place the party's token, so it isn't ready either.
const floorPlanPublished = computed(() => !!readiness.value && readiness.value.mapped && readiness.value.calibrated);
</script>
