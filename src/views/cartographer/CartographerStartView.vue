<template>
  <!-- Start a map (#1125, canvas frame 05): one question, "where does this map come from?", with three honest
       answers. A map can gain the others later: a drawing over a scan, rooms traced over either. -->
  <div class="flex h-dvh flex-col">
    <header class="flex items-center gap-3 border-b border-border bg-card px-3 py-2">
      <AppButton to="/cartographer" variant="ghost" fill="muted" size="sm" :icon="IconChevronLeft" label="Maps" aria-label="Back to maps" />
      <h1 class="text-heading-sm font-bold text-foreground">New map</h1>
    </header>

    <main class="min-h-0 flex-1 overflow-y-auto px-4 py-8">
      <div class="mx-auto flex max-w-5xl flex-col gap-8">
        <div class="flex flex-col gap-1">
          <h2 class="text-heading-lg font-bold text-foreground">Where does this map come from?</h2>
          <p class="max-w-2xl text-body text-muted-foreground">
            Pick one. You can add the others later: a drawing over a scan, rooms traced over either.
          </p>
        </div>

        <div class="grid gap-4 md:grid-cols-3">
          <!-- Draw it -->
          <section class="flex flex-col gap-4 rounded-lg border border-border bg-card p-4" aria-labelledby="start-draw">
            <header class="flex items-center gap-2">
              <IconDrawLine class="h-5 w-5 text-primary" aria-hidden="true" />
              <h3 id="start-draw" class="text-heading-sm font-bold text-foreground">Draw it</h3>
            </header>
            <p class="text-caption text-muted-foreground">Floors, walls and doors painted on a grid.</p>

            <div class="flex flex-col gap-1">
              <span class="text-label-lg font-semibold text-foreground">Size in squares</span>
              <div class="flex items-center gap-2">
                <AppInput v-model.number.lazy="cols" type="number" min="1" max="400" tone="card" size="body-xs" align="center" :block="false" class="w-16" aria-label="Squares across" />
                <span class="text-body text-muted-foreground" aria-hidden="true">by</span>
                <AppInput v-model.number.lazy="rows" type="number" min="1" max="400" tone="card" size="body-xs" align="center" :block="false" class="w-16" aria-label="Squares down" />
              </div>
              <span class="text-caption text-muted-foreground">5 ft each · grows as you draw</span>
            </div>

            <div v-if="packs.length" class="flex flex-col gap-1">
              <span class="text-label-lg font-semibold text-foreground">Tile set</span>
              <SegmentedControl v-model="packId" :options="packOptions" size="xs" wrap />
            </div>

            <AppButton
              class="mt-auto"
              variant="primary"
              :icon="IconPencilLine"
              label="Start drawing"
              :loading="starting"
              :disabled="!sizeValid || !packId"
              @click="startDrawing"
            />
          </section>

          <!-- Bring a map: the gilt-edged card, since it is what most DMs already have on the desk. -->
          <section
            class="flex flex-col gap-4 rounded-lg border border-primary/60 bg-primary/5 p-4 shadow-sm ring-1 ring-primary/20"
            aria-labelledby="start-bring"
          >
            <header class="flex items-center gap-2">
              <IconUpload class="h-5 w-5 text-primary" aria-hidden="true" />
              <h3 id="start-bring" class="text-heading-sm font-bold text-foreground">Bring a map</h3>
            </header>
            <p class="text-caption text-muted-foreground">A scan, a render or a moving map you already have.</p>

            <label
              class="flex min-h-36 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed px-4 py-6 text-center transition-colors"
              :class="dragging ? 'border-primary bg-primary/10' : 'border-border bg-card/60 hover:border-primary/60'"
              @dragenter.prevent="dragging = true"
              @dragover.prevent="dragging = true"
              @dragleave.prevent="dragging = false"
              @drop.prevent="onDrop"
            >
              <IconUploadCloud class="h-7 w-7 text-muted-foreground" aria-hidden="true" />
              <span class="text-body font-semibold text-foreground">Drop a map here</span>
              <span class="text-caption text-muted-foreground">or choose a file</span>
              <input type="file" :accept="BRING_ACCEPT" class="sr-only" aria-label="Choose a map file" @change="onChoose" />
            </label>

            <ul class="flex flex-wrap gap-1.5" aria-label="Formats it takes">
              <li v-for="format in FORMATS" :key="format" class="rounded-full border border-border bg-card px-2 py-0.5 text-label text-muted-foreground">
                {{ format }}
              </li>
            </ul>
          </section>

          <!-- Map a place -->
          <section class="flex flex-col gap-3 rounded-lg border border-border bg-card p-4" aria-labelledby="start-place">
            <header class="flex items-center gap-2">
              <IconMap class="h-5 w-5 text-primary" aria-hidden="true" />
              <h3 id="start-place" class="text-heading-sm font-bold text-foreground">Map a place</h3>
            </header>
            <p class="text-caption text-muted-foreground">A place in the Atlas that has rooms but no map yet.</p>

            <ul v-if="unmappedSites.length" class="flex flex-col gap-1">
              <li v-for="site in unmappedSites" :key="site.id">
                <AppButton :to="mapEditorRoute(site.id)" variant="menu" size="caption" block :icon="IconMap" :label="site.name" />
              </li>
            </ul>
            <p v-else class="text-caption italic text-muted-foreground">Every place with rooms has a map already.</p>

            <EntityCombobox v-model="pickedPlace" :options="siteOptions" placeholder="Search the Atlas…" class="mt-auto" />
          </section>
        </div>

        <section v-if="recent.length" class="flex flex-col gap-3" aria-labelledby="start-recent">
          <div class="flex items-baseline justify-between gap-3">
            <h2 id="start-recent" class="text-heading-sm font-bold text-foreground">Recent maps</h2>
            <AppButton to="/cartographer" variant="ghost" fill="muted" size="sm" label="All maps" />
          </div>
          <ul class="grid grid-cols-2 gap-3 md:grid-cols-4">
            <li v-for="m in recent" :key="m.map.id">
              <RouterLink
                :to="`/cartographer/${m.map.id}`"
                class="flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-primary/50"
              >
                <div class="flex aspect-video items-center justify-center bg-muted/40">
                  <img v-if="m.thumb" :src="m.thumb" alt="" loading="lazy" class="size-full object-cover" />
                  <IconNavCartographer v-else class="h-8 w-8 text-muted-foreground/50" aria-hidden="true" />
                </div>
                <div class="flex flex-col px-3 py-2">
                  <span class="truncate text-body font-semibold text-foreground">{{ m.map.name }}</span>
                  <span class="truncate text-caption text-muted-foreground">{{ m.caption }}</span>
                </div>
              </RouterLink>
            </li>
          </ul>
        </section>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { RouterLink, useRouter } from "vue-router";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import EntityCombobox from "@/components/common/controls/EntityCombobox.vue";
import SegmentedControl, { type SegmentedOption } from "@/components/common/controls/SegmentedControl.vue";
import { useDungeonMaps, useCreateDungeonMap } from "@/composables/cartographer/useDungeonMaps";
import { useLibraryTilePacks } from "@/composables/cartographer/useLibraryTilePacks";
import { useAllLocations } from "@/composables/locations/useLocations";
import { useToast } from "@/composables/useToast";
import { IconChevronLeft, IconDrawLine, IconMap, IconNavCartographer, IconPencilLine, IconUpload, IconUploadCloud } from "@/lib/icons";
import { mapEditorRoute } from "@/lib/locations/placeRoute";
import { buildMapStack } from "@/lib/locations/mapStack";
import { isSiteType } from "@/lib/locations/tiers";
import { BRING_ACCEPT } from "@/lib/mapBring/bringFile";
import { useCampaignStore } from "@/stores/campaign";
import { useMapImportStore } from "@/stores/mapImport";
import { useAppUiStore } from "@/stores/ui/app";

const FORMATS = ["PNG · JPG · WebP", "GIF", "WebM · MP4", "Universal VTT"] as const;
const RECENT_COUNT = 4;

const router = useRouter();
const toast = useToast();
const campaign = useCampaignStore();
const mapImport = useMapImportStore();

const appUi = useAppUiStore();
appUi.editorFocus = true;
onBeforeUnmount(() => { appUi.editorFocus = false; });

// ── Draw it ─────────────────────────────────────────────────────────────────
const cols = ref<number | null>(30);
const rows = ref<number | null>(20);
const sizeValid = computed(() => [cols.value, rows.value].every((n) => n !== null && Number.isInteger(n) && n >= 1 && n <= 400));

const { publishedPacks: packs } = useLibraryTilePacks();
const packId = ref("");
watch(packs, (list) => { if (!packId.value && list.length) packId.value = list[0].pack_id; }, { immediate: true });
const packOptions = computed<SegmentedOption<string>[]>(() => packs.value.map((p) => ({ value: p.pack_id, label: p.name })));

const createMap = useCreateDungeonMap();
const starting = computed(() => createMap.isPending.value);

async function startDrawing(): Promise<void> {
  try {
    const created = await createMap.mutateAsync({
      name: "Untitled Map",
      default_pack_id: packId.value,
      campaign_id: campaign.activeCampaignId,
    });
    // The size is the view the editor opens on: the grid is endless and grows as it is drawn on.
    await router.replace({ path: `/cartographer/${created.id}`, query: { size: `${cols.value}x${rows.value}` } });
  } catch (e) {
    toast.error(toast.fromError(e));
  }
}

// ── Bring a map ─────────────────────────────────────────────────────────────
const dragging = ref(false);

function bring(file: File): void {
  mapImport.hold(file);
  void router.push("/cartographer/bring");
}
function onChoose(ev: Event): void {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (file) bring(file);
}
function onDrop(ev: DragEvent): void {
  dragging.value = false;
  const file = ev.dataTransfer?.files[0];
  if (file) bring(file);
}

// ── Map a place ─────────────────────────────────────────────────────────────
const { data: locations } = useAllLocations();
const sites = computed(() => (locations.value ?? []).filter((l) => isSiteType(l.location_type)));
const siteOptions = computed(() => sites.value.map((l) => ({ id: l.id, name: l.name })));
const hasRooms = (id: string) => (locations.value ?? []).some((l) => l.parent_id === id);
const unmappedSites = computed(() =>
  sites.value.filter((l) => hasRooms(l.id) && !buildMapStack(l).hasAnyLayer).slice(0, 4),
);
const pickedPlace = ref("");
watch(pickedPlace, (id) => { if (id) void router.push(mapEditorRoute(id)); });

// ── Recent maps ─────────────────────────────────────────────────────────────
const { data: maps } = useDungeonMaps();
const recent = computed(() =>
  (maps.value ?? []).slice(0, RECENT_COUNT).map((map) => {
    const home = (locations.value ?? []).find((l) => l.source_map_id === map.id);
    return {
      map,
      thumb: home ? (home.map_layer_url ?? home.map_url) : null,
      caption: home ? `Drawing · ${home.name}` : "Drawing · not on a place",
    };
  }),
);
</script>
