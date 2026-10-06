<template>
  <main class="preview-panel">
    <div v-if="!selectedSubjects.length" class="preview-empty">
      <p>
        Select NPCs, monsters, items, spells, or Interlude cards on the left to preview
        cards.
      </p>
      <p class="preview-hint">
        Selected cards will print front + back on separate A4 sheets.
      </p>
    </div>
    <div v-else class="card-preview-grid">
      <div v-for="subject in selectedSubjects" :key="cardKey(subject)" class="preview-card-slot">
      <div
        class="preview-card-wrapper"
        :class="{ tarot: store.cardSize === 'tarot' }"
        :style="tiltStyle(cardKey(subject))"
        @click="toggleFlip(cardKey(subject))"
        @mousemove="onMouseMove(cardKey(subject), $event)"
        @mouseleave="onMouseLeave(cardKey(subject))"
      >
        <CardFlip :flipped="flipped.has(cardKey(subject))">
          <template #front>
            <!-- Loot mode: LootFront; collection mode: per-style front -->
            <template v-if="store.mode === 'loot'">
              <LootFront
                v-if="subject.kind === 'item'"
                :data="subject.data"
                :tarot="store.cardSize === 'tarot'"
              />
            </template>
            <template v-else>
              <CardTarotFront
                v-if="store.cardSize === 'tarot'"
                :subject="subject"
                :card-style="store.cardStyle"
              />
              <CardFront
                v-else
                :subject="subject"
                :card-style="store.cardStyle"
              />
            </template>
          </template>
          <template #back>
            <!-- Loot mode: shared LootBack; collection mode: per-style back -->
            <LootBack v-if="store.mode === 'loot'" :tarot="store.cardSize === 'tarot'" />
            <template v-else>
              <CardTarotBack
                v-if="store.cardSize === 'tarot'"
                :subject="subject"
                :card-style="store.cardStyle"
              />
              <CardBack
                v-else
                :subject="subject"
                :card-style="store.cardStyle"
              />
            </template>
          </template>
        </CardFlip>
      </div>
      <!-- Outside the flip wrapper so a click here never turns the card. -->
      <PaintPortraitButton
        v-if="paintable(subject)"
        :loading="isPainting(subject)"
        :disabled="isPaintingAny"
        :cost="cost"
        :byok="byok"
        :error="errorFor(subject)"
        @paint="paint(subject)"
      />
      </div>
    </div>
  </main>
</template>

<script setup lang="ts">
import { ref } from "vue";
import CardFront from "@/components/cardforge/CardFront.vue";
import CardBack from "@/components/cardforge/CardBack.vue";
import CardTarotFront from "@/components/cardforge/CardTarotFront.vue";
import CardTarotBack from "@/components/cardforge/CardTarotBack.vue";
import LootFront from "@/components/cardforge/styles/loot/LootFront.vue";
import LootBack from "@/components/cardforge/styles/loot/LootBack.vue";
import CardFlip from "@/components/common/CardFlip.vue";
import PaintPortraitButton from "@/components/common/PaintPortraitButton.vue";
import { useCardPortraitPainter } from "@/composables/cardforge/useCardPortraitPainter";
import { cardSubjectId, type CardSubject } from "@/types/card.types";
import { useCardForgeStore } from "@/stores/cardForge";
import { useCardForgeData } from "@/composables/cardforge/useCardForgeData";

const store = useCardForgeStore();
const { selectedSubjects } = useCardForgeData();

function cardKey(s: CardSubject) {
  // A downtime archetype is keyed by `key`, not `id` — `cardSubjectId` owns that.
  return s.kind + cardSubjectId(s);
}

const { paintable, paint, isPainting, isPaintingAny, cost, byok, errorFor } = useCardPortraitPainter();

const flipped = ref(new Set<string>());
function toggleFlip(key: string) {
  const next = new Set(flipped.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  flipped.value = next;
}

const tilts = ref(new Map<string, { rx: number; ry: number }>());
function onMouseMove(key: string, e: MouseEvent) {
  const el = e.currentTarget as HTMLElement;
  const rect = el.getBoundingClientRect();
  const dx = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
  const dy = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
  const next = new Map(tilts.value);
  next.set(key, { rx: -dy * 6, ry: dx * 6 });
  tilts.value = next;
}
function onMouseLeave(key: string) {
  const next = new Map(tilts.value);
  next.delete(key);
  tilts.value = next;
}
function tiltStyle(key: string): Record<string, string> {
  const t = tilts.value.get(key);
  if (!t) return {};
  return {
    transform: `perspective(900px) rotateX(${t.rx}deg) rotateY(${t.ry}deg) translateY(-6px)`,
  };
}
</script>

<style scoped>
@reference "@/assets/main.css";

.preview-panel {
  @apply flex-1 overflow-y-auto min-h-0;
}
.preview-empty {
  @apply flex flex-col items-center justify-center h-full gap-2 text-center;
  p {
    @apply text-body text-muted-foreground;
  }
}
.preview-hint {
  @apply text-xs opacity-60;
}
.card-preview-grid {
  @apply flex flex-wrap gap-4 p-6 content-start;
}
.preview-card-slot {
  @apply flex flex-col items-center gap-2;
}
.preview-card-wrapper {
  cursor: pointer;
  transition: transform 0.18s ease, filter 0.18s ease;
}
</style>
