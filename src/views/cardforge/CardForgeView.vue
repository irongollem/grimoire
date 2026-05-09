<template>
  <div class="forge-root">
    <!-- ── Screen UI (hidden in print) ───────────────────── -->
    <div class="screen-panel">
      <div class="forge-topbar">
        <div>
          <h1 class="forge-title">Card Forge</h1>
          <p class="forge-sub">
            Craft printable cards for your NPCs, monsters, items &amp; spells
          </p>
        </div>

        <div class="topbar-actions">
          <!-- Card size selector -->
          <div class="size-toggle">
            <button
              v-for="sz in CARD_SIZES"
              :key="sz.id"
              type="button"
              class="size-btn"
              :class="{ active: cardSize === sz.id }"
              @click="cardSize = sz.id"
            >
              {{ sz.label }}
            </button>
          </div>

          <!-- Card style selector -->
          <div class="size-toggle">
            <button
              v-for="st in CARD_STYLES"
              :key="st.id"
              type="button"
              class="size-btn"
              :class="{ active: cardStyle === st.id }"
              @click="cardStyle = st.id"
            >{{ st.label }}</button>
          </div>

          <!-- Library actions -->
          <button
            v-if="savedLibrary.length"
            type="button"
            class="lib-btn"
            @click="showLoadModal = true"
          >
            Load Collection
          </button>
          <button
            v-if="selectedSubjects.length"
            type="button"
            class="lib-btn"
            @click="showSaveModal = true"
          >
            Save Collection
          </button>

          <button
            type="button"
            class="print-btn"
            :disabled="!selectedSubjects.length"
            @click="printCards"
          >
            Print
            {{ selectedSubjects.length ? `(${selectedSubjects.length})` : "" }}
          </button>
        </div>
        <p class="duplex-hint">
          Prints fronts then backs. For double-sided printing, flip on the long
          (left) edge — backs are column-reversed so they align.
        </p>
      </div>

      <div class="forge-body">
        <!-- Left: Source selector + list -->
        <aside class="source-panel">
          <!-- Source tabs -->
          <div class="source-tabs">
            <button
              v-for="src in SOURCES"
              :key="src.id"
              type="button"
              class="src-tab"
              :class="{ active: source === src.id }"
              @click="source = src.id"
            >
              {{ src.label }}
              <span v-if="selectedIds[src.id].size" class="tab-count">{{
                selectedIds[src.id].size
              }}</span>
            </button>
          </div>

          <!-- Search -->
          <label class="block">
            <span class="sr-only">Search</span>
            <input
              v-model="search"
              placeholder="Search…"
              class="search-input"
            />
          </label>

          <!-- Select all / none -->
          <div class="selection-header">
            <span class="selection-count"
              >{{ filteredList.length }} entries</span
            >
            <button type="button" class="sel-action" @click="selectAll">
              All
            </button>
            <button type="button" class="sel-action" @click="clearAll">
              None
            </button>
          </div>

          <!-- List -->
          <div class="entity-list">
            <label
              v-for="item in filteredList"
              :key="item.id"
              class="entity-row"
            >
              <input
                type="checkbox"
                :checked="selectedIds[source].has(item.id)"
                @change="toggleSelect(item.id)"
              />
              <div class="entity-info">
                <span class="entity-name">{{ item.name }}</span>
                <span class="entity-sub">{{ item.sub }}</span>
              </div>
            </label>
            <p v-if="!filteredList.length" class="empty-list">No results</p>
          </div>
        </aside>

        <!-- Right: Preview -->
        <main class="preview-panel">
          <div v-if="!selectedSubjects.length" class="preview-empty">
            <p>
              Select NPCs, monsters, items, or spells on the left to preview
              cards.
            </p>
            <p class="preview-hint">
              Selected cards will print front + back on separate A4 sheets.
            </p>
          </div>
          <div v-else class="card-preview-grid">
            <div
              v-for="subject in selectedSubjects"
              :key="subject.kind + subject.data.id"
              class="preview-card-wrapper"
              :class="{ tarot: cardSize === 'tarot' }"
              :style="tiltStyle(subject.kind + subject.data.id)"
              @click="toggleFlip(subject.kind + subject.data.id)"
              @mousemove="onCardMouseMove(subject.kind + subject.data.id, $event)"
              @mouseleave="onCardMouseLeave(subject.kind + subject.data.id)"
            >
              <Transition name="card-flip" mode="out-in">
                <div v-if="!flippedCards.has(subject.kind + subject.data.id)" key="front">
                  <CardTarotFront v-if="cardSize === 'tarot'" :subject="subject" :card-style="cardStyle" />
                  <CardFront v-else :subject="subject" :card-style="cardStyle" />
                </div>
                <div v-else key="back">
                  <CardTarotBack v-if="cardSize === 'tarot'" :subject="subject" :card-style="cardStyle" />
                  <CardBack v-else :subject="subject" :card-style="cardStyle" />
                </div>
              </Transition>
            </div>
          </div>
        </main>
      </div>
    </div>

    <!-- ── Save collection modal ─────────────────────────── -->
    <div
      v-if="showSaveModal"
      class="modal-backdrop"
      @click.self="showSaveModal = false"
    >
      <div class="modal-box">
        <h2 class="modal-title">Save Collection</h2>
        <label class="block">
          <span class="modal-label">Collection name</span>
          <input
            v-model="saveCollectionName"
            class="modal-input"
            placeholder="My Boss Monsters…"
          />
        </label>
        <div class="modal-actions">
          <button
            type="button"
            class="modal-cancel"
            @click="showSaveModal = false"
          >
            Cancel
          </button>
          <button
            type="button"
            class="modal-confirm"
            :disabled="!saveCollectionName.trim()"
            @click="saveCollection"
          >
            Save
          </button>
        </div>
      </div>
    </div>

    <!-- ── Load collection modal ─────────────────────────── -->
    <div
      v-if="showLoadModal"
      class="modal-backdrop"
      @click.self="showLoadModal = false"
    >
      <div class="modal-box">
        <h2 class="modal-title">Card Library</h2>
        <div class="library-list">
          <div v-for="col in savedLibrary" :key="col.id" class="library-entry">
            <div class="library-info">
              <span class="library-name">{{ col.name }}</span>
              <span class="library-meta"
                >{{ col.items.length }} cards ·
                {{ formatDate(col.created) }}</span
              >
            </div>
            <div class="library-btns">
              <button
                type="button"
                class="lib-load-btn"
                @click="loadCollection(col)"
              >
                Load
              </button>
              <button
                type="button"
                class="lib-del-btn"
                @click="deleteCollection(col.id)"
              >
                ×
              </button>
            </div>
          </div>
        </div>
        <div class="modal-actions">
          <button
            type="button"
            class="modal-cancel"
            @click="showLoadModal = false"
          >
            Close
          </button>
        </div>
      </div>
    </div>

    <!-- ── Print layout (hidden on screen, shown when printing) ── -->
    <div class="print-layout">
      <template v-for="(chunk, pi) in printChunks" :key="pi">
        <!-- Front sheet -->
        <div
          class="print-sheet"
          :class="cardSize === 'tarot' ? 'tarot-sheet' : 'mtg-sheet'"
        >
          <template v-for="(subject, ci) in chunk" :key="ci">
            <template v-if="subject">
              <CardTarotFront
                v-if="cardSize === 'tarot'"
                :subject="subject"
                :card-style="cardStyle"
                class="print-card"
              />
              <CardFront v-else :subject="subject" :card-style="cardStyle" class="print-card" />
            </template>
            <div v-else class="print-card print-card-empty" />
          </template>
        </div>

        <!-- Back sheet (columns reversed per row for duplex alignment) -->
        <div
          class="print-sheet"
          :class="cardSize === 'tarot' ? 'tarot-sheet' : 'mtg-sheet'"
        >
          <template v-for="(subject, ci) in backOrder(chunk)" :key="ci">
            <template v-if="subject">
              <CardTarotBack
                v-if="cardSize === 'tarot'"
                :subject="subject"
                :card-style="cardStyle"
                class="print-card"
              />
              <CardBack v-else :subject="subject" :card-style="cardStyle" class="print-card" />
            </template>
            <div v-else class="print-card print-card-empty" />
          </template>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, shallowRef, watch } from "vue";
import CardFront from "@/components/cardforge/CardFront.vue";
import CardBack from "@/components/cardforge/CardBack.vue";
import CardTarotFront from "@/components/cardforge/CardTarotFront.vue";
import CardTarotBack from "@/components/cardforge/CardTarotBack.vue";
import type { CardSubject } from "@/types/card.types";
import { useNpcs } from "@/composables/useNpcs";
import { useAllMonsters } from "@/composables/useMonsters";
import { useItems } from "@/composables/useItems";
import { useAllSpells } from "@/composables/useSpells";
import type { Npc } from "@/types/npc.types";
import type { Monster } from "@/types/monster.types";
import type { Item } from "@/types/item.types";
import { ITEM_TYPE_LABELS, ITEM_RARITY_LABELS } from "@/types/item.types";
import type { Spell } from "@/types/spell.types";
import { spellLevelLabel } from "@/types/spell.types";

// ── Card sizes ──────────────────────────────────────────
const CARD_SIZES = [
  { id: "mtg", label: "Trading card (63×88mm)", cols: 3, perPage: 9 },
  { id: "tarot", label: "Tarot (70×120mm)", cols: 2, perPage: 4 },
] as const;
type CardSizeId = "mtg" | "tarot";
const cardSize = ref<CardSizeId>("mtg");

// ── Card styles ─────────────────────────────────────────
const CARD_STYLES = [
  { id: "inked",  label: "Inked" },
  { id: "modern", label: "Modern" },
] as const;
type CardStyleId = "inked" | "modern";

const cardStyle = ref<CardStyleId>(
  (localStorage.getItem("cardforge_style") as CardStyleId) ?? "inked"
);
watch(cardStyle, (v) => localStorage.setItem("cardforge_style", v));

// ── Sources ─────────────────────────────────────────────
const SOURCES = [
  { id: "npcs" as const, label: "NPCs" },
  { id: "monsters" as const, label: "Monsters" },
  { id: "items" as const, label: "Items" },
  { id: "spells" as const, label: "Spells" },
];
type SourceId = "npcs" | "monsters" | "items" | "spells";
const source = ref<SourceId>("npcs");

// ── Data ────────────────────────────────────────────────
const { data: npcsData } = useNpcs();
const { data: monstersData } = useAllMonsters();
const { data: itemsData } = useItems();
const { data: spellsData } = useAllSpells();

// ── Search + selection ──────────────────────────────────
const search = ref("");

// shallowRef keeps the Sets as plain Sets (deep ref mangles Set types)
const selectedIds = shallowRef<Record<SourceId, Set<string>>>({
  npcs: new Set(),
  monsters: new Set(),
  items: new Set(),
  spells: new Set(),
});

interface ListItem {
  id: string;
  name: string;
  sub: string;
}

const filteredList = computed((): ListItem[] => {
  const q = search.value.trim().toLowerCase();
  if (source.value === "npcs") {
    return (npcsData.value ?? [])
      .filter(
        (n: Npc) =>
          n.name.toLowerCase().includes(q) ||
          (n.occupation ?? "").toLowerCase().includes(q) ||
          (n.race ?? "").toLowerCase().includes(q),
      )
      .map((n: Npc) => ({
        id: n.id,
        name: n.name,
        sub: [n.race, n.occupation].filter(Boolean).join(" · "),
      }));
  }
  if (source.value === "monsters") {
    return (monstersData.value ?? [])
      .filter(
        (m: Monster) =>
          m.name.toLowerCase().includes(q) ||
          m.monster_type.includes(q) ||
          (m.habitat ?? "").toLowerCase().includes(q),
      )
      .map((m: Monster) => ({
        id: m.id,
        name: m.name,
        sub: `${m.size} ${m.monster_type} · CR ${m.stat_block?.challenge_rating ?? "?"}`,
      }));
  }
  if (source.value === "items") {
    return (itemsData.value ?? [])
      .filter(
        (i: Item) =>
          i.name.toLowerCase().includes(q) ||
          (i.item_type ?? "").toLowerCase().includes(q) ||
          i.rarity.includes(q),
      )
      .map((i: Item) => ({
        id: i.id,
        name: i.name,
        sub: [
          ITEM_RARITY_LABELS[i.rarity],
          ITEM_TYPE_LABELS[i.item_type],
          i.subtype,
        ]
          .filter(Boolean)
          .join(" · "),
      }));
  }
  // spells
  return (spellsData.value ?? [])
    .filter(
      (s: Spell) =>
        s.name.toLowerCase().includes(q) ||
        s.school.includes(q) ||
        (s.classes ?? []).some((c: string) => c.toLowerCase().includes(q)),
    )
    .map((s: Spell) => ({
      id: s.id,
      name: s.name,
      sub: `${spellLevelLabel(s.level)} · ${s.school}`,
    }));
});

function toggleSelect(id: string) {
  const src = source.value;
  const next = new Set(selectedIds.value[src]);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selectedIds.value = { ...selectedIds.value, [src]: next };
}
function selectAll() {
  const src = source.value;
  const next = new Set([
    ...selectedIds.value[src],
    ...filteredList.value.map((i) => i.id),
  ]);
  selectedIds.value = { ...selectedIds.value, [src]: next };
}
function clearAll() {
  selectedIds.value = { ...selectedIds.value, [source.value]: new Set() };
}

// ── Build subjects — aggregates ALL sources ───────────────
const selectedSubjects = computed((): CardSubject[] => {
  const ids = selectedIds.value;
  return [
    ...(npcsData.value ?? [])
      .filter((n: Npc) => ids.npcs.has(n.id))
      .map((n: Npc) => ({ kind: "npc" as const, data: n })),
    ...(monstersData.value ?? [])
      .filter((m: Monster) => ids.monsters.has(m.id))
      .map((m: Monster) => ({ kind: "monster" as const, data: m })),
    ...(itemsData.value ?? [])
      .filter((i: Item) => ids.items.has(i.id))
      .map((i: Item) => ({ kind: "item" as const, data: i })),
    ...(spellsData.value ?? [])
      .filter((s: Spell) => ids.spells.has(s.id))
      .map((s: Spell) => ({ kind: "spell" as const, data: s })),
  ];
});

// ── Card flip + tilt ─────────────────────────────────────
const flippedCards = ref(new Set<string>());
function toggleFlip(key: string) {
  const next = new Set(flippedCards.value);
  if (next.has(key)) next.delete(key); else next.add(key);
  flippedCards.value = next;
}

const cardTilts = ref(new Map<string, { rx: number; ry: number }>());

function onCardMouseMove(key: string, e: MouseEvent) {
  const el = e.currentTarget as HTMLElement;
  const rect = el.getBoundingClientRect();
  const dx = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
  const dy = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
  const next = new Map(cardTilts.value);
  next.set(key, { rx: -dy * 6, ry: dx * 6 });
  cardTilts.value = next;
}

function onCardMouseLeave(key: string) {
  const next = new Map(cardTilts.value);
  next.delete(key);
  cardTilts.value = next;
}

function tiltStyle(key: string): Record<string, string> {
  const t = cardTilts.value.get(key);
  if (!t) return {};
  return {
    transform: `perspective(900px) rotateX(${t.rx}deg) rotateY(${t.ry}deg) translateY(-6px)`,
  };
}

// ── Print chunks ─────────────────────────────────────────
const perPage = computed(
  () => CARD_SIZES.find((s) => s.id === cardSize.value)?.perPage ?? 9,
);
const cols = computed(
  () => CARD_SIZES.find((s) => s.id === cardSize.value)?.cols ?? 3,
);

const printChunks = computed((): (CardSubject | null)[][] => {
  const n = perPage.value;
  const result: (CardSubject | null)[][] = [];
  for (let i = 0; i < selectedSubjects.value.length; i += n) {
    const chunk: (CardSubject | null)[] = selectedSubjects.value.slice(
      i,
      i + n,
    );
    while (chunk.length < n) chunk.push(null);
    result.push(chunk);
  }
  return result;
});

// Reverse columns per row for duplex back alignment
function backOrder(chunk: (CardSubject | null)[]): (CardSubject | null)[] {
  const c = cols.value;
  return chunk.map((_, i) => {
    const row = Math.floor(i / c);
    const col = i % c;
    return chunk[row * c + (c - 1 - col)] ?? null;
  });
}

// ── Print ────────────────────────────────────────────────
function printCards() {
  // Inject @page into <head> at call-time — Safari sometimes ignores @page
  // rules that come from component stylesheets; a <head> style is always honored.
  const STYLE_ID = "cardforge-page-rule";
  if (!document.getElementById(STYLE_ID)) {
    const s = document.createElement("style");
    s.id = STYLE_ID;
    s.textContent = "@page { size: A4 portrait; margin: 0; }";
    document.head.appendChild(s);
  }
  window.print();
}

// ── Card Library (localStorage) ──────────────────────────
interface CardCollection {
  id: string;
  name: string;
  created: string;
  items: Array<{ kind: "npc" | "monster" | "item" | "spell"; id: string }>;
}

const LIBRARY_KEY = "cardforge_library";

function readLibrary(): CardCollection[] {
  try {
    return JSON.parse(localStorage.getItem(LIBRARY_KEY) ?? "[]");
  } catch {
    return [];
  }
}

const savedLibrary = ref<CardCollection[]>(readLibrary());
const showSaveModal = ref(false);
const showLoadModal = ref(false);
const saveCollectionName = ref("");

function saveCollection() {
  const items = selectedSubjects.value.map((s) => ({
    kind: s.kind,
    id: s.data.id,
  }));
  const col: CardCollection = {
    id: crypto.randomUUID(),
    name: saveCollectionName.value.trim(),
    created: new Date().toISOString(),
    items,
  };
  const lib = readLibrary();
  lib.unshift(col);
  localStorage.setItem(LIBRARY_KEY, JSON.stringify(lib));
  savedLibrary.value = lib;
  saveCollectionName.value = "";
  showSaveModal.value = false;
}

function loadCollection(col: CardCollection) {
  const npcIds = col.items.filter((i) => i.kind === "npc").map((i) => i.id);
  const monsterIds = col.items
    .filter((i) => i.kind === "monster")
    .map((i) => i.id);
  const itemIds = col.items.filter((i) => i.kind === "item").map((i) => i.id);
  const spellIds = col.items.filter((i) => i.kind === "spell").map((i) => i.id);

  selectedIds.value = {
    npcs: new Set(npcIds),
    monsters: new Set(monsterIds),
    items: new Set(itemIds),
    spells: new Set(spellIds),
  };
  // Switch to the tab with the most loaded cards
  const counts: Record<SourceId, number> = {
    npcs: npcIds.length,
    monsters: monsterIds.length,
    items: itemIds.length,
    spells: spellIds.length,
  };
  source.value =
    (Object.entries(counts).sort(([, a], [, b]) => b - a)[0][0] as SourceId) ??
    "npcs";
  showLoadModal.value = false;
}

function deleteCollection(id: string) {
  const lib = readLibrary().filter((c) => c.id !== id);
  localStorage.setItem(LIBRARY_KEY, JSON.stringify(lib));
  savedLibrary.value = lib;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
</script>

<!-- Global print styles: @page must be top-level (not inside @media print) -->
<style>
@page {
  size: A4 portrait;
  margin: 0;
}

@media print {
  /* Hide app shell chrome so only the card sheets print */
  aside,
  header,
  .chat-no-print {
    display: none !important;
  }
  /* Flatten the Vue layout chain so no flex container constrains print flow */
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
  /* Strip screen-only decorative effects from card shells.
     CardFront/Back use fragment roots + inheritAttrs:false so print-card
     class never reaches the shell — target shell classes directly. */
  .ik-shell, .md-shell, .loot-shell {
    box-shadow: none !important;
    transition: none !important;
    animation: none !important;
  }
}
</style>

<style scoped>
@reference "@/assets/main.css";

/* ── Layout ────────────────────────────────────────────── */
.forge-root {
  @apply min-h-screen;
}

.screen-panel {
  @apply flex flex-col gap-4 p-4 h-screen;
}

/* Topbar */
.forge-topbar {
  @apply flex items-start justify-between gap-4 flex-wrap shrink-0;
}
.forge-title {
  @apply font-cinzel text-2xl font-bold text-foreground;
}
.forge-sub {
  @apply font-fell text-sm text-muted-foreground;
}
.topbar-actions {
  @apply flex items-center gap-2 flex-wrap;
}

/* Size toggle */
.size-toggle {
  @apply flex rounded-md overflow-hidden border border-border;
}
.size-btn {
  @apply font-cinzel text-xs font-semibold px-3 py-1.5 text-muted-foreground bg-card transition-colors;
}
.size-btn.active {
  @apply bg-primary text-primary-foreground;
}

/* Library / Print buttons */
.lib-btn {
  @apply font-cinzel text-xs font-semibold px-3 py-1.5 rounded-md border border-border bg-card text-muted-foreground hover:text-foreground transition-colors;
}
.print-btn {
  @apply inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity disabled:opacity-40;
}

/* Body layout */
.forge-body {
  @apply flex gap-4 flex-1 min-h-0;
}

/* Source panel */
.source-panel {
  @apply w-64 shrink-0 flex flex-col gap-2 min-h-0;
}
.source-tabs {
  @apply flex rounded-md overflow-hidden border border-border shrink-0;
}
.src-tab {
  @apply flex-1 font-cinzel text-xs font-semibold py-1.5 text-muted-foreground bg-card transition-colors;
}
.src-tab.active {
  @apply bg-primary/20 text-primary;
}
.tab-count {
  @apply ml-1 inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground font-cinzel text-[9px] font-bold w-4 h-4;
}

.search-input {
  @apply w-full bg-muted border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring;
}

.selection-header {
  @apply flex items-center gap-2 shrink-0;
}
.selection-count {
  @apply font-cinzel text-xs text-muted-foreground flex-1;
}
.sel-action {
  @apply font-cinzel text-xs font-semibold text-primary hover:opacity-80;
}

.entity-list {
  @apply flex-1 overflow-y-auto flex flex-col gap-0.5 min-h-0;
}
.entity-row {
  @apply flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-muted/60 transition-colors;
}
.entity-row input[type="checkbox"] {
  @apply accent-primary shrink-0;
}
.entity-info {
  @apply flex flex-col min-w-0;
}
.entity-name {
  @apply font-cinzel text-xs font-semibold text-foreground truncate;
}
.entity-sub {
  @apply font-fell text-xs text-muted-foreground truncate capitalize;
}
.empty-list {
  @apply font-fell text-sm text-muted-foreground text-center py-8 italic;
}

/* Preview panel */
.preview-panel {
  @apply flex-1 overflow-y-auto min-h-0;
}
.preview-empty {
  @apply flex flex-col items-center justify-center h-full gap-2 text-center;
  p {
    @apply font-fell text-muted-foreground text-sm;
  }
}
.preview-hint {
  @apply text-xs opacity-60;
}
.card-preview-grid {
  @apply flex flex-wrap gap-4 p-6 content-start;
}
.preview-card-wrapper {
  cursor: pointer;
  transition: transform 0.18s ease, filter 0.18s ease;
}
.card-flip-enter-active,
.card-flip-leave-active {
  transition: transform 0.18s ease-in-out;
}
.card-flip-enter-from,
.card-flip-leave-to {
  transform: scaleX(0);
}

/* ── Modals ─────────────────────────────────────────────── */
.modal-backdrop {
  @apply fixed inset-0 bg-black/60 flex items-center justify-center z-50;
}
.modal-box {
  @apply bg-card border border-border rounded-xl p-6 w-full max-w-md flex flex-col gap-4;
}
.modal-title {
  @apply font-cinzel text-lg font-bold text-foreground;
}
.modal-label {
  @apply block font-cinzel text-xs font-semibold text-muted-foreground mb-1;
}
.modal-input {
  @apply w-full bg-muted border border-border rounded-md px-3 py-2 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring;
}
.modal-actions {
  @apply flex gap-2 justify-end;
}
.modal-cancel {
  @apply font-cinzel text-xs font-semibold px-4 py-2 rounded-md border border-border text-muted-foreground hover:text-foreground transition-colors;
}
.modal-confirm {
  @apply font-cinzel text-xs font-semibold px-4 py-2 rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40 transition-opacity;
}

/* Library list */
.library-list {
  @apply flex flex-col gap-2 max-h-80 overflow-y-auto;
}
.library-entry {
  @apply flex items-center gap-3 p-3 rounded-lg bg-muted border border-border;
}
.library-info {
  @apply flex flex-col flex-1 min-w-0;
}
.library-name {
  @apply font-cinzel text-sm font-semibold text-foreground;
}
.library-meta {
  @apply font-fell text-xs text-muted-foreground;
}
.library-btns {
  @apply flex gap-1;
}
.lib-load-btn {
  @apply font-cinzel text-xs font-semibold px-2 py-1 rounded bg-primary/20 text-primary hover:bg-primary/30 transition-colors;
}
.lib-del-btn {
  @apply font-cinzel text-sm font-bold px-2 py-1 rounded text-muted-foreground hover:text-destructive transition-colors;
}

/* ── Print layout ────────────────────────────────────────── */
.print-layout {
  display: none;
}
.duplex-hint {
  @apply font-fell text-xs text-muted-foreground italic w-full mt-0.5;
}

@media print {
  .forge-root {
    min-height: 0 !important;
    height: auto !important;
  }
  .screen-panel {
    display: none !important;
  }
  .modal-backdrop {
    display: none !important;
  }
  .print-layout {
    display: block;
  }
  .print-sheet {
    display: grid;
    width: 210mm;
    /*
     * 296.9mm = 0.1mm shorter than A4 (297mm).
     * Each sheet leaves a 0.1mm gap at the bottom of its page.
     * page-break-inside: avoid tells the browser: if a sheet doesn't fully
     * fit on the current page, move it entirely to the next page.
     * Since only 0.1mm remains after each sheet, the NEXT sheet can't fit
     * and is bumped to the following page — no explicit break-after/before
     * needed, which avoids Safari's blank-page bug with those properties.
     */
    height: 296.9mm;
    max-height: 296.9mm;
    overflow: hidden;
    page-break-inside: avoid;
    break-inside: avoid;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  /* MTG: 3×3 grid on A4, 5mm gap between cards.
   * H: 2×5.5mm padding + 3×63mm cards + 2×5mm gaps = 210mm ✓
   * V: 2×11.45mm padding + 3×88mm cards + 2×5mm gaps = 296.9mm ✓ */
  .mtg-sheet {
    grid-template-columns: repeat(3, 63mm);
    grid-template-rows: repeat(3, 88mm);
    padding: 11.45mm 5.5mm;
    gap: 5mm;
  }
  /* Tarot: 2×2 grid on A4, 5mm gap between cards.
   * H: 2×32.5mm padding + 2×70mm cards + 1×5mm gap = 210mm ✓
   * V: 2×25.95mm padding + 2×120mm cards + 1×5mm gap = 296.9mm ✓ */
  .tarot-sheet {
    grid-template-columns: repeat(2, 70mm);
    grid-template-rows: repeat(2, 120mm);
    padding: 25.95mm 32.5mm;
    gap: 5mm;
  }
  /* Card sizing: 1mm bleed each side so colours fully cover cut lines */
  .mtg-sheet .print-card {
    width: 65mm !important; /* 63mm + 1mm bleed each side */
    height: 90mm !important; /* 88mm + 1mm bleed each side */
    margin: -1mm !important;
    border-radius: 3mm !important;
    overflow: hidden;
  }
  .tarot-sheet .print-card {
    width: 72mm !important; /* 70mm + 1mm bleed each side */
    height: 122mm !important; /* 120mm + 1mm bleed each side */
    margin: -1mm !important;
    border-radius: 3mm !important;
    overflow: hidden;
  }
  .print-card-empty {
    background: transparent;
  }
}
</style>
