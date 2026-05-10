<template>
  <div class="mint-root" :class="`print-${printMode}`">
  <div class="mint-screen">
    <PageHeader
      title="The Mint"
      description="Forge VTT tokens and design printable coins."
    />

    <div class="px-4 pb-4 md:px-6 space-y-4">
    <!-- Main tab: Tokens | Coins -->
    <div class="flex items-center gap-0 border-b border-border">
      <button
        v-for="mt in MAIN_TABS"
        :key="mt.id"
        type="button"
        class="px-5 py-2 font-cinzel text-xs font-semibold tracking-wider border-b-2 -mb-px transition-colors"
        :class="mainTab === mt.id
          ? 'border-primary text-primary'
          : 'border-transparent text-muted-foreground hover:text-foreground'"
        @click="mainTab = mt.id"
      >{{ mt.label }}</button>
    </div>

    <!-- ══════════════════════════════════════════════════════════════ -->
    <!-- TOKENS TAB                                                    -->
    <!-- ══════════════════════════════════════════════════════════════ -->
    <template v-if="mainTab === 'tokens'">

      <!-- Source sub-tabs -->
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
                <IconUpload class="h-3 w-3 shrink-0" />
                {{ customImageUrl ? 'Change image' : 'IconUpload image (optional)' }}
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
              <FocalImage v-if="e.imageUrl" :src="e.imageUrl" format="token" />
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
              <IconDownload class="h-3.5 w-3.5" />
              IconDownload PNG
            </button>
            <button
              v-if="canCopyToClipboard"
              type="button"
              class="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2.5 font-cinzel text-xs font-semibold text-muted-foreground tracking-wider hover:text-foreground hover:border-foreground/30 transition-colors"
              @click="copyToClipboard"
            >
              <IconCopy class="h-3.5 w-3.5" />
              Copy
            </button>
          </div>

          <!-- VTT hint -->
          <div class="rounded-md bg-muted/40 border border-border px-3 py-2.5 flex gap-2.5 items-start">
            <IconInfo class="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
            <p class="font-fell text-xs text-muted-foreground leading-relaxed">
              IconUpload the PNG to your VTT — <strong>Roll20</strong>: My Library → IconUpload,
              <strong>Foundry VTT</strong>: Filepicker → IconUpload, <strong>Owlbear Rodeo</strong>: Image drop.
              280px is standard 1×1 grid size; use 512px for large/huge creatures.
            </p>
          </div>

          <!-- Add to print queue -->
          <button
            type="button"
            class="inline-flex items-center justify-center gap-2 rounded-md border border-border px-4 py-2 font-cinzel text-xs font-semibold text-muted-foreground tracking-wider hover:text-foreground hover:border-foreground/30 transition-colors"
            @click="addToQueue(selected!)"
          >
            + Add to Print Sheet
          </button>
        </div>

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
      <div v-if="tokenPrintQueue.length" class="rounded-lg border border-border bg-card p-4 flex flex-col gap-4">
        <div class="flex items-center justify-between gap-4 flex-wrap">
          <p class="font-cinzel text-sm font-bold text-foreground">Print Sheet ({{ tokenPrintQueue.length }} tokens)</p>
          <div class="flex items-center gap-2 flex-wrap">

            <!-- Back style -->
            <div class="flex rounded-md overflow-hidden border border-border">
              <button
                v-for="bs in TOKEN_BACK_STYLES"
                :key="bs.id"
                type="button"
                class="px-3 py-1.5 font-cinzel text-[11px] font-semibold transition-colors"
                :class="tokenBackStyle === bs.id ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'"
                @click="tokenBackStyle = bs.id"
              >{{ bs.label }}</button>
            </div>

            <!-- Token size -->
            <div class="flex rounded-md overflow-hidden border border-border">
              <button
                v-for="ts in TOKEN_PRINT_SIZES"
                :key="ts.id"
                type="button"
                class="px-3 py-1.5 font-cinzel text-[11px] font-semibold transition-colors"
                :class="tokenPrintSize === ts.id ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'"
                @click="tokenPrintSize = ts.id"
              >{{ ts.label }}</button>
            </div>

            <button
              type="button"
              :disabled="tokenPrintRendering"
              class="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 disabled:opacity-50 transition-opacity"
              @click="renderAndPrint"
            >
              {{ tokenPrintRendering ? 'Rendering…' : 'Print Sheet' }}
            </button>
          </div>
        </div>

        <!-- Queue items -->
        <div class="flex flex-wrap gap-2">
          <div
            v-for="(qe, qi) in tokenPrintQueue"
            :key="`q-${qi}`"
            class="flex items-center gap-1.5 rounded-full border border-border bg-muted pl-1 pr-2 py-0.5"
          >
            <div
              class="h-6 w-6 rounded-full shrink-0 overflow-hidden border border-border flex items-center justify-center text-[9px] font-cinzel font-bold"
              :style="{ background: `linear-gradient(135deg, ${qe.entity.bgGradient[0]}, ${qe.entity.bgGradient[1]})` }"
            >
              <FocalImage v-if="qe.entity.imageUrl" :src="qe.entity.imageUrl" format="token" />
              <span v-else class="text-white/60">{{ qe.entity.name.charAt(0) }}</span>
            </div>
            <span class="font-cinzel text-[11px] text-foreground">{{ qe.entity.name }}</span>
            <button type="button" class="text-muted-foreground hover:text-destructive transition-colors text-xs leading-none" @click="removeFromQueue(qi)">✕</button>
          </div>
        </div>

        <p class="font-fell text-xs text-muted-foreground italic">
          Fronts then backs. Flip on the long edge for duplex alignment.
          Back: <strong>{{ TOKEN_BACK_STYLES.find(b => b.id === tokenBackStyle)?.desc }}</strong>
        </p>
      </div>
    </template>

    <!-- ══════════════════════════════════════════════════════════════ -->
    <!-- COINS TAB                                                     -->
    <!-- ══════════════════════════════════════════════════════════════ -->
    <template v-if="mainTab === 'coins'">
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

        <!-- ── Left: controls ─────────────────────────────────────────── -->
        <div class="flex flex-col gap-5">

          <!-- Metal -->
          <div>
            <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-2">Metal</p>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="m in COIN_METALS"
                :key="m.id"
                type="button"
                class="px-3 py-1.5 rounded-md font-cinzel text-[11px] font-semibold tracking-wider border transition-colors"
                :class="coin.metal === m.id
                  ? 'bg-primary/15 text-primary border-primary/40'
                  : 'text-muted-foreground border-border hover:border-foreground/30'"
                @click="coin.metal = m.id"
              >{{ m.label }}</button>
            </div>
          </div>

          <!-- Value -->
          <div>
            <label class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-2 block">Centre Value</label>
            <input
              v-model="coin.value"
              placeholder="e.g. 10"
              class="w-full bg-muted border border-border rounded-md px-3 py-1.5 font-cinzel text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <!-- Emblem / motif -->
          <div>
            <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-2">Emblem</p>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="m in COIN_MOTIFS"
                :key="m.id"
                type="button"
                :title="m.label"
                class="h-8 min-w-8 px-2 rounded-md font-cinzel text-sm border transition-colors flex items-center justify-center"
                :class="coin.motif === m.id
                  ? 'bg-primary/15 text-primary border-primary/40'
                  : 'text-muted-foreground border-border hover:border-foreground/30'"
                @click="coin.motif = m.id"
              >
                <span v-if="m.symbol" class="text-base leading-none">{{ m.symbol }}</span>
                <span v-else class="font-cinzel text-[10px] tracking-wider">None</span>
              </button>
            </div>
          </div>

          <!-- Denomination -->
          <div>
            <label class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-2 block">Denomination Label</label>
            <input
              v-model="coin.denomination"
              placeholder="e.g. GP"
              class="w-full bg-muted border border-border rounded-md px-3 py-1.5 font-cinzel text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <!-- Rim text -->
          <div>
            <label class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-2 block">Rim Text</label>
            <input
              v-model="coin.rimText"
              placeholder="e.g. Kingdom of Arendor"
              class="w-full bg-muted border border-border rounded-md px-3 py-1.5 font-cinzel text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <!-- Print size -->
          <div>
            <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-2">Print Size</p>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="ps in COIN_PRINT_SIZES"
                :key="ps.id"
                type="button"
                class="px-3 py-1.5 rounded-md font-cinzel text-[11px] font-semibold tracking-wider border transition-colors"
                :class="coin.printSize === ps.id
                  ? 'bg-primary/15 text-primary border-primary/40'
                  : 'text-muted-foreground border-border hover:border-foreground/30'"
                @click="coin.printSize = ps.id"
              >
                {{ ps.label }}
                <span class="ml-1 font-fell font-normal text-[10px] opacity-60">~{{ ps.perSheet }}/sheet</span>
              </button>
            </div>
          </div>
        </div>

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

  <!-- Coin print sheets -->
    <div class="mint-print-layout mint-coin-print">
      <!-- Front sheet -->
      <div class="mint-print-sheet" :class="`coin-grid-${coin.printSize}`">
        <div v-for="(_, i) in coinPrintCells" :key="`cf-${i}`" class="mint-coin-cell">
          <svg viewBox="0 0 100 100" class="mint-coin-svg" xmlns="http://www.w3.org/2000/svg">
            <CoinFace :coin="coin" :size="100" :uid="`cf-${i}`" />
          </svg>
        </div>
      </div>
      <!-- Back sheet — columns reversed per row for duplex alignment -->
      <div class="mint-print-sheet" :class="`coin-grid-${coin.printSize}`">
        <div v-for="(_, i) in coinBackCells" :key="`cb-${i}`" class="mint-coin-cell">
          <svg viewBox="0 0 100 100" class="mint-coin-svg" xmlns="http://www.w3.org/2000/svg">
            <CoinFace :coin="coin" :size="100" :uid="`cb-${i}`" />
          </svg>
        </div>
      </div>
    </div>

    <!-- Token print sheets (rendered img tags populated just before print) -->
    <div class="mint-print-layout mint-token-print">
      <!-- Front sheet -->
      <div class="mint-print-sheet" :class="`token-grid-${tokenPrintSize}`">
        <div v-for="(cell, i) in tokenFrontSheet" :key="`tf-${i}`" class="mint-token-cell">
          <img v-if="cell.front" :src="cell.front" class="mint-token-img" />
        </div>
      </div>
      <!-- Back sheet — columns reversed -->
      <div class="mint-print-sheet" :class="`token-grid-${tokenPrintSize}`">
        <div v-for="(cell, i) in tokenBackSheet" :key="`tb-${i}`" class="mint-token-cell">
          <img v-if="cell.back" :src="cell.back" class="mint-token-img" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onUnmounted } from "vue";
import { IconCopy, IconDownload, IconInfo, IconUpload, IconUserCircle } from '@/lib/icons';
import PageHeader from "@/components/common/PageHeader.vue";
import FocalImage from "@/components/common/FocalImage.vue";
import { useParty } from "@/composables/useParty";
import { useSpeciesNameMap } from "@/composables/useSpecies";
import { useNpcs } from "@/composables/useNpcs";
import { useMonsters } from "@/composables/useMonsters";
import CoinFace from "@/components/mint/CoinFace.vue";
import { COIN_METALS, COIN_MOTIFS, COIN_PRINT_SIZES } from "@/types/coin.types";
import type { CoinDesign } from "@/types/coin.types";

// ── Main tabs ──────────────────────────────────────────────────────────────────

const MAIN_TABS = [
  { id: "tokens" as const, label: "Tokens" },
  { id: "coins"  as const, label: "Coins"  },
];
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

const TOKEN_PRINT_SIZES = [
  { id: "s25" as const, label: "25mm", mm: 25, cols: 7, rows: 10, perSheet: 70,
    padH: "17.5mm", padV: "23.5mm" },
  { id: "s32" as const, label: "32mm", mm: 32, cols: 6, rows: 8,  perSheet: 48,
    padH: "9mm",    padV: "20.5mm" },
  { id: "s50" as const, label: "50mm", mm: 50, cols: 4, rows: 5,  perSheet: 20,
    padH: "5mm",    padV: "23.5mm" },
] as const;
type TokenPrintSizeId = (typeof TOKEN_PRINT_SIZES)[number]["id"];

const TOKEN_BACK_STYLES = [
  { id: "mystery" as const, label: "Mystery ?", desc: "Dark disc with ring colour and ?" },
  { id: "mirror"  as const, label: "Mirror",    desc: "Same image as front" },
] as const;
type TokenBackStyleId = (typeof TOKEN_BACK_STYLES)[number]["id"];

interface PrintQueueEntry {
  entity: TokenEntity;
  ringColor: string;
}

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

async function renderMysteryBack(ringColor: string): Promise<string> {
  const size = 512;
  const tmp = document.createElement("canvas");
  tmp.width  = size;
  tmp.height = size;
  const ctx = tmp.getContext("2d")!;
  const cx = size / 2;
  const rw = 20;
  const R  = size / 2;
  const ir = R - rw;

  ctx.beginPath();
  ctx.arc(cx, cx, R, 0, Math.PI * 2);
  ctx.fillStyle = ringColor;
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cx, ir, 0, Math.PI * 2);
  ctx.clip();
  const grad = ctx.createRadialGradient(cx, cx * 0.6, 0, cx, cx, ir);
  grad.addColorStop(0, "#1e1e2e");
  grad.addColorStop(1, "#06060f");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "rgba(255,255,255,0.15)";
  ctx.font = `bold ${Math.round(size * 0.38)}px Georgia, serif`;
  ctx.textAlign    = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("?", cx, cx);
  ctx.restore();

  return tmp.toDataURL("image/png");
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
      const v = ++renderVersion;
      await drawToken(frontCanvas, entry.entity, v);
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

// ── Entity abstraction (tokens) ───────────────────────────────────────────────

interface TokenEntity {
  id: string;
  name: string;
  subtitle: string;
  imageUrl: string | null;
  focalPoint: { x: number; y: number } | null;
  bgGradient: [string, string];
}

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
    if (url.startsWith("blob:")) {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = url;
      });
    }
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
  const ir = R - rw;

  ctx.clearRect(0, 0, S, S);

  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fillStyle = settings.value.ringColor;
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, ir, 0, Math.PI * 2);
  ctx.clip();

  const grad = ctx.createRadialGradient(cx, cy * 0.6, 0, cx, cy, ir);
  grad.addColorStop(0, entity.bgGradient[0]);
  grad.addColorStop(1, entity.bgGradient[1]);
  ctx.fillStyle = grad;
  ctx.fillRect(cx - ir, cy - ir, ir * 2, ir * 2);

  if (entity.imageUrl) {
    const img = await loadRemoteImage(entity.imageUrl);
    if (version !== renderVersion) return;
    if (img) {
      const diam   = ir * 2;
      const aspect = img.naturalWidth / img.naturalHeight;
      let dw: number, dh: number;
      if (aspect > 1) { dh = diam; dw = diam * aspect; }
      else             { dw = diam; dh = diam / aspect; }

      // Use focal point to center the subject in the circle.
      // fp is 0-100% of the source image; clamp so image fully covers the inner circle.
      const fp = entity.focalPoint;
      const drawX = fp
        ? Math.min(cx - ir, Math.max(cx + ir - dw, cx - (fp.x / 100) * dw))
        : cx - dw / 2;
      const drawY = fp
        ? Math.min(cy - ir, Math.max(cy + ir - dh, cy - (fp.y / 100) * dh))
        : cy - dh / 2;
      ctx.drawImage(img, drawX, drawY, dw, dh);
    }
  }

  if (!entity.imageUrl) {
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.font      = `bold ${Math.round(S * 0.34)}px Georgia, serif`;
    ctx.textAlign    = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(entity.name.charAt(0).toUpperCase(), cx, cy);
  }

  ctx.restore();

  if (settings.value.showName) {
    const fontSize = Math.round(S * 0.083);
    ctx.font = `bold ${fontSize}px Georgia, serif`;

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
    const totalA  = totalW / arcR;

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
.mint-print-layout {
  display: none;
}

@media print {
  /* Hide the screen UI, leave print layouts visible */
  .mint-screen {
    display: none !important;
  }

  .mint-print-layout {
    display: block;
  }

  .mint-print-sheet {
    display: grid;
    width: 210mm;
    height: 296.9mm;
    max-height: 296.9mm;
    overflow: hidden;
    page-break-inside: avoid;
    break-inside: avoid;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    box-sizing: border-box;
  }

  /* Small: 24mm × 7 cols × 10 rows — centred on A4 */
  .coin-grid-small {
    grid-template-columns: repeat(7, 24mm);
    grid-template-rows: repeat(10, 24mm);
    padding: 18.5mm 21mm;
    gap: 0;
  }

  /* Standard: 30mm × 6 cols × 8 rows */
  .coin-grid-standard {
    grid-template-columns: repeat(6, 30mm);
    grid-template-rows: repeat(8, 30mm);
    padding: 28.5mm 15mm;
    gap: 0;
  }

  /* Large: 38mm × 5 cols × 7 rows */
  .coin-grid-large {
    grid-template-columns: repeat(5, 38mm);
    grid-template-rows: repeat(7, 38mm);
    padding: 15.5mm 10mm;
    gap: 0;
  }

  .mint-coin-cell {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
  }

  .mint-coin-svg {
    width: 100%;
    height: 100%;
  }

  /* Show only the sheet type that triggered print */
  .print-coins  .mint-coin-print  { display: block; }
  .print-coins  .mint-token-print { display: none;  }
  .print-tokens .mint-token-print { display: block; }
  .print-tokens .mint-coin-print  { display: none;  }

  /* Token grids */
  .token-grid-s25 {
    grid-template-columns: repeat(7, 25mm);
    grid-template-rows: repeat(10, 25mm);
    padding: 23.5mm 17.5mm;
    gap: 0;
  }
  .token-grid-s32 {
    grid-template-columns: repeat(6, 32mm);
    grid-template-rows: repeat(8, 32mm);
    padding: 20.5mm 9mm;
    gap: 0;
  }
  .token-grid-s50 {
    grid-template-columns: repeat(4, 50mm);
    grid-template-rows: repeat(5, 50mm);
    padding: 23.5mm 5mm;
    gap: 0;
  }

  .mint-token-cell {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
  }

  .mint-token-img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    border-radius: 50%;
  }
}
</style>
