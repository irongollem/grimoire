<template>
  <AppModal :open="open" size="xl" :backdrop-dismiss="false" @close="close">
    <ModalHeader
      title="Add a cut-out"
      :subtitle="`Something in ${scene.title} that should move on its own.`"
      :icon="IconAddImage"
      tone="gold"
      closeable
      @close="close"
    />

    <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
      <LiftTool v-if="lifting" :src="roomSrc" :label="liftLabel(picture)" :busy="working === 'lift'" @back="lifting = false" @lift="onLift" />

      <template v-else>
        <p class="mb-3 text-caption text-muted-foreground">Four ways in, the free ones first.</p>
        <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <!-- 1. The stock shelf -->
          <section class="flex flex-col gap-2 rounded-lg border border-border bg-muted/40 p-3" aria-labelledby="add-cutout-shelf">
            <header class="flex items-baseline justify-between gap-2">
              <h3 id="add-cutout-shelf" class="text-label-lg font-semibold">Stock shelf</h3>
              <span class="text-label uppercase text-tone-success">Free</span>
            </header>
            <p v-if="parts.isPending.value" class="text-caption text-muted-foreground">Loading the shelf…</p>
            <p v-else-if="parts.isError.value" class="text-caption text-tone-danger" role="alert">The shelf could not be loaded.</p>
            <p v-else-if="!groups.length" class="text-caption text-muted-foreground">{{ EMPTY_SHELF }}</p>
            <div v-for="group in groups" :key="group.key" class="flex flex-col gap-1">
              <h4 class="text-label uppercase text-muted-foreground">{{ group.label }}</h4>
              <div class="grid grid-cols-3 gap-1.5">
                <AppButton
                  v-for="part in group.parts"
                  :key="part.id"
                  variant="tool"
                  size="sm"
                  class="aspect-square flex-col"
                  :aria-label="`Add ${part.name}`"
                  :tooltip="part.name"
                  :disabled="!!working || cutouts.busy.value"
                  @click="onStock(part)"
                >
                  <img :src="part.image_url ?? ''" alt="" draggable="false" class="size-full object-contain" />
                </AppButton>
              </div>
            </div>
          </section>

          <!-- 2. An upload -->
          <section class="flex flex-col gap-2 rounded-lg border border-border bg-muted/40 p-3" aria-labelledby="add-cutout-upload">
            <header class="flex items-baseline justify-between gap-2">
              <h3 id="add-cutout-upload" class="text-label-lg font-semibold">Upload</h3>
              <span class="text-label uppercase text-tone-success">Free</span>
            </header>
            <p class="text-caption text-muted-foreground">A PNG or WebP with a transparent background. A flat picture is offered Remove background rather than refused.</p>
            <input ref="fileInput" type="file" accept="image/png,image/webp,image/jpeg" class="sr-only" tabindex="-1" aria-label="Cut-out picture" @change="onFile" />
            <AppButton variant="outline" size="sm" block :icon="IconAddImage" label="Choose a file" :loading="working === 'upload'" :disabled="!!working" @click="fileInput?.click()" />
            <div v-if="flat" class="flex flex-col gap-2 rounded-md border border-tone-caution/40 bg-tone-caution/10 p-2" role="status">
              <p class="text-caption">{{ flat.name }} has a flat background, so it would come in as a box.</p>
              <AppButton
                variant="tinted"
                tone="caution"
                size="sm"
                block
                :label="removeBackgroundLabel(picture)"
                :loading="working === 'removeBg'"
                :disabled="!!working"
                @click="onRemoveBackground"
              />
              <AppButton variant="ghost" size="sm" block label="Add it as it is" :disabled="!!working" @click="onAsIs" />
            </div>
          </section>

          <!-- 3. Lift -->
          <section class="flex flex-col gap-2 rounded-lg border border-border bg-muted/40 p-3" aria-labelledby="add-cutout-lift">
            <header class="flex items-baseline justify-between gap-2">
              <h3 id="add-cutout-lift" class="text-label-lg font-semibold">Lift it out</h3>
              <span class="text-label uppercase text-tone-caution">{{ LIFT_PRICE_NOTE }}</span>
            </header>
            <p class="text-caption text-muted-foreground">
              Draw round the kettle in your picture. The app cuts it out with a transparent background and paints in the gap behind it, so the room is whole when the kettle moves.
            </p>
            <AppButton variant="outline" size="sm" block :icon="IconGenerate" :label="liftLabel(picture)" :disabled="!!working || !roomSrc" @click="lifting = true" />
          </section>

          <!-- 4. Paint -->
          <section class="flex flex-col gap-2 rounded-lg border border-border bg-muted/40 p-3" aria-labelledby="add-cutout-paint">
            <header class="flex items-baseline justify-between gap-2">
              <h3 id="add-cutout-paint" class="text-label-lg font-semibold">Paint</h3>
              <span class="text-label uppercase text-tone-caution">{{ PAINT_PRICE_NOTE }}</span>
            </header>
            <p class="text-caption text-muted-foreground">Paint sends the picture with the request, so the part matches its light.</p>
            <!-- Native on purpose: a model prompt is not rich text (CLAUDE.md, Sanctioned Exceptions). -->
            <textarea
              v-model="prompt"
              rows="3"
              :maxlength="PROMPT_LIMIT"
              :disabled="!!working"
              aria-label="What to paint"
              placeholder="a brass oil lamp, unlit, hanging from a short chain"
              class="field-input resize-none disabled:opacity-50"
            />
            <AppButton
              variant="primary"
              size="sm"
              block
              :icon="IconGenerate"
              :label="paintLabel(picture)"
              :loading="working === 'paint'"
              :disabled="!prompt.trim() || (!!working && working !== 'paint')"
              @click="onPaint"
            />
          </section>
        </div>
      </template>
    </div>
  </AppModal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppModal from "@/components/common/overlays/AppModal.vue";
import ModalHeader from "@/components/common/overlays/ModalHeader.vue";
import { useNookPartCost, useNookPartGeneration } from "@/ai/useNookPartGeneration";
import { useOutOfCredits } from "@/composables/ai/useOutOfCredits";
import { useAddCutout } from "@/composables/bookNook/useAddCutout";
import { useLibraryNookParts } from "@/composables/bookNook/useLibraryNookParts";
import { useToast } from "@/composables/useToast";
import { PICTURE_ID } from "@/lib/bookNook/edit";
import { IconAddImage, IconGenerate } from "@/lib/icons";
import { paddedCrop } from "@/lib/bookNook/liftGeometry";
import { layersOf, type Rect, type Scene } from "@/lib/bookNook/scene";
import { uploadNookImage } from "@/lib/bookNook/upload";
import { useAuthStore } from "@/stores/auth";
import type { LibraryNookPart, NookPartGroup } from "@/types/bookNook.types";
import { blobHasTransparency, canvasLiftDeps, loadImage, redrawAsPng } from "./canvas";
import {
  EMPTY_SHELF,
  LIFT_PRICE_NOTE,
  liftCredits,
  liftLabel,
  PAINT_PRICE_NOTE,
  paintLabel,
  removeBackgroundLabel,
} from "./costLabels";
import { runLift } from "./liftFlow";
import LiftTool from "./LiftTool.vue";

/**
 * "Add a cut-out" (frames 06 and 06b): four ways in, the free ones first. The two that cost credits say how
 * many on the button, and the credit gate runs before anything is spent. Scene changes go up as `update`, and
 * the new part's id as `added`, so the studio selects it and the inspector opens on it.
 */
const { open, nookId, scene } = defineProps<{ open: boolean; nookId: string; scene: Scene }>();
const emit = defineEmits<{
  close: [];
  update: [change: (scene: Scene) => Scene];
  added: [id: string];
}>();

const PROMPT_LIMIT = 400;
const GROUPS: { key: NookPartGroup; label: string }[] = [
  { key: "fire", label: "Fire" },
  { key: "cloth", label: "Cloth" },
  { key: "creatures", label: "Creatures" },
  { key: "air", label: "Air" },
];

const toast = useToast();
const auth = useAuthStore();
const { requireCredits } = useOutOfCredits();
const { picture } = useNookPartCost();
const generation = useNookPartGeneration();
const parts = useLibraryNookParts();
const cutouts = useAddCutout({
  nookId: () => nookId,
  update: (change) => emit("update", change),
  added: (id) => emit("added", id),
});

type Working = "upload" | "removeBg" | "lift" | "paint" | "stock";
const working = ref<Working | null>(null);
const lifting = ref(false);
const prompt = ref("");
const fileInput = ref<HTMLInputElement | null>(null);
/** An upload with a flat background, waiting for the DM to choose. */
const flat = ref<File | null>(null);

const roomSrc = computed(() => layersOf(scene).find((l) => l.id === PICTURE_ID)?.src ?? "");

/** The shelf's cut-outs that have a picture, in their groups. A frame is not a cut-out. */
const groups = computed(() => {
  const ready = (parts.data.value ?? []).filter((p) => p.kind === "cutout" && p.image_url);
  return GROUPS.map((g) => ({ ...g, parts: ready.filter((p) => p.group_key === g.key) })).filter((g) => g.parts.length);
});

watch(
  () => open,
  (now) => {
    if (now) return;
    lifting.value = false;
    flat.value = null;
  },
);

function close() {
  if (working.value) return;
  emit("close");
}

/** Runs one route with its busy mark, a toast for a failure, and closes the dialog when it went in. */
async function route(kind: Working, work: () => Promise<boolean | void>): Promise<void> {
  working.value = kind;
  try {
    if ((await work()) !== false) emit("close");
  } catch (e) {
    toast.error(toast.fromError(e));
  } finally {
    working.value = null;
  }
}

const onStock = (part: LibraryNookPart) => route("stock", () => cutouts.addFromStock(part));

async function onFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  flat.value = null;
  if (!file) return;
  await route("upload", async () => {
    if (await blobHasTransparency(file)) return cutouts.add(file);
    flat.value = file;
    return false;
  });
}

const onAsIs = () => {
  const file = flat.value;
  if (file) void route("upload", () => cutouts.add(file));
};

async function onRemoveBackground() {
  const file = flat.value;
  if (!file || !requireCredits(picture.value)) return;
  await route("removeBg", async () => cutouts.addFromBlob(await generation.lift(nookId, await redrawAsPng(file)), file.name));
}

async function onPaint() {
  const subject = prompt.value.trim();
  if (!subject || !requireCredits(picture.value)) return;
  await route("paint", async () => {
    const ok = await cutouts.addFromBlob(await generation.paint(nookId, subject), subject);
    if (ok) prompt.value = "";
    return ok;
  });
}

async function onLift(rect: Rect) {
  const user = auth.user;
  if (!user) {
    toast.error("Sign in again to lift a cut-out.");
    return;
  }
  if (!requireCredits(liftCredits(picture.value))) return;
  await route("lift", async () => {
    const room = await loadImage(roomSrc.value);
    const crop = paddedCrop(rect, { width: room.naturalWidth, height: room.naturalHeight });
    const result = await runLift(
      {
        ...canvasLiftDeps(room),
        lift: (blob) => generation.lift(nookId, blob),
        fill: (blob, mask) => generation.fill(nookId, blob, mask),
        upload: (blob) => uploadNookImage(blob, nookId, user.id),
      },
      crop,
    );
    cutouts.addLifted(result, scene.size.width / room.naturalWidth);
    // No silent partial success: the part is in, and the DM is told what did not happen.
    if (result.notice) toast.info(result.notice, 15000);
  });
}
</script>
