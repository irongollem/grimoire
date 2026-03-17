<template>
  <div class="space-y-4">
    <PageHeader
      title="Token Forge"
      subtitle="Create circular VTT tokens from your party, NPCs, and monsters."
    />

    <!-- Source tabs -->
    <div class="flex items-center gap-0 border-b border-border">
      <button
        v-for="tab in SOURCE_TABS"
        :key="tab.id"
        type="button"
        class="px-4 py-2 font-cinzel text-xs font-semibold tracking-wider border-b-2 -mb-px transition-colors"
        :class="sourceTab === tab.id
          ? 'border-primary text-primary'
          : 'border-transparent text-muted-foreground hover:text-foreground'"
        @click="sourceTab = tab.id"
      >
        {{ tab.label }}
        <span v-if="tabCounts[tab.id]" class="ml-1.5 font-fell font-normal text-[10px] opacity-70">({{ tabCounts[tab.id] }})</span>
      </button>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">

      <!-- ── Left: entity list ───────────────────────────────────────── -->
      <div class="flex flex-col gap-1.5 max-h-[70vh] overflow-y-auto pr-1">

        <!-- Custom entry form -->
        <template v-if="sourceTab === 'custom'">
          <div class="rounded-lg border border-dashed border-border bg-card p-3 flex flex-col gap-2">
            <input
              v-model="customName"
              placeholder="Name…"
              class="w-full bg-transparent border-b border-border px-1 py-1 font-cinzel text-sm font-bold text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary transition-colors"
            />
            <label class="inline-flex items-center gap-2 cursor-pointer font-cinzel text-[11px] tracking-wider text-muted-foreground hover:text-foreground transition-colors">
              <Upload class="h-3 w-3 shrink-0" />
              {{ customImageUrl ? 'Change image' : 'Upload image (optional)' }}
              <input type="file" accept="image/*" class="sr-only" @change="onCustomImagePick" />
            </label>
            <button
              type="button"
              :disabled="!customName.trim()"
              class="font-cinzel text-xs text-primary tracking-wider hover:opacity-80 disabled:opacity-40 transition-opacity text-left"
              @click="applyCustom"
            >Use → Token Preview</button>
          </div>
        </template>

        <!-- Entity list -->
        <button
          v-for="e in sourceEntities"
          :key="e.id"
          type="button"
          class="flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors text-left w-full"
          :class="selected?.id === e.id
            ? 'border-primary bg-primary/8 shadow-sm'
            : 'border-border bg-card hover:border-primary/30'"
          @click="selectEntity(e)"
        >
          <!-- Portrait thumb -->
          <div
            class="h-9 w-9 rounded-full shrink-0 overflow-hidden border border-border flex items-center justify-center text-xs font-cinzel font-bold"
            :style="{ background: `linear-gradient(135deg, ${e.bgGradient[0]}, ${e.bgGradient[1]})` }"
          >
            <img v-if="e.imageUrl" :src="e.imageUrl" class="h-full w-full object-cover" />
            <span v-else class="text-white/60">{{ e.name.charAt(0).toUpperCase() }}</span>
          </div>
          <div class="flex-1 min-w-0">
            <p class="font-cinzel text-sm font-semibold text-foreground truncate">{{ e.name }}</p>
            <p class="font-fell text-xs text-muted-foreground truncate">{{ e.subtitle }}</p>
          </div>
          <span v-if="!e.imageUrl" class="font-cinzel text-[9px] text-muted-foreground/40 tracking-wider shrink-0">No art</span>
        </button>

        <p v-if="sourceEntities.length === 0 && sourceTab !== 'custom'" class="font-fell text-sm text-muted-foreground italic px-2 py-4">
          No {{ SOURCE_TABS.find(t => t.id === sourceTab)?.label.toLowerCase() }} yet.
        </p>
      </div>

      <!-- ── Right: preview + settings ──────────────────────────────── -->
      <div v-if="selected" class="lg:col-span-2 flex flex-col gap-4">

        <!-- Token preview card -->
        <div class="rounded-lg border border-border bg-card p-6 flex flex-col items-center gap-3">
          <canvas
            ref="tokenCanvas"
            :width="CANVAS_SIZE"
            :height="CANVAS_SIZE"
            class="rounded-full shadow-lg"
            style="width: 220px; height: 220px;"
          />
          <p class="font-cinzel text-xs text-muted-foreground tracking-wider">{{ selected.name }}</p>
        </div>

        <!-- Settings panel -->
        <div class="rounded-lg border border-border bg-card p-4 flex flex-col gap-4">

          <!-- Ring color -->
          <div>
            <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-2">Ring Colour</p>
            <div class="flex flex-wrap items-center gap-2">
              <button
                v-for="preset in RING_PRESETS"
                :key="preset.label"
                type="button"
                :title="preset.label"
                class="h-7 w-7 rounded-full transition-transform hover:scale-110 border-2"
                :style="{
                  backgroundColor: preset.color,
                  borderColor: settings.ringColor === preset.color ? 'white' : 'transparent',
                  boxShadow: settings.ringColor === preset.color ? `0 0 0 3px ${preset.color}60` : 'none',
                }"
                @click="settings.ringColor = preset.color"
              />
              <!-- Custom colour picker -->
              <label
                class="h-7 w-7 rounded-full border-2 border-border cursor-pointer overflow-hidden hover:scale-110 transition-transform"
                title="Custom colour"
                style="background: conic-gradient(red, yellow, lime, cyan, blue, magenta, red)"
              >
                <input
                  type="color"
                  :value="settings.ringColor"
                  class="sr-only"
                  @input="settings.ringColor = ($event.target as HTMLInputElement).value"
                />
              </label>
              <span class="font-cinzel text-[10px] text-muted-foreground tracking-wider ml-1">{{ settings.ringColor.toUpperCase() }}</span>
            </div>
          </div>

          <!-- Ring width -->
          <div>
            <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-2">Ring Width</p>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="w in RING_WIDTHS"
                :key="w.label"
                type="button"
                class="px-3 py-1.5 rounded-md font-cinzel text-[11px] font-semibold tracking-wider border transition-colors"
                :class="settings.ringWidth === w.value
                  ? 'bg-primary/15 text-primary border-primary/40'
                  : 'text-muted-foreground border-border hover:border-foreground/30'"
                @click="settings.ringWidth = w.value"
              >{{ w.label }}</button>
            </div>
          </div>

          <!-- Name label toggle -->
          <div class="flex items-center justify-between">
            <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Name Label</p>
            <button
              type="button"
              class="inline-flex items-center gap-2 font-cinzel text-xs tracking-wider transition-colors"
              :class="settings.showName ? 'text-primary' : 'text-muted-foreground'"
              @click="settings.showName = !settings.showName"
            >
              <div
                class="h-5 w-8 rounded-full transition-colors flex items-center px-0.5"
                :class="settings.showName ? 'bg-primary' : 'bg-muted'"
              >
                <div
                  class="h-4 w-4 rounded-full bg-white shadow transition-transform"
                  :class="settings.showName ? 'translate-x-3' : 'translate-x-0'"
                />
              </div>
              {{ settings.showName ? 'On' : 'Off' }}
            </button>
          </div>

          <!-- Export size -->
          <div>
            <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-2">Export Size</p>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="s in EXPORT_SIZES"
                :key="s.value"
                type="button"
                class="px-3 py-1.5 rounded-md font-cinzel text-[11px] font-semibold tracking-wider border transition-colors"
                :class="settings.exportSize === s.value
                  ? 'bg-primary/15 text-primary border-primary/40'
                  : 'text-muted-foreground border-border hover:border-foreground/30'"
                @click="settings.exportSize = s.value"
              >{{ s.label }}</button>
            </div>
          </div>
        </div>

        <!-- Export buttons -->
        <div class="flex gap-2">
          <button
            type="button"
            class="flex-1 inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity"
            @click="downloadPng"
          >
            <Download class="h-3.5 w-3.5" />
            Download PNG
          </button>
          <button
            v-if="canCopyToClipboard"
            type="button"
            class="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2.5 font-cinzel text-xs font-semibold text-muted-foreground tracking-wider hover:text-foreground hover:border-foreground/30 transition-colors"
            @click="copyToClipboard"
          >
            <Copy class="h-3.5 w-3.5" />
            Copy
          </button>
        </div>

        <!-- VTT hint -->
        <div class="rounded-md bg-muted/40 border border-border px-3 py-2.5 flex gap-2.5 items-start">
          <Info class="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
          <p class="font-fell text-xs text-muted-foreground leading-relaxed">
            Upload the PNG to your VTT — <strong>Roll20</strong>: My Library → Upload,
            <strong>Foundry VTT</strong>: Filepicker → Upload, <strong>Owlbear Rodeo</strong>: Image drop.
            280px is standard 1×1 grid size; use 512px for large/huge creatures.
          </p>
        </div>
      </div>

      <!-- Empty state -->
      <div
        v-else
        class="lg:col-span-2 flex items-center justify-center rounded-lg border border-dashed border-border bg-card/50 py-20"
      >
        <div class="text-center">
          <CircleUser class="h-12 w-12 text-muted-foreground/20 mx-auto mb-3" />
          <p class="font-cinzel text-sm text-muted-foreground">Select an entity to forge a token.</p>
          <p class="font-fell text-xs text-muted-foreground/60 italic mt-1">
            Entities with a portrait will use it; others get an initial placeholder.
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onUnmounted } from "vue";
import { Download, Copy, Info, CircleUser, Upload } from "lucide-vue-next";
import PageHeader from "@/components/common/PageHeader.vue";
import { useParty } from "@/composables/useParty";
import { useNpcs } from "@/composables/useNpcs";
import { useMonsters } from "@/composables/useMonsters";

// ── Constants ─────────────────────────────────────────────────────────────────

const CANVAS_SIZE = 512;

const SOURCE_TABS = [
  { id: "party"   as const, label: "Party" },
  { id: "npc"     as const, label: "NPCs" },
  { id: "monster" as const, label: "Monsters" },
  { id: "custom"  as const, label: "Custom" },
];
type SourceTab = (typeof SOURCE_TABS)[number]["id"];

const RING_PRESETS = [
  { label: "Party",   color: "#3b82f6" },
  { label: "Ally",    color: "#ca8a04" },
  { label: "Enemy",   color: "#dc2626" },
  { label: "Neutral", color: "#6b7280" },
  { label: "Boss",    color: "#7c3aed" },
  { label: "Nature",  color: "#16a34a" },
];

const RING_WIDTHS = [
  { label: "Thin",   value: 8  },
  { label: "Medium", value: 20 },
  { label: "Thick",  value: 34 },
  { label: "Heavy",  value: 52 },
];

const EXPORT_SIZES = [
  { label: "280px · Roll20 1×1",  value: 280 },
  { label: "512px · HD / Large",  value: 512 },
];

// ── Entity abstraction ────────────────────────────────────────────────────────

interface TokenEntity {
  id: string;
  name: string;
  subtitle: string;
  imageUrl: string | null;
  bgGradient: [string, string];
}

// ── Data ──────────────────────────────────────────────────────────────────────

const sourceTab = ref<SourceTab>("party");
const { data: partyMembers } = useParty();
const { data: npcs }         = useNpcs();
const { data: allMonsters }  = useMonsters();

const partyEntities = computed<TokenEntity[]>(() =>
  (partyMembers.value ?? []).map((m) => ({
    id:          m.id,
    name:        m.name,
    subtitle:    [m.race, m.class].filter(Boolean).join(" · ") || "Party Member",
    imageUrl:    m.portrait_url ?? null,
    bgGradient:  ["#1e3a5f", "#060d1a"],
  })),
);

const npcEntities = computed<TokenEntity[]>(() =>
  (npcs.value ?? []).map((n) => ({
    id:          n.id,
    name:        n.name,
    subtitle:    [n.race, n.occupation].filter(Boolean).join(" · ") || "NPC",
    imageUrl:    n.portrait_url ?? null,
    bgGradient:  ["#3d2b1f", "#0e0906"],
  })),
);

const monsterEntities = computed<TokenEntity[]>(() =>
  (allMonsters.value ?? []).map((m) => ({
    id:          m.id,
    name:        m.name,
    subtitle:    [m.size, m.monster_type].filter(Boolean).map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(" "),
    imageUrl:    m.image_url ?? null,
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
    bgGradient: ["#1a1a2e", "#060610"],
  };
  settings.value.ringColor = "#6b7280";
}

// ── Selection ─────────────────────────────────────────────────────────────────

const selected    = ref<TokenEntity | null>(null);
const tokenCanvas = ref<HTMLCanvasElement | null>(null);

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

let renderVersion = 0;

async function loadRemoteImage(url: string): Promise<HTMLImageElement | null> {
  try {
    // blob: URLs (custom uploads) load directly
    if (url.startsWith("blob:")) {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = url;
      });
    }
    // Remote images: fetch as blob to sidestep CORS taint
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob  = await res.blob();
    const objUrl = URL.createObjectURL(blob);
    return new Promise((resolve) => {
      const img = new Image();
      img.onload  = () => { URL.revokeObjectURL(objUrl); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(objUrl); resolve(null); };
      img.src = objUrl;
    });
  } catch {
    return null;
  }
}

async function drawToken(canvas: HTMLCanvasElement, entity: TokenEntity, version: number) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const S  = canvas.width;
  const cx = S / 2;
  const cy = S / 2;
  const R  = S / 2;
  const rw = settings.value.ringWidth;
  const ir = R - rw; // inner radius

  ctx.clearRect(0, 0, S, S);

  // ── 1. Outer ring ───────────────────────────────────────────────────────────
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fillStyle = settings.value.ringColor;
  ctx.fill();

  // ── 2. Inner area clip ──────────────────────────────────────────────────────
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, ir, 0, Math.PI * 2);
  ctx.clip();

  // ── 3. Background gradient ──────────────────────────────────────────────────
  const grad = ctx.createRadialGradient(cx, cy * 0.6, 0, cx, cy, ir);
  grad.addColorStop(0, entity.bgGradient[0]);
  grad.addColorStop(1, entity.bgGradient[1]);
  ctx.fillStyle = grad;
  ctx.fillRect(cx - ir, cy - ir, ir * 2, ir * 2);

  // ── 4. Portrait (cover-fit) ─────────────────────────────────────────────────
  if (entity.imageUrl) {
    const img = await loadRemoteImage(entity.imageUrl);
    if (version !== renderVersion) return; // stale — a newer render started
    if (img) {
      const diam   = ir * 2;
      const aspect = img.naturalWidth / img.naturalHeight;
      let dw: number, dh: number;
      if (aspect > 1) { dh = diam;       dw = diam * aspect; }
      else             { dw = diam;       dh = diam / aspect; }
      ctx.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh);
    }
  }

  // ── 5. Initial fallback (when no portrait) ──────────────────────────────────
  if (!entity.imageUrl) {
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.font      = `bold ${Math.round(S * 0.34)}px Georgia, serif`;
    ctx.textAlign    = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(entity.name.charAt(0).toUpperCase(), cx, cy);
  }

  ctx.restore();

  // ── 6. Name label (arc text along bottom of circle) ────────────────────────
  if (settings.value.showName) {
    const fontSize = Math.round(S * 0.083);
    ctx.font = `bold ${fontSize}px Georgia, serif`;

    // Truncate label to fit within ~148° of arc
    let label = entity.name;
    const arcR = ir - fontSize * 0.55;
    const maxW = arcR * Math.PI * 1.4;
    while (ctx.measureText(label).width > maxW && label.length > 1) {
      label = label.slice(0, -1);
    }
    if (label !== entity.name) label += "…";

    const chars   = label.split("");
    const cWidths = chars.map((c) => ctx.measureText(c).width);
    const totalW  = cWidths.reduce((a, b) => a + b, 0);
    const totalA  = totalW / arcR;   // total angular span in radians

    // Curved gradient band — arc wedge shape, not a rectangle
    const bandH  = fontSize * 1.9;
    const pad    = 0.15;
    const bStart = Math.PI / 2 - totalA / 2 - pad;
    const bEnd   = Math.PI / 2 + totalA / 2 + pad;

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, ir,         bStart, bEnd);
    ctx.arc(cx, cy, ir - bandH, bEnd, bStart, true);
    ctx.closePath();
    const bandGrad = ctx.createRadialGradient(cx, cy, ir - bandH, cx, cy, ir);
    bandGrad.addColorStop(0,    "rgba(0,0,0,0)");
    bandGrad.addColorStop(0.22, "rgba(0,0,0,0.72)");
    bandGrad.addColorStop(1,    "rgba(0,0,0,0.92)");
    ctx.fillStyle = bandGrad;
    ctx.fill();
    ctx.restore();

    // Arc text — each character rotated to sit tangent to the circle
    // Iterate from higher angle (visual left) to lower (visual right) so text reads L→R
    ctx.save();
    ctx.font         = `bold ${fontSize}px Georgia, serif`;
    ctx.textAlign    = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle    = "#ffffff";
    ctx.shadowColor  = "rgba(0,0,0,0.95)";
    ctx.shadowBlur   = 8;

    let angle = Math.PI / 2 + totalA / 2;
    for (let i = 0; i < chars.length; i++) {
      const ca = angle - cWidths[i] / arcR / 2;
      ctx.save();
      ctx.translate(cx + arcR * Math.cos(ca), cy + arcR * Math.sin(ca));
      ctx.rotate(ca - Math.PI / 2);
      ctx.fillText(chars[i], 0, 0);
      ctx.restore();
      angle -= cWidths[i] / arcR;
    }
    ctx.restore();
  }
}

async function renderToken() {
  const canvas = tokenCanvas.value;
  const entity = selected.value;
  if (!canvas || !entity) return;
  const version = ++renderVersion;
  await drawToken(canvas, entity, version);
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

  // Render into a correctly-sized temporary canvas
  const tmp = document.createElement("canvas");
  tmp.width  = exportSize;
  tmp.height = exportSize;
  const version = ++renderVersion;
  await drawToken(tmp, entity, version);
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
