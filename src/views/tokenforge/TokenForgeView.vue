<template>
  <div class="mint-root" :class="`print-${printMode}`">
  <div class="mint-screen">
    <PageHeader
      title="The Mint"
      description="Forge VTT tokens and design printable coins."
    >
      <template #title-suffix>
        <ManualHelpLink page="the-mint-tokens-and-coins" />
      </template>
    </PageHeader>

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

      <!-- An entity with no picture at all: paint its portrait onto the entity,
           so the token, its card and its detail page all gain it at once. -->
      <div
        v-if="paintTarget"
        class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-border bg-card/50 px-4 py-3"
      >
        <p class="text-body text-muted-foreground">
          <span class="font-cinzel font-semibold text-foreground">{{ paintTarget.name }}</span>
          has no portrait yet.
        </p>
        <PaintPortraitButton
          :loading="activePainter.isPainting(paintTarget.id)"
          :disabled="activePainter.isPaintingAny.value"
          :cost="activePainter.cost.value"
          :byok="activePainter.byok.value"
          :error="activePainter.error.value"
          @paint="paintSelected"
        />
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">

        <!-- ── Left: entity list ───────────────────────────────────────── -->
        <TokenForgeEntityList
          :source-tab="sourceTab"
          :entities="sourceEntities"
          :selected-id="selected?.id"
          :custom-name="customName"
          :custom-image-url="customImageUrl"
          :cutout-url-by-id="cutoutUrlById"
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
          :has-cutout="hasCutout"
          v-model:art-choice="artChoice"
          v-model:ring-color="settings.ringColor"
          v-model:ring-width="settings.ringWidth"
          v-model:show-name="settings.showName"
          v-model:export-size="settings.exportSize"
          @download="downloadPng"
          @copy="copyToClipboard"
          @add-to-queue="addToQueue(renderEntity!)"
        />

        <!-- Empty state -->
        <div
          v-else
          class="lg:col-span-2 flex items-center justify-center rounded-lg border border-dashed border-border bg-card/50 py-20"
        >
          <div class="text-center">
            <IconUserCircle class="h-12 w-12 text-muted-foreground/20 mx-auto mb-3" />
            <p class="text-body text-muted-foreground">Select an entity to forge a token.</p>
            <p class="text-caption text-muted-foreground/60 italic mt-1">
              Entities with a portrait will use it. Others get an initial placeholder, or you can paint a portrait with AI.
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
          <p class="text-caption text-muted-foreground text-center">
            Live preview · {{ currentPrintSize.mm }}mm · ~{{ currentPrintSize.perSheet }} per sheet
          </p>
          <button
            type="button"
            class="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-label-lg font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
            @click="printCoins"
          >
            Print Sheet
          </button>
          <p class="text-caption text-muted-foreground italic text-center">
            Prints fronts then backs. Flip on the long (left) edge for duplex; backs are column-reversed to align.
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
import ManualHelpLink from "@/components/common/ManualHelpLink.vue";
import type { TabItem } from "@/components/common/TabBar.vue";
import { useParty } from "@/composables/party/useParty";
import { useSpeciesByIds } from "@/composables/rules/useSpecies";
import { useToast } from "@/composables/useToast";
import { useFetchNpc, useNpcs } from "@/composables/npcs/useNpcs";
import { useMonsterIndex } from "@/composables/monsters/useMonsterIndex";
import { useMonstersByIds } from "@/composables/monsters/useMonstersByIds";
import { drawToken, renderMysteryBack, type TokenEntity, type TokenFigure } from "@/lib/tokenRenderer";
import { useDollArt } from "@/composables/party/useDollArt";
import { dollTokenFigure } from "@/lib/paperDoll/dollTokenFigure";
import { resolveTokenArt } from "@/lib/battlemap/tokenArt";
import CoinFace from "@/components/mint/CoinFace.vue";
import { COIN_METALS, COIN_PRINT_SIZES } from "@/types/coin.types";
import type { CoinDesign } from "@/types/coin.types";
import PaintPortraitButton from "@/components/common/PaintPortraitButton.vue";
import { useMissingPortrait } from "@/ai/useMissingPortrait";
import { npcImageContext, partyMemberImageContext, monsterImageContext } from "@/ai/entityImageContext";
import TokenForgeTokenPreview from "@/components/tokenforge/TokenForgeTokenPreview.vue";
import TokenForgeEntityList from "@/components/tokenforge/TokenForgeEntityList.vue";
import TokenForgeCoinEditor from "@/components/tokenforge/TokenForgeCoinEditor.vue";
import TokenForgeCoinPrintLayout from "@/components/tokenforge/TokenForgeCoinPrintLayout.vue";
import TokenForgeTokenPrintLayout from "@/components/tokenforge/TokenForgeTokenPrintLayout.vue";
import TokenForgePrintQueue from "@/components/tokenforge/TokenForgePrintQueue.vue";
import { downloadBlob } from "@/lib/downloadBlob";
import {
  TOKEN_PRINT_SIZES,
  type TokenPrintSizeId,
  type TokenBackStyleId,
  type PrintQueueEntry,
} from "@/components/tokenforge/tokenForgePrint";

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
// By id, not from the campaign-edition list: a character of the other edition keeps its species.
const { data: speciesById } = useSpeciesByIds(() => (partyMembers.value ?? []).map((m) => m.species_id));
const { data: npcs }         = useNpcs();
const fetchNpc = useFetchNpc();
const toast = useToast();
// The Token Forge makes tokens for the DM's own monsters (a shared library
// monster is read-only here), so the grid is the index's own rows.
const { data: monsterIndex } = useMonsterIndex();
const ownMonsters = computed(() => (monsterIndex.value ?? []).filter((m) => !m.is_shared));

const partyEntities = computed<TokenEntity[]>(() =>
  (partyMembers.value ?? []).map((m) => ({
    id:          m.id,
    name:        m.name,
    subtitle:    [speciesById.value.get(m.species_id ?? '')?.name, m.class].filter(Boolean).join(" · ") || "Party Member",
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
  ownMonsters.value.map((m) => ({
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

// A party member's own paper doll (#975), as it is dressed right now. A species
// or template doll is not offered: it would stand in for a player's personal
// portrait with a generic figure.
const { dollFor } = useDollArt(() => partyMembers.value ?? []);
const dollFigureById = computed(() => {
  const m = new Map<string, TokenFigure>();
  for (const member of partyMembers.value ?? []) {
    const { art, figure } = dollFor(member);
    if (art.source === "character") m.set(member.id, dollTokenFigure(figure, art.layout.anatomy));
  }
  return m;
});

// Monsters and NPCs can have a cutout (#917) and a party member with its own
// doll has the doll figure, which the same toggle offers. Keyed by entity id so
// the preview can look one up for whichever entity is selected, independent of
// which source tab it came from.
const cutoutUrlById = computed(() => {
  const m = new Map<string, string>();
  for (const npc of npcs.value ?? []) {
    const art = resolveTokenArt(npc);
    if (art) m.set(npc.id, art.tokenUrl);
  }
  for (const monster of ownMonsters.value) {
    const art = resolveTokenArt(monster);
    if (art) m.set(monster.id, art.tokenUrl);
  }
  return m;
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
  artChoice.value = "picture"; // custom entities never have a cutout
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

// ── Paint a missing portrait ─────────────────────────────────────────────────

const partyPainter   = useMissingPortrait("party");
const npcPainter     = useMissingPortrait("npc");
const monsterPainter = useMissingPortrait("monster");
const activePainter = computed(() =>
  sourceTab.value === "npc" ? npcPainter : sourceTab.value === "monster" ? monsterPainter : partyPainter,
);

/** The selected entity when it has no art of any kind and AI may paint it.
 *  Shared library monsters are read-only, so they never offer it. */
const paintTarget = computed<TokenEntity | null>(() => {
  const entity = selected.value;
  if (!entity || sourceTab.value === "custom" || !activePainter.value.enabled.value) return null;
  if (entity.imageUrl || cutoutUrlById.value.has(entity.id) || dollFigureById.value.has(entity.id)) return null;
  if (sourceTab.value === "monster" && monsterIndex.value?.find((m) => m.id === entity.id)?.is_shared) return null;
  return entity;
});

// Alignment, habitat and description are not in the index, so the paint
// context reads the one selected monster's row.
const { data: selectedMonster } = useMonstersByIds(() => [sourceTab.value === "monster" ? selected.value?.id : null]);

async function paintContext(id: string): Promise<string> {
  if (sourceTab.value === "npc") {
    // The NPC list carries no prose (#999); the prompt quotes appearance and personality.
    return npcImageContext(await fetchNpc(id));
  }
  if (sourceTab.value === "monster") {
    const m = selectedMonster.value.get(id);
    return m ? monsterImageContext(m) : "";
  }
  const p = partyMembers.value?.find((x) => x.id === id);
  return p
    ? partyMemberImageContext({
        name: p.name,
        speciesName: speciesById.value.get(p.species_id ?? "")?.name,
        subrace: p.subrace,
        className: p.class,
        level: p.level,
      })
    : "";
}

async function paintSelected() {
  const entity = paintTarget.value;
  if (!entity) return;
  let context: string;
  try {
    context = await paintContext(entity.id);
  } catch (error) {
    toast.error(toast.fromError(error));
    return;
  }
  const url = await activePainter.value.paint(entity.id, context);
  // `selected` is a snapshot of the row: carry the new art into it so the preview redraws.
  if (url && selected.value?.id === entity.id) {
    selected.value = { ...selected.value, imageUrl: url, focalPoint: { x: 50, y: 50 } };
  }
}

/** Select a token, reset its ring color for the source tab, and prefer available cutout or doll art. */
function selectEntity(entity: TokenEntity) {
  selected.value = entity;
  settings.value.ringColor = DEFAULT_RING_COLORS[sourceTab.value];
  // Default to the cutout whenever the entity has one — "preferred" per #917 —
  // and fall back to the picture otherwise so the toggle has a sane starting
  // point rather than pointing at art that doesn't exist.
  artChoice.value = hasCutoutFor(entity.id) ? "cutout" : "picture";
}

// ── Cutout vs. picture (#917) ────────────────────────────────────────────────

const artChoice = ref<"picture" | "cutout">("picture");
/** Whether the cutout choice has art: a baked cutout or the character's own doll figure. */
function hasCutoutFor(id: string): boolean {
  return cutoutUrlById.value.has(id) || dollFigureById.value.has(id);
}
const hasCutout = computed(() => !!selected.value && hasCutoutFor(selected.value.id));

/** The entity actually drawn/exported: `selected` with its art swapped for
 *  the cutout (drawn "contain") or a party member's doll figure when the
 *  toggle says so and one exists. */
const renderEntity = computed<TokenEntity | null>(() => {
  const entity = selected.value;
  if (!entity) return null;
  if (artChoice.value === "cutout") {
    const cutoutUrl = cutoutUrlById.value.get(entity.id);
    if (cutoutUrl) return { ...entity, imageUrl: cutoutUrl, imageFit: "contain" };
    // The doll is drawn whole, like a cutout; the portrait stays on the entity
    // as the queue thumbnail, and the figure wins when it is drawn.
    const figure = dollFigureById.value.get(entity.id);
    if (figure) return { ...entity, figure };
  }
  return { ...entity, imageFit: "cover" };
});

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
  const entity = renderEntity.value;
  if (!canvas || !entity) return;
  activeRender?.abort();
  const controller = new AbortController();
  activeRender = controller;
  await drawToken(canvas, entity, { ...currentRenderOpts(), signal: controller.signal });
}

watch(
  [renderEntity, settings],
  async () => { await nextTick(); await renderToken(); },
  { deep: true, immediate: true },
);

// ── Export ────────────────────────────────────────────────────────────────────

async function getExportCanvas(): Promise<HTMLCanvasElement | null> {
  const canvas = tokenCanvas.value;
  const entity = renderEntity.value;
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
  const entity = renderEntity.value;
  if (!entity) return;
  const canvas = await getExportCanvas();
  if (!canvas) return;
  canvas.toBlob((blob) => {
    if (blob) downloadBlob(blob, `${entity.name.replace(/\s+/g, "_")}_token.png`);
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
