<template>
  <div class="mint-root" :class="`print-${printMode}`">
  <div class="mint-screen">
    <PageHeader
      title="The Mint"
      description="Forge VTT tokens and design printable coins."
    />

    <div class="px-4 pb-4 md:px-6 space-y-4">
    <!-- Main tab: Tokens | Coins -->
    <TabBar :tabs="MAIN_TABS" v-model="mainTab" />

    <!-- ══════════════════════════════════════════════════════════════ -->
    <!-- TOKENS TAB                                                    -->
    <!-- ══════════════════════════════════════════════════════════════ -->
    <template v-if="mainTab === 'tokens'">

      <!-- Source sub-tabs -->
      <TabBar
        :tabs="SOURCE_TABS_WITH_COUNTS"
        v-model="sourceTab"
      />

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">

        <!-- ── Left: entity list ───────────────────────────────────────── -->
        <TokenForgeEntityList
          :source-tab="sourceTab"
          :entities="sourceEntities"
          :selected-id="selected?.id"
          :custom-name="customName"
          :custom-image-url="customImageUrl"
          :empty-label="SOURCE_TABS.find(t => t.id === sourceTab)?.label.toLowerCase() ?? ''"
          @select="selectEntity"
          @update:custom-name="customName = $event"
          @custom-image-pick="onCustomImagePick"
          @apply-custom="applyCustom"
        />

        <!-- ── Right: preview + settings ──────────────────────────────── -->
        <TokenForgeTokenPreview
          v-if="selected"
          ref="tokenPreview"
          :entity-name="selected.name"
          :canvas-size="CANVAS_SIZE"
          :can-copy="canCopyToClipboard"
          v-model:ring-color="settings.ringColor"
          v-model:ring-width="settings.ringWidth"
          v-model:show-name="settings.showName"
          v-model:export-size="settings.exportSize"
          @download="downloadPng"
          @copy="copyToClipboard"
          @add-to-queue="addToQueue(selected!)"
        />

        <!-- Empty state -->
        <div
          v-else
          class="lg:col-span-2 flex items-center justify-center rounded-lg border border-dashed border-border bg-card/50 py-20"
        >
          <div class="text-center">
            <IconUserCircle class="h-12 w-12 text-muted-foreground/20 mx-auto mb-3" />
            <p class="font-cinzel text-sm text-muted-foreground">Select an entity to forge a token.</p>
            <p class="font-fell text-xs text-muted-foreground/60 italic mt-1">
              Entities with a portrait will use it; others get an initial placeholder.
            </p>
          </div>
        </div>
      </div>

      <!-- ── Token print queue ───────────────────────────────────────────── -->
      <TokenForgePrintQueue
        v-if="tokenPrintQueue.length"
        :queue="tokenPrintQueue"
        v-model:print-size="tokenPrintSize"
        v-model:back-style="tokenBackStyle"
        :rendering="tokenPrintRendering"
        @remove="removeFromQueue"
        @print="renderAndPrint"
      />
    </template>

    <!-- ══════════════════════════════════════════════════════════════ -->
    <!-- COINS TAB                                                     -->
    <!-- ══════════════════════════════════════════════════════════════ -->
    <template v-if="mainTab === 'coins'">
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

        <!-- ── Left: controls ─────────────────────────────────────────── -->
        <TokenForgeCoinEditor v-model:coin="coin" />

        <!-- ── Right: coin preview ─────────────────────────────────────── -->
        <div class="lg:col-span-2 flex flex-col items-center gap-4">
          <div class="rounded-lg border border-border bg-card p-8 flex items-center justify-center w-full">
            <svg
              :viewBox="`0 0 ${COIN_SVG_SIZE} ${COIN_SVG_SIZE}`"
              xmlns="http://www.w3.org/2000/svg"
              style="width: 200px; height: 200px;"
            >
              <CoinFace :coin="coin" :size="COIN_SVG_SIZE" />
            </svg>
          </div>
          <p class="font-fell text-xs text-muted-foreground text-center">
            Live preview · {{ currentPrintSize.mm }}mm · ~{{ currentPrintSize.perSheet }} per sheet
          </p>
          <button
            type="button"
            class="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity"
            @click="printCoins"
          >
            Print Sheet
          </button>
          <p class="font-fell text-xs text-muted-foreground italic text-center">
            Prints fronts then backs. Flip on the long (left) edge for duplex — backs are column-reversed to align.
          </p>
        </div>
      </div>
    </template>

    </div><!-- /content wrapper -->
  </div><!-- /mint-screen -->

  <!-- ══════════════════════════════════════════════════════════════ -->
  <!-- PRINT LAYOUT — hidden on screen, rendered when printing       -->
  <!-- ══════════════════════════════════════════════════════════════ -->

  <TokenForgeCoinPrintLayout
    :coin="coin"
    :front-cells="coinPrintCells"
    :back-cells="coinBackCells"
  />

  <TokenForgeTokenPrintLayout
    :print-size="tokenPrintSize"
    :front-sheet="tokenFrontSheet"
    :back-sheet="tokenBackSheet"
  />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onUnmounted } from "vue";
import { IconUserCircle } from '@/lib/icons';
import PageHeader from "@/components/common/PageHeader.vue";
import TabBar from "@/components/common/TabBar.vue";
import type { TabItem } from "@/components/common/TabBar.vue";
import { useParty } from "@/composables/useParty";
import { useSpeciesNameMap } from "@/composables/useSpecies";
import { useNpcs } from "@/composables/useNpcs";
import { useMonsters } from "@/composables/useMonsters";
import { drawToken, renderMysteryBack, type TokenEntity } from "@/lib/tokenRenderer";
import CoinFace from "@/components/mint/CoinFace.vue";
import { COIN_METALS, COIN_PRINT_SIZES } from "@/types/coin.types";
import type { CoinDesign } from "@/types/coin.types";
import TokenForgeTokenPreview from "@/components/tokenforge/TokenForgeTokenPreview.vue";
import TokenForgeEntityList from "@/components/tokenforge/TokenForgeEntityList.vue";
import TokenForgeCoinEditor from "@/components/tokenforge/TokenForgeCoinEditor.vue";
import TokenForgeCoinPrintLayout from "@/components/tokenforge/TokenForgeCoinPrintLayout.vue";
import TokenForgeTokenPrintLayout from "@/components/tokenforge/TokenForgeTokenPrintLayout.vue";
import TokenForgePrintQueue, {
  TOKEN_PRINT_SIZES,
  type TokenPrintSizeId,
  type TokenBackStyleId,
  type PrintQueueEntry,
} from "@/components/tokenforge/TokenForgePrintQueue.vue";

// ── Main tabs ──────────────────────────────────────────────────────────────────

const MAIN_TABS = [
  { id: "tokens" as const, label: "Tokens" },
  { id: "coins"  as const, label: "Coins"  },
] satisfies ReadonlyArray<TabItem<string>>;
type MainTab = (typeof MAIN_TABS)[number]["id"];
const mainTab = ref<MainTab>("tokens");

// ── Constants (tokens) ────────────────────────────────────────────────────────

const CANVAS_SIZE = 512;

const SOURCE_TABS = [
  { id: "party"   as const, label: "Party" },
  { id: "npc"     as const, label: "NPCs" },
  { id: "monster" as const, label: "Monsters" },
  { id: "custom"  as const, label: "Custom" },
];
type SourceTab = (typeof SOURCE_TABS)[number]["id"];

// ── Constants (coins) ─────────────────────────────────────────────────────────

const COIN_SVG_SIZE = 100;

const coin = ref<CoinDesign>({
  metal: "gold",
  motif: "crown",
  value: "1",
  denomination: "GP",
  rimText: "",
  printSize: "standard",
});

// Auto-update denomination when metal changes, unless user has overridden it
watch(() => coin.value.metal, (newMetal, oldMetal) => {
  const oldDenom = COIN_METALS.find((m) => m.id === oldMetal)?.denom ?? "";
  const newDenom = COIN_METALS.find((m) => m.id === newMetal)?.denom ?? "";
  if (coin.value.denomination === oldDenom) {
    coin.value.denomination = newDenom;
  }
});

// ── Coin print ────────────────────────────────────────────────────────────────

const currentPrintSize = computed(
  () => COIN_PRINT_SIZES.find((p) => p.id === coin.value.printSize) ?? COIN_PRINT_SIZES[1],
);

// Fill entire sheet with copies of this coin
const coinPrintCells = computed(() =>
  Array.from({ length: currentPrintSize.value.perSheet }),
);

// Same cells but with columns reversed per row for duplex back alignment
const coinBackCells = computed(() => {
  const { cols, perSheet } = currentPrintSize.value;
  return Array.from({ length: perSheet }, (_, i) => {
    const row = Math.floor(i / cols);
    const col = i % cols;
    return row * cols + (cols - 1 - col); // index in original order (all cells identical, order is just for position)
  });
});

const printMode = ref<"coins" | "tokens">("coins");

async function printCoins() {
  printMode.value = "coins";
  await nextTick();
  const STYLE_ID = "mint-page-rule";
  if (!document.getElementById(STYLE_ID)) {
    const s = document.createElement("style");
    s.id = STYLE_ID;
    s.textContent = "@page { size: A4 portrait; margin: 0; }";
    document.head.appendChild(s);
  }
  window.print();
}

// ── Token print ───────────────────────────────────────────────────────────────

const tokenPrintQueue    = ref<PrintQueueEntry[]>([]);
const tokenPrintSize     = ref<TokenPrintSizeId>("s32");
const tokenBackStyle     = ref<TokenBackStyleId>("mystery");
const tokenPrintRendering = ref(false);
const renderedTokenUrls  = ref<{ front: string; back: string }[]>([]);

function addToQueue(entity: TokenEntity) {
  if (tokenPrintQueue.value.some((e) => e.entity.id === entity.id)) return;
  tokenPrintQueue.value.push({ entity, ringColor: settings.value.ringColor });
}

function removeFromQueue(idx: number) {
  tokenPrintQueue.value.splice(idx, 1);
}

async function renderAndPrint() {
  if (!tokenPrintQueue.value.length) return;
  printMode.value = "tokens";
  tokenPrintRendering.value = true;
  try {
    const results: { front: string; back: string }[] = [];
    for (const entry of tokenPrintQueue.value) {
      // Render front
      const frontCanvas = document.createElement("canvas");
      frontCanvas.width  = 512;
      frontCanvas.height = 512;
      await drawToken(frontCanvas, entry.entity, {
        ringColor: entry.ringColor,
        ringWidth: settings.value.ringWidth,
        showName: settings.value.showName,
      });
      const front = frontCanvas.toDataURL("image/png");

      // Render back
      let back: string;
      if (tokenBackStyle.value === "mirror") {
        back = front;
      } else {
        back = await renderMysteryBack(entry.ringColor);
      }
      results.push({ front, back });
    }
    renderedTokenUrls.value = results;
    await nextTick();

    const STYLE_ID = "mint-page-rule";
    if (!document.getElementById(STYLE_ID)) {
      const s = document.createElement("style");
      s.id = STYLE_ID;
      s.textContent = "@page { size: A4 portrait; margin: 0; }";
      document.head.appendChild(s);
    }
    window.print();
  } finally {
    tokenPrintRendering.value = false;
  }
}

// Reverse columns per row for duplex back alignment
function tokenBackOrder(arr: { front: string; back: string }[]) {
  const ps = TOKEN_PRINT_SIZES.find((s) => s.id === tokenPrintSize.value) ?? TOKEN_PRINT_SIZES[1];
  const cols = ps.cols;
  const perSheet = ps.perSheet;
  // Pad to fill sheet
  const padded = [...arr];
  while (padded.length < perSheet) padded.push({ front: "", back: "" });
  return padded.map((_, i) => {
    const row = Math.floor(i / cols);
    const col = i % cols;
    return padded[row * cols + (cols - 1 - col)];
  });
}

const tokenFrontSheet = computed(() => {
  const ps = TOKEN_PRINT_SIZES.find((s) => s.id === tokenPrintSize.value) ?? TOKEN_PRINT_SIZES[1];
  const padded = [...renderedTokenUrls.value];
  while (padded.length < ps.perSheet) padded.push({ front: "", back: "" });
  return padded;
});

const tokenBackSheet = computed(() => tokenBackOrder(renderedTokenUrls.value));

// ── Data ──────────────────────────────────────────────────────────────────────

const sourceTab = ref<SourceTab>("party");
const { data: partyMembers } = useParty();
const speciesNameMap = useSpeciesNameMap();
const { data: npcs }         = useNpcs();
const { data: allMonsters }  = useMonsters();

const partyEntities = computed<TokenEntity[]>(() =>
  (partyMembers.value ?? []).map((m) => ({
    id:          m.id,
    name:        m.name,
    subtitle:    [speciesNameMap.value.get(m.species_id ?? ''), m.class].filter(Boolean).join(" · ") || "Party Member",
    imageUrl:    m.portrait_url ?? null,
    focalPoint:  m.portrait_focal_point ?? null,
    bgGradient:  ["#1e3a5f", "#060d1a"],
  })),
);

const npcEntities = computed<TokenEntity[]>(() =>
  (npcs.value ?? []).map((n) => ({
    id:          n.id,
    name:        n.name,
    subtitle:    [n.race, n.occupation].filter(Boolean).join(" · ") || "NPC",
    imageUrl:    n.portrait_url ?? null,
    focalPoint:  n.portrait_focal_point ?? null,
    bgGradient:  ["#3d2b1f", "#0e0906"],
  })),
);

const monsterEntities = computed<TokenEntity[]>(() =>
  (allMonsters.value ?? []).map((m) => ({
    id:          m.id,
    name:        m.name,
    subtitle:    [m.size, m.monster_type].filter(Boolean).map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(" "),
    imageUrl:    m.image_url ?? null,
    focalPoint:  m.portrait_focal_point ?? null,
    bgGradient:  ["#3b0a0a", "#0a0202"],
  })),
);

const sourceEntities = computed<TokenEntity[]>(() => {
  if (sourceTab.value === "party")   return partyEntities.value;
  if (sourceTab.value === "npc")     return npcEntities.value;
  if (sourceTab.value === "monster") return monsterEntities.value;
  return [];
});

const tabCounts = computed(() => ({
  party:   partyEntities.value.length,
  npc:     npcEntities.value.length,
  monster: monsterEntities.value.length,
  custom:  0,
}));

const SOURCE_TABS_WITH_COUNTS = computed(() =>
  SOURCE_TABS.map((t) => ({
    ...t,
    count: tabCounts.value[t.id] || undefined,
  })),
);

// ── Custom source ─────────────────────────────────────────────────────────────

const customName     = ref("");
const customImageUrl = ref<string | null>(null);

function onCustomImagePick(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  if (customImageUrl.value?.startsWith("blob:")) URL.revokeObjectURL(customImageUrl.value);
  customImageUrl.value = URL.createObjectURL(file);
}

function applyCustom() {
  if (!customName.value.trim()) return;
  selected.value = {
    id:         "custom",
    name:       customName.value.trim(),
    subtitle:   "Custom",
    imageUrl:   customImageUrl.value,
    focalPoint: null,
    bgGradient: ["#1a1a2e", "#060610"],
  };
  settings.value.ringColor = "#6b7280";
}

// ── Selection ─────────────────────────────────────────────────────────────────

const selected     = ref<TokenEntity | null>(null);
const tokenPreview = ref<InstanceType<typeof TokenForgeTokenPreview> | null>(null);
const tokenCanvas  = computed(() => tokenPreview.value?.canvasEl ?? null);

const DEFAULT_RING_COLORS: Record<SourceTab, string> = {
  party:   "#3b82f6",
  npc:     "#ca8a04",
  monster: "#dc2626",
  custom:  "#6b7280",
};

function selectEntity(entity: TokenEntity) {
  selected.value = entity;
  settings.value.ringColor = DEFAULT_RING_COLORS[sourceTab.value];
}

// ── Settings ──────────────────────────────────────────────────────────────────

const settings = ref({
  ringColor:  "#3b82f6",
  ringWidth:  20,
  showName:   false,
  exportSize: 280,
});

// ── Canvas rendering ──────────────────────────────────────────────────────────

let activeRender: AbortController | null = null;

function currentRenderOpts() {
  return {
    ringColor: settings.value.ringColor,
    ringWidth: settings.value.ringWidth,
    showName: settings.value.showName,
  };
}

async function renderToken() {
  const canvas = tokenCanvas.value;
  const entity = selected.value;
  if (!canvas || !entity) return;
  activeRender?.abort();
  const controller = new AbortController();
  activeRender = controller;
  await drawToken(canvas, entity, { ...currentRenderOpts(), signal: controller.signal });
}

watch(
  [selected, settings],
  async () => { await nextTick(); await renderToken(); },
  { deep: true, immediate: true },
);

// ── Export ────────────────────────────────────────────────────────────────────

async function getExportCanvas(): Promise<HTMLCanvasElement | null> {
  const canvas = tokenCanvas.value;
  const entity = selected.value;
  if (!canvas || !entity) return null;

  const exportSize = settings.value.exportSize;
  if (exportSize === CANVAS_SIZE) return canvas;

  const tmp = document.createElement("canvas");
  tmp.width  = exportSize;
  tmp.height = exportSize;
  await drawToken(tmp, entity, currentRenderOpts());
  return tmp;
}

async function downloadPng() {
  const entity = selected.value;
  if (!entity) return;
  const canvas = await getExportCanvas();
  if (!canvas) return;
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a   = document.createElement("a");
    a.href     = url;
    a.download = `${entity.name.replace(/\s+/g, "_")}_token.png`;
    a.click();
    URL.revokeObjectURL(url);
  }, "image/png");
}

const canCopyToClipboard = computed(() => typeof ClipboardItem !== "undefined" && !!navigator.clipboard?.write);

async function copyToClipboard() {
  const canvas = await getExportCanvas();
  if (!canvas) return;
  canvas.toBlob(async (blob) => {
    if (!blob) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    } catch { /* not all browsers support clipboard image write */ }
  }, "image/png");
}

onUnmounted(() => {
  if (customImageUrl.value?.startsWith("blob:")) URL.revokeObjectURL(customImageUrl.value);
});
</script>

<!-- Global print styles — must be non-scoped so @page and body overrides apply -->
<style>
@media print {
  aside,
  header,
  .chat-no-print {
    display: none !important;
  }
  body,
  #app,
  body > div,
  body > div > div,
  body > div > div > div {
    display: block !important;
    height: auto !important;
    min-height: 0 !important;
    overflow: visible !important;
    padding: 0 !important;
    margin: 0 !important;
  }
  main {
    overflow: visible !important;
    padding: 0 !important;
    height: auto !important;
  }
}
</style>

<style scoped>
/* ── Screen: hide print layout ── */
:deep(.mint-print-layout) {
  display: none;
}

@media print {
  /* Hide the screen UI, leave print layouts visible */
  .mint-screen {
    display: none !important;
  }

  :deep(.mint-print-layout) {
    display: block;
  }

  /* Show only the sheet type that triggered print */
  .print-coins  :deep(.mint-coin-print)  { display: block; }
  .print-coins  :deep(.mint-token-print) { display: none;  }
  .print-tokens :deep(.mint-token-print) { display: block; }
  .print-tokens :deep(.mint-coin-print)  { display: none;  }
}
</style>
