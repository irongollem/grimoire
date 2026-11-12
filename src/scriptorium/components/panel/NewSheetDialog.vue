<template>
  <AppModal :open="open" size="lg" @close="emit('close')">
    <ModalHeader title="Blank sheet" :icon="IconAddImage" tone="primary" closeable @close="emit('close')" />

    <div class="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 py-4" data-testid="new-sheet">
      <section class="space-y-2">
        <h3 class="text-eyebrow uppercase text-muted-foreground">Size</h3>
        <div class="grid grid-cols-2 gap-2">
          <AppButton
            v-for="preset in presets"
            :key="preset.id"
            variant="subtle"
            size="sm"
            :active="preset.id === sizeId"
            :data-testid="`sheet-size-${preset.id}`"
            @click="sizeId = preset.id"
          >
            <span class="flex flex-col items-start leading-tight">
              <span class="text-body">{{ preset.label }}</span>
              <span class="text-caption text-muted-foreground">{{ preset.width }} × {{ preset.height }} px</span>
            </span>
          </AppButton>
        </div>
      </section>

      <section class="space-y-2">
        <h3 class="text-eyebrow uppercase text-muted-foreground">Paper</h3>
        <ul class="grid grid-cols-3 gap-2 sm:grid-cols-5" role="radiogroup" aria-label="Paper">
          <li v-for="paper in STOCK_PAPERS" :key="paper.id">
            <AppButton
              variant="subtle"
              size="body"
              block
              role="radio"
              :active="paper.id === paperId"
              :aria-checked="paper.id === paperId"
              :tabindex="paper.id === paperId ? 0 : -1"
              class="h-auto flex-col items-stretch justify-start gap-1 whitespace-normal p-1.5 text-center"
              :data-testid="`sheet-paper-${paper.id}`"
              @click="paperId = paper.id"
              @keydown="onPaperKey"
            >
              <!-- The paper at the scale the sheet is laid at, so the swatch reads like the sheet. -->
              <span
                class="block aspect-square w-full rounded-sm border border-border bg-cover"
                :style="{ backgroundImage: `url(${artUrl(paper.surfacePath)})`, backgroundSize: `${paper.surfaceScale * 100}%` }"
                aria-hidden="true"
              />
              <span class="text-caption font-normal">{{ paper.name }}</span>
            </AppButton>
          </li>
        </ul>
      </section>

      <p v-if="error" role="alert" class="text-caption text-destructive" data-testid="new-sheet-error">{{ error }}</p>
    </div>

    <div class="flex shrink-0 justify-end gap-2 border-t border-border px-5 py-3">
      <AppButton variant="ghost" label="Cancel" @click="emit('close')" />
      <AppButton variant="primary" label="Start painting" :loading="busy" data-testid="new-sheet-start" @click="start" />
    </div>
  </AppModal>

  <PaywallModal v-model="showPaywall" resource="paint_canvases" :message="PAINT_CANVAS_LIMIT_MESSAGE" />
</template>

<script setup lang="ts">
/**
 * Start a picture from a blank sheet (#1181, frame 09): a size, one of the ten stock papers, and the picture
 * appears on the page. The quota is asked first: a sheet counts as a painting as soon as it is saved.
 */
import { computed, nextTick, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppModal from "@/components/common/overlays/AppModal.vue";
import ModalHeader from "@/components/common/overlays/ModalHeader.vue";
import PaywallModal from "@/components/common/overlays/PaywallModal.vue";
import { useQuota } from "@/composables/billing/useQuota";
import { artUrl } from "@/lib/assets/artUrl";
import { IconAddImage } from "@/lib/icons";
import { PAINT_CANVAS_LIMIT_MESSAGE } from "@/scriptorium/illuminator/lib/paintQuota";
import { isQuotaExceeded } from "@/lib/quotaError";
import { STOCK_PAPERS } from "@/scriptorium/papers/papers";
import { blankSheetRecipe, sheetPresets } from "@/scriptorium/lib/panel/newSheet";
import { uploadBlankSheet } from "@/scriptorium/lib/panel/newSheetUpload";
import type { IlluminateSettings } from "@/scriptorium/illuminator/lib/treatment";
import { useAuthStore } from "@/stores/auth";

const props = defineProps<{
  open: boolean;
  /** The page's width over its height: Full page is cut to it. */
  pageAspect: number;
}>();
const emit = defineEmits<{
  close: [];
  /** The sheet is stored: its original's URL and the recipe that starts it. */
  created: [sheet: { url: string; recipe: IlluminateSettings }];
}>();

const auth = useAuthStore();
const { canCreate } = useQuota("paint_canvases");
const presets = computed(() => sheetPresets(props.pageAspect));
const sizeId = ref("full");
const paperId = ref("cold-press");
const busy = ref(false);
const error = ref<string | null>(null);
const showPaywall = ref(false);

/** Arrow keys move the choice through the papers, as in any radio group; only the chosen one is a tab stop. */
function onPaperKey(event: KeyboardEvent) {
  const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
  if (step === 0) return;
  event.preventDefault();
  const at = STOCK_PAPERS.findIndex((p) => p.id === paperId.value);
  const next = STOCK_PAPERS[(at + step + STOCK_PAPERS.length) % STOCK_PAPERS.length];
  if (!next) return;
  paperId.value = next.id;
  void nextTick(() => document.querySelector<HTMLElement>(`[data-testid="sheet-paper-${next.id}"]`)?.focus());
}

async function start() {
  if (busy.value) return;
  if (!canCreate.value) {
    showPaywall.value = true;
    return;
  }
  const userId = auth.user?.id;
  const size = presets.value.find((p) => p.id === sizeId.value);
  const paper = STOCK_PAPERS.find((p) => p.id === paperId.value);
  if (!userId || !size || !paper) return;
  busy.value = true;
  error.value = null;
  try {
    const url = await uploadBlankSheet(paper, size, userId);
    emit("created", { url, recipe: blankSheetRecipe(paper.id, size, Math.floor(Math.random() * 2 ** 31)) });
  } catch (err) {
    if (isQuotaExceeded(err)) showPaywall.value = true;
    else error.value = err instanceof Error ? err.message : "Could not make the sheet.";
  } finally {
    busy.value = false;
  }
}
</script>
