<template>
  <div class="lf-shell" :class="{ tarot }" :style="cssVars">
    <!-- Full-bleed art -->
    <div class="lf-art">
      <FocalImage
        v-if="portrait"
        :src="portrait"
        format="portrait"
        :focal-point="data.image_focal_point"
        print
      />
      <div v-else class="lf-art-ph">
        <span class="lf-art-glyph">
          {{ (data.item_type ?? "I").charAt(0).toUpperCase() }}
        </span>
      </div>
    </div>

    <div class="lf-scrim" />

    <!-- Diagonal kind tag (Modern's signature look) -->
    <div class="lf-tag">{{ typeTag }}</div>
    <div v-if="data.cost" class="lf-cost">{{ data.cost }}</div>

    <div class="lf-bottom">
      <div class="lf-name">{{ data.name }}</div>
      <div class="lf-sub">{{ typeLine }}</div>

      <div v-if="metaRows.length" class="lf-meta">
        <div v-for="row in metaRows" :key="row.label" class="lf-meta-row">
          <span class="lf-meta-key">{{ row.label }}</span>
          <span class="lf-meta-val">{{ row.value }}</span>
        </div>
      </div>

      <div v-if="descriptionText" class="lf-desc">
        {{ descriptionText }}
      </div>

      <div v-if="data.attunement_requirements" class="lf-flavor">
        Attunement: {{ truncate(data.attunement_requirements, tarot ? 90 : 60) }}
      </div>
    </div>

    <div class="lf-wm">DUNGEON GRIMOIRE</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { Item } from "@/types/item.types";
import FocalImage from "@/components/common/FocalImage.vue";
import { extractTiptapText } from "@/lib/utils";
import { accentForItem, paper } from "../tokens.shared";
import { useItemCardData } from "@/composables/cardforge/useItemCardData";

const { data, tarot = false } = defineProps<{ data: Item; tarot?: boolean }>();

const { portrait, typeTag, typeLine, metaRows, truncate } = useItemCardData(
  () => data,
);

const accent = computed(() => accentForItem(data));

const cssVars = computed(() => ({
  "--acc-tag": accent.value.tag,
  "--acc-line": accent.value.line,
  "--acc-text": accent.value.text,
  "--lf-bg": "#15110d",
  "--lf-text": "#ffffff",
  "--lf-text-sub": paper.dim,
  "--lf-text-muted": paper.faint,
}));

const descriptionText = computed(() =>
  extractTiptapText(data.description, tarot ? 400 : 320),
);
</script>

<style scoped>
.lf-shell {
  position: relative;
  width: 200px;
  height: 280px;
  border-radius: 14px;
  overflow: hidden;
  background: var(--lf-bg);
  border: 1px solid color-mix(in srgb, var(--acc-line) 35%, transparent);
  box-shadow: 0 8px 22px rgba(0, 0, 0, 0.7);
  flex-shrink: 0;
  font-family: "Inter", system-ui, sans-serif;
  color: var(--lf-text);
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.lf-shell.tarot {
  width: 222px;
  height: 381px;
}

.lf-art {
  position: absolute;
  inset: 0;
  overflow: hidden;
}
.lf-art-ph {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(160deg, color-mix(in srgb, var(--acc-line) 60%, var(--lf-bg)), var(--lf-bg));
}
.lf-art-glyph {
  font-family: "Cinzel", serif;
  font-size: 60px;
  font-weight: 800;
  color: rgba(255, 255, 255, 0.1);
}

.lf-scrim {
  position: absolute;
  inset: 0;
  z-index: 1;
  background: linear-gradient(
    180deg,
    rgba(15, 17, 13, 0.55) 0%,
    rgba(15, 17, 13, 0) 14%,
    rgba(15, 17, 13, 0) 38%,
    rgba(15, 17, 13, 0.85) 55%,
    var(--lf-bg) 70%,
    var(--lf-bg) 100%
  );
}

/* Modern's signature diagonal kind tag — top-left, dark-on-accent */
.lf-tag {
  position: absolute;
  top: 10px;
  left: 0;
  z-index: 3;
  background: var(--acc-tag);
  color: var(--acc-text);
  font-size: 7px;
  font-weight: 800;
  letter-spacing: 0.12em;
  padding: 3px 14px 3px 10px;
  text-transform: uppercase;
  clip-path: polygon(0 0, 100% 0, calc(100% - 8px) 100%, 0 100%);
}
.lf-cost {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 3;
  background: rgba(0, 0, 0, 0.55);
  color: var(--lf-text);
  font-size: 7px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 3px;
  border: 1px solid color-mix(in srgb, var(--acc-line) 67%, rgba(255, 255, 255, 0.4));
  white-space: nowrap;
}

.lf-bottom {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  top: 50%;
  z-index: 2;
  padding: 0 12px 10px;
  display: flex;
  flex-direction: column;
  gap: 3px;
  overflow: hidden;
}
.lf-shell.tarot .lf-bottom {
  top: 52%;
}

.lf-name {
  font-family: "Cormorant Garamond", serif;
  font-size: 18px;
  font-weight: 600;
  line-height: 1.05;
  color: var(--lf-text);
  text-shadow: 0 0 8px rgba(0, 0, 0, 0.95);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  flex-shrink: 0;
}
.lf-shell.tarot .lf-name {
  font-size: 22px;
}
.lf-sub {
  font-size: 7.5px;
  font-style: italic;
  color: var(--lf-text-sub);
  margin-bottom: 3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex-shrink: 0;
}

.lf-meta {
  display: flex;
  flex-direction: column;
  gap: 1px;
  border-top: 1px solid color-mix(in srgb, var(--acc-line) 50%, rgba(255, 255, 255, 0.2));
  padding-top: 4px;
  flex-shrink: 0;
}
.lf-meta-row {
  display: flex;
  align-items: baseline;
  gap: 4px;
}
.lf-meta-key {
  font-size: 5.5px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--acc-text);
  flex-shrink: 0;
  width: 36px;
}
.lf-meta-val {
  font-family: "Cormorant Garamond", serif;
  font-size: 8px;
  color: var(--lf-text-sub);
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lf-desc {
  flex: 1;
  overflow: hidden;
  font-family: "Cormorant Garamond", serif;
  font-size: 8.5px;
  line-height: 1.35;
  color: var(--lf-text-sub);
  text-wrap: pretty;
  margin-top: 3px;
  border-top: 1px solid color-mix(in srgb, var(--acc-line) 30%, rgba(255, 255, 255, 0.15));
  padding-top: 3px;
}

.lf-flavor {
  font-family: "Cormorant Garamond", serif;
  font-style: italic;
  font-size: 7.5px;
  color: var(--lf-text-muted);
  text-align: center;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  padding-top: 3px;
  flex-shrink: 0;
}

.lf-wm {
  position: absolute;
  bottom: 4px;
  left: 0;
  right: 0;
  z-index: 10;
  text-align: center;
  font-family: "Cinzel", serif;
  font-size: 5px;
  font-weight: 800;
  letter-spacing: 0.18em;
  color: var(--lf-text-muted);
  opacity: 0.5;
  pointer-events: none;
}
</style>
