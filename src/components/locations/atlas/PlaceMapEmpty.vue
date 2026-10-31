<template>
  <!-- A place with no map yet (#1125, frame 04): a dashed card that is also
       the drop target, because "bring a map" is most often a file already on
       the desk. Every action opens the full-screen editor and comes back to
       this tab. -->
  <section
    class="flex flex-col items-center gap-4 rounded-lg border-2 border-dashed px-6 py-12 text-center transition-colors"
    :class="dragging ? 'border-primary bg-primary/5' : 'border-border bg-muted/30'"
    aria-label="No map yet"
    @dragenter.prevent="dragging = true"
    @dragover.prevent="dragging = true"
    @dragleave.prevent="dragging = false"
    @drop.prevent="onDrop"
  >
    <IconMap class="h-10 w-10 text-muted-foreground/50" aria-hidden="true" />
    <div class="flex flex-col gap-1">
      <h3 class="text-heading-sm font-bold text-foreground">{{ location.name }} has no map.</h3>
      <p v-if="location.is_battle_map" class="max-w-md text-body text-muted-foreground">
        Its picture is marked as a battle map, which the Atlas keeps out of its maps.
        Open the editor to change that.
      </p>
      <p v-else class="max-w-md text-body text-muted-foreground">
        {{ isSite ? "Draw the floor plan, bring a scan, or start from an empty grid." : "Bring a picture of it and pin what is on it." }}
      </p>
    </div>

    <div class="flex flex-wrap items-center justify-center gap-2">
      <AppButton v-if="isSite" variant="primary" :icon="IconEdit" label="Draw one" :disabled="busy" @click="onDraw" />
      <AppButton :variant="isSite ? 'outline' : 'primary'" :icon="IconUpload" label="Bring a map" :disabled="busy" @click="onBring" />
      <AppButton v-if="isSite" variant="outline" :icon="IconGrid" label="Blank grid" :disabled="busy" @click="onBlankGrid" />
    </div>

    <p class="text-caption text-muted-foreground">
      Or drop a file here. Each opens the full-screen editor and comes back to this tab.
    </p>
  </section>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import AppButton from "@/components/common/controls/AppButton.vue";
import { useOpenSiteDrawing } from "@/composables/locations/useOpenSiteDrawing";
import { useUpdateLocation } from "@/composables/locations/useLocations";
import { useToast } from "@/composables/useToast";
import { IconEdit, IconGrid, IconMap, IconUpload } from "@/lib/icons";
import { mapEditorRoute } from "@/lib/locations/placeRoute";
import type { Location } from "@/types/location.types";

/** A blank grid's starting size (#1125, frame 04): big enough to lay out a
 *  small dungeon, and the editor resizes it. */
const BLANK_GRID = { cols: 30, rows: 20 };

const { location, isSite } = defineProps<{
  location: Pick<Location, "id" | "name" | "source_map_id" | "is_battle_map">;
  /** Site-tier places get the Drawing and Plan to start from; every other
   *  place has Picture and Pins alone. */
  isSite: boolean;
}>();

const router = useRouter();
const toast = useToast();
const dragging = ref(false);
const busy = ref(false);

/** Runs one start action, then opens the editor on the layer it set up. */
async function startThen(layer: "drawing" | "plan" | "picture", setup?: () => Promise<void>): Promise<void> {
  if (busy.value) return;
  busy.value = true;
  try {
    await setup?.();
    await router.push(mapEditorRoute(location.id, layer));
  } catch (e) {
    toast.error(toast.fromError(e));
  } finally {
    busy.value = false;
  }
}

const { openDrawing } = useOpenSiteDrawing();
const { mutateAsync: updateLocation } = useUpdateLocation();

function onDraw(): Promise<void> {
  return startThen("drawing", () => openDrawing(location));
}

function onBring(): Promise<void> {
  return startThen("picture");
}

function onBlankGrid(): Promise<void> {
  return startThen("plan", async () => {
    await updateLocation({ id: location.id, update: { plan_size: BLANK_GRID } });
  });
}

// A dropped file only routes to the Picture layer for now: handing the file
// itself to the editor's uploader is a later story's job.
function onDrop(): void {
  dragging.value = false;
  void onBring();
}
</script>
